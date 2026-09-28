import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.agent import AgentEvent, run_investigation
from app.agent.types import DiagnosisResult
from app.config import settings
from app.fixtures import FixtureService, IncidentNotFoundError
from app.memory import ApprovalStatus, get_memory_service
from app.memory.schemas import MemoryStatus, RunbookStatus
from app.runs import RunComparison, RunRecord, get_run_store

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).parent.parent.parent
INCIDENTS_DIR = _PROJECT_ROOT / "data" / "incidents"
DEMO_EVENTS_DIR = _PROJECT_ROOT / "data" / "demo_events"

_fixtures = FixtureService(INCIDENTS_DIR)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise Hindsight bank and mental model on startup (non-blocking).

    Failures are logged as warnings so the backend starts even when
    Hindsight is temporarily unavailable.  Run scripts/init_hindsight.py
    for a more detailed diagnostic if Hindsight is unreachable.
    """
    try:
        result = await get_memory_service().initialize()
        logger.info("Hindsight init: %s", result)
    except Exception as exc:
        logger.warning(
            "Hindsight init failed at startup (backend will still work without memory): %s",
            exc,
        )
    yield


app = FastAPI(title="EpistemicOps", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    Gemini key check and Hindsight probe are informational; they never affect HTTP status.
    """
    provider = settings.active_provider()
    if provider == "groq":
        llm_ok = bool(settings.groq_api_key)
        llm_url = f"https://api.groq.com (model: {settings.groq_model})"
    else:
        llm_ok = bool(settings.gemini_api_key)
        llm_url = f"https://generativelanguage.googleapis.com (model: {settings.gemini_model})"
    hindsight_ok = await _probe(f"{settings.hindsight_base_url}/health/live")
    return {
        "status": "ok",
        "service": "epistemicops-backend",
        "services": {
            "llm": {
                "provider": provider,
                "status": "ok" if llm_ok else "unreachable",
                "url": llm_url,
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


@app.get("/api/demo/incidents")
def list_demo_incidents() -> list[str]:
    """Incident IDs that have a deterministic demo-events file.

    The UI uses this to enable Demo mode only for supported incidents, so it
    never falls back to another incident's replay.
    """
    if not DEMO_EVENTS_DIR.exists():
        return []
    return sorted(p.stem for p in DEMO_EVENTS_DIR.glob("*.json"))


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
async def investigate_incident(
    incident_id: str,
    baseline: bool = Query(False, description="Skip memory (baseline comparison mode)"),
    demo: bool = Query(False, description="Replay pre-recorded demo events"),
) -> EventSourceResponse:
    """Stream the agent investigation as Server-Sent Events.

    Each event is a JSON-encoded AgentEvent.  The stream ends after
    run_completed or run_failed is emitted.

    ?baseline=true  — memory query is skipped; useful for cold/warm comparison.
    ?demo=true      — streams pre-recorded events; never runs a live model.
                      The first event will be demo_mode_started.
    """
    mode: Literal["live", "baseline", "demo"] = (
        "demo" if demo else "baseline" if baseline else "live"
    )
    store = get_run_store()
    record = store.create(incident_id, mode)
    run_id = record.run_id
    t0 = time.monotonic()

    if demo:
        async def generate_demo():
            demo_file = DEMO_EVENTS_DIR / f"{incident_id}.json"
            if not demo_file.exists():
                err = AgentEvent(
                    event="run_failed",
                    data={"error": f"No demo events file for {incident_id!r}. Run a live investigation first."},
                )
                store.on_event(run_id, "run_failed", err.data)
                yield {"data": err.model_dump_json()}
                return

            banner = AgentEvent(
                event="demo_mode_started",
                data={
                    "run_id": run_id,
                    "incident_id": incident_id,
                    "label": "Demo Mode — deterministic replay",
                    "warning": "This is NOT a live model run. Events are pre-recorded.",
                },
            )
            yield {"data": banner.model_dump_json()}

            raw = json.loads(demo_file.read_text())
            final_diagnosis: DiagnosisResult | None = None
            for entry in raw.get("events", []):
                delay_s = entry.get("delay_ms", 0) / 1000.0
                if delay_s > 0:
                    await asyncio.sleep(min(delay_s, 2.0))  # cap replay delay at 2s per event
                ev = AgentEvent(event=entry["event"], data=entry.get("data", {}))
                store.on_event(run_id, ev.event, ev.data)
                yield {"data": ev.model_dump_json()}
                if ev.event == "diagnosis_completed":
                    d = ev.data
                    final_diagnosis = DiagnosisResult(
                        incident_id=d.get("incident_id", incident_id),
                        root_cause=d.get("root_cause", ""),
                        evidence=[],
                        recommended_remediation="",
                        confidence=d.get("confidence", 0.5),
                        memory_used=bool(d.get("memory_used", False)),
                        tool_calls=[],
                        status=d.get("status", "completed"),
                    )

            elapsed_ms = int((time.monotonic() - t0) * 1000)
            try:
                gt = _fixtures.get_ground_truth(incident_id).model_dump()
            except Exception:
                gt = None
            store.finalize(run_id, final_diagnosis, elapsed_ms, gt)

        return EventSourceResponse(generate_demo())

    async def generate():
        started_event = AgentEvent(
            event="run_started",
            data={"run_id": run_id, "mode": mode, "incident_id": incident_id},
        )
        yield {"data": started_event.model_dump_json()}
        try:
            async for event in run_investigation(
                incident_id, _fixtures, skip_memory=(mode == "baseline")
            ):
                store.on_event(run_id, event.event, event.data)
                yield {"data": event.model_dump_json()}
        except Exception as exc:
            err = AgentEvent(event="run_failed", data={"error": str(exc)})
            store.on_event(run_id, "run_failed", err.data)
            yield {"data": err.model_dump_json()}

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        try:
            gt = _fixtures.get_ground_truth(incident_id).model_dump()
        except Exception:
            gt = None
        store.finalize(run_id, None, elapsed_ms, gt)

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


@app.delete("/api/memory/bank")
async def reset_memory_bank() -> dict[str, str]:
    """Wipe the Hindsight bank and recreate it, then clear the approval store.

    Only the EpistemicOps bank is affected.  Other Hindsight banks are not touched.
    The approval store (data/memory_state.json) is also cleared.
    This operation is irreversible — call with intention.
    """
    svc = get_memory_service()
    await svc.reset_bank()
    return {"status": "reset", "message": "Hindsight bank and approval store cleared."}


# ── run / learning-loop endpoints ─────────────────────────────────────────────


@app.get("/api/runs")
async def list_runs(limit: int = Query(20, ge=1, le=50)) -> list[RunRecord]:
    """Return the most recent investigation run records, newest first."""
    return get_run_store().list_recent(limit)


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str) -> RunRecord:
    """Return a single run record with diagnosis and evaluation result."""
    record = get_run_store().get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return record


class CompareRequest(BaseModel):
    run_id_a: str
    run_id_b: str


@app.post("/api/runs/compare")
async def compare_runs(body: CompareRequest) -> RunComparison:
    """Compare two run records side-by-side (e.g. baseline vs live, cold vs warm)."""
    result = get_run_store().compare(body.run_id_a, body.run_id_b)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"One or both run IDs not found: {body.run_id_a!r}, {body.run_id_b!r}",
        )
    return result
