from pathlib import Path
from typing import Any

import httpx
from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from app.agent import AgentEvent, run_investigation
from app.config import settings
from app.fixtures import FixtureService, IncidentNotFoundError
from app.memory import ApprovalStatus, get_memory_service
from app.memory.schemas import MemoryStatus, RunbookStatus

_PROJECT_ROOT = Path(__file__).parent.parent.parent
INCIDENTS_DIR = _PROJECT_ROOT / "data" / "incidents"

app = FastAPI(title="EpistemicOps", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_fixtures = FixtureService(INCIDENTS_DIR)


async def _probe(url: str, timeout: float = 3.0) -> bool:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url)
            return r.is_success
    except Exception:
        return False


@app.get("/health")
async def health() -> dict[str, Any]:
    """
    Backend is always reported healthy.
    Ollama and Hindsight probes are informational; they never affect HTTP status.
    """
    ollama_ok = await _probe(f"{settings.ollama_base_url}/api/tags")
    hindsight_ok = await _probe(f"{settings.hindsight_base_url}/health/live")
    return {
        "status": "ok",
        "service": "epistemicops-backend",
        "services": {
            "ollama": {
                "status": "ok" if ollama_ok else "unreachable",
                "url": settings.ollama_base_url,
            },
            "hindsight": {
                "status": "ok" if hindsight_ok else "unreachable",
                "url": settings.hindsight_base_url,
            },
        },
    }


@app.get("/api/incidents")
def list_incidents() -> list[dict[str, Any]]:
    """Return all incident fixtures (public fields only; ground truth excluded)."""
    return _fixtures.list_incidents()


@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str) -> dict[str, Any]:
    """Return a single incident by id (public fields only; ground truth excluded)."""
    try:
        return _fixtures.get_incident(incident_id)
    except IncidentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/incidents/{incident_id}/logs")
def get_logs(incident_id: str) -> list[str]:
    """Return log lines for an incident."""
    try:
        return _fixtures.get_logs(incident_id)
    except IncidentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/incidents/{incident_id}/metrics")
def get_metrics(incident_id: str) -> dict[str, Any]:
    """Return metric snapshot for an incident."""
    try:
        return _fixtures.get_metrics(incident_id)
    except IncidentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/incidents/{incident_id}/trace")
def get_trace(incident_id: str) -> Any:
    """Return distributed trace data, or null if the incident has none."""
    try:
        return _fixtures.get_trace(incident_id)
    except IncidentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/incidents/{incident_id}/pods")
def get_pod_status(incident_id: str) -> Any:
    """Return Kubernetes pod status, or null if unavailable."""
    try:
        return _fixtures.get_pod_status(incident_id)
    except IncidentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/investigate/{incident_id}")
async def investigate_incident(incident_id: str) -> EventSourceResponse:
    """Stream the agent investigation as Server-Sent Events.

    Each event is a JSON-encoded AgentEvent.  The stream ends after
    run_completed or run_failed is emitted.
    """

    async def generate():
        try:
            async for event in run_investigation(incident_id, _fixtures):
                yield {"data": event.model_dump_json()}
        except Exception as exc:
            err = AgentEvent(event="run_failed", data={"error": str(exc)})
            yield {"data": err.model_dump_json()}

    return EventSourceResponse(generate())


# ── memory endpoints ───────────────────────────────────────────────────────────


@app.get("/api/memory/status")
async def get_memory_status() -> MemoryStatus:
    """Overall memory subsystem health: bank reachability, runbook state, approval counts."""
    return await get_memory_service().get_memory_status()


@app.get("/api/memory/runbook")
async def get_runbook() -> RunbookStatus:
    """Current state of the Microservice Resolution Runbook mental model."""
    return await get_memory_service().get_runbook()


@app.post("/api/memory/runbook/refresh")
async def refresh_runbook() -> dict[str, str]:
    """Trigger a manual refresh of the Microservice Resolution Runbook."""
    op_id = await get_memory_service().refresh_runbook()
    return {"operation_id": op_id}


@app.get("/api/memory/approvals")
async def get_approvals() -> list[dict]:
    """Return all retained postmortems with their approval state, newest first."""
    records = get_memory_service().get_approvals()
    return [r.model_dump(mode="json") for r in records]


@app.put("/api/memory/approvals/{incident_id}")
async def set_approval(
    incident_id: str,
    status: ApprovalStatus = Body(..., embed=True),
) -> dict[str, str]:
    """Approve or reject a retained postmortem."""
    updated = get_memory_service().set_approval(incident_id, status)
    if not updated:
        raise HTTPException(status_code=404, detail=f"No postmortem found for {incident_id!r}")
    return {"incident_id": incident_id, "approval_status": status.value}
