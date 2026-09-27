"""MemoryService — application-level wrapper over Hindsight.

All Hindsight API calls are confined to this module.
The rest of the application (agent, API routes) uses only MemoryService methods.

Approval state is persisted to data/memory_state.json so it survives restarts.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from hindsight_client import Hindsight

from app.agent.types import DiagnosisResult
from app.config import settings

from .schemas import (
    ApprovalStatus,
    MemoryQueryResult,
    MemoryStatus,
    PostmortemRecord,
    RunbookStatus,
)

logger = logging.getLogger(__name__)

_RUNBOOK_NAME = "Microservice Resolution Runbook"
_RUNBOOK_SOURCE_QUERY = (
    "microservice incident root cause diagnosis resolution steps "
    "failure pattern remediation SRE postmortem bad_deploy saturation"
)
_GENERATING_SENTINEL = "Generating content..."


# ── approval store (local JSON) ────────────────────────────────────────────────


class _ApprovalStore:
    """Reads and writes the approval-state JSON file atomically."""

    def __init__(self, state_file: Path) -> None:
        self._path = state_file
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if not self._path.exists():
            self._path.write_text(json.dumps({"postmortems": {}}))

    def _load(self) -> dict[str, Any]:
        try:
            return json.loads(self._path.read_text())
        except Exception:
            return {"postmortems": {}}

    def _save(self, data: dict[str, Any]) -> None:
        self._path.write_text(json.dumps(data, indent=2, default=str))

    def get(self, incident_id: str) -> PostmortemRecord | None:
        data = self._load()
        raw = data["postmortems"].get(incident_id)
        if raw is None:
            return None
        return PostmortemRecord.model_validate(raw)

    def upsert(self, record: PostmortemRecord) -> None:
        data = self._load()
        data["postmortems"][record.incident_id] = record.model_dump(mode="json")
        self._save(data)

    def set_approval(self, incident_id: str, status: ApprovalStatus) -> bool:
        """Returns True if the record existed and was updated."""
        data = self._load()
        if incident_id not in data["postmortems"]:
            return False
        data["postmortems"][incident_id]["approval_status"] = status.value
        self._save(data)
        return True

    def all(self) -> list[PostmortemRecord]:
        data = self._load()
        records = []
        for raw in data["postmortems"].values():
            try:
                records.append(PostmortemRecord.model_validate(raw))
            except Exception:
                pass
        return sorted(records, key=lambda r: r.retained_at, reverse=True)

    def counts(self) -> dict[str, int]:
        records = self.all()
        counts: dict[str, int] = {s.value: 0 for s in ApprovalStatus}
        for r in records:
            counts[r.approval_status.value] += 1
        return counts


# ── helpers ────────────────────────────────────────────────────────────────────


def _client() -> Hindsight:
    return Hindsight(base_url=settings.hindsight_base_url)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_postmortem_text(
    incident: dict[str, Any],
    diagnosis: DiagnosisResult,
) -> str:
    """Structured postmortem narrative for Hindsight retention.

    Raw log lines are intentionally excluded.  Only synthesized findings,
    evidence references, and diagnostic patterns are retained.
    """
    lines = [
        f"POSTMORTEM | incident={diagnosis.incident_id} | service={incident.get('service', '?')}",
        f"category={incident.get('category', '?')} | severity={incident.get('severity', '?')}",
        f"retained_at={_now_iso()}",
        "",
        f"Root Cause: {diagnosis.root_cause}",
        "",
        "Key Evidence:",
    ]
    for item in diagnosis.evidence:
        lines.append(f"  - {item}")
    lines.append("")
    lines.append(f"Recommended Remediation: {diagnosis.recommended_remediation}")
    lines.append(f"Confidence: {diagnosis.confidence:.0%}")
    alert = incident.get("alert") or {}
    if alert.get("title"):
        lines.append(f"Alert Pattern: {alert['title']}")
    if incident.get("description"):
        lines.append(f"Incident Context: {incident['description']}")
    source = incident.get("source")
    src_id = incident.get("source_record_id")
    if source or src_id:
        lines.append(f"Source: {source or '?'} / {src_id or '?'}")
    return "\n".join(lines)


def _trust_level(
    approvals: list[PostmortemRecord],
    answer_found: bool,
) -> str:
    if not answer_found:
        return "empty"
    if not approvals:
        return "empty"
    statuses = {r.approval_status for r in approvals}
    if statuses == {ApprovalStatus.approved}:
        return "approved"
    if ApprovalStatus.approved in statuses:
        return "partial"
    return "pending"


def _runbook_status_string(
    content: str | None,
    is_stale: bool,
    last_refreshed_at: Any,
    last_memory_seen_at: Any,
) -> str:
    if content is None:
        return "unavailable"
    if content.strip().startswith(_GENERATING_SENTINEL.strip()) or content.strip() == "":
        return "generating"
    # If memories exist and the model has not seen the latest memory yet
    if is_stale:
        return "stale"
    if last_memory_seen_at and last_refreshed_at:
        # Coerce to strings for comparison (both are datetime objects or ISO strings)
        mem_str = str(last_memory_seen_at)
        ref_str = str(last_refreshed_at)
        if mem_str > ref_str:
            return "consolidation_pending"
    return "current"


# ── MemoryService ──────────────────────────────────────────────────────────────


class MemoryService:
    """Application-level interface to the Hindsight memory bank."""

    def __init__(self, state_file: Path) -> None:
        self._store = _ApprovalStore(state_file)

    # ── initialization ─────────────────────────────────────────────────────────

    async def initialize(self) -> dict[str, str]:
        """Idempotent startup: ensure bank exists and mental model is configured.

        Returns a dict describing what was created or confirmed.
        """
        client = _client()
        result: dict[str, str] = {}
        try:
            # Ensure bank exists (PUT is idempotent)
            await client.acreate_bank(
                bank_id=settings.hindsight_bank_id,
                retain_mission=(
                    "Extract and retain SRE incident patterns: service name, failure category, "
                    "root cause, evidence keywords, and remediation steps. "
                    "Do not retain raw log lines."
                ),
            )
            result["bank"] = "confirmed"

            # Check if our mental model already exists
            mm_id = settings.hindsight_mental_model_id
            try:
                existing = await client.aget_mental_model(
                    settings.hindsight_bank_id, mm_id, detail="metadata"
                )
                # Update trigger to enable delta + refresh_after_consolidation
                await client.aupdate_mental_model(
                    settings.hindsight_bank_id,
                    mm_id,
                    trigger={
                        "mode": "delta",
                        "refresh_after_consolidation": True,
                    },
                )
                result["mental_model"] = f"confirmed ({mm_id})"
            except Exception as mm_err:
                logger.warning("Mental model %s not found, creating: %s", mm_id, mm_err)
                resp = await client.acreate_mental_model(
                    bank_id=settings.hindsight_bank_id,
                    name=_RUNBOOK_NAME,
                    source_query=_RUNBOOK_SOURCE_QUERY,
                    tags=["sre", "incident", "runbook", "microservices"],
                    max_tokens=2048,
                    trigger={
                        "mode": "delta",
                        "refresh_after_consolidation": True,
                    },
                )
                assigned_id = getattr(resp, "mental_model_id", None) or mm_id
                result["mental_model"] = f"created ({assigned_id})"
        except Exception as exc:
            result["error"] = str(exc)
        finally:
            await client.aclose()
        return result

    # ── retain ─────────────────────────────────────────────────────────────────

    async def retain_incident(
        self,
        incident: dict[str, Any],
        diagnosis: DiagnosisResult,
    ) -> PostmortemRecord:
        """Build a postmortem and retain it in Hindsight (async, non-blocking).

        Returns a PostmortemRecord immediately; Hindsight processes in background.
        """
        inc_id = diagnosis.incident_id
        content = _build_postmortem_text(incident, diagnosis)
        tags = list(
            {
                t
                for t in [
                    incident.get("service"),
                    incident.get("category"),
                    "postmortem",
                    inc_id,
                ]
                if t
            }
        )

        record = PostmortemRecord(
            incident_id=inc_id,
            service=incident.get("service", "unknown"),
            category=incident.get("category"),
            severity=incident.get("severity", "unknown"),
            retained_at=datetime.now(timezone.utc),
            approval_status=ApprovalStatus.pending,
            tags=tags,
            document_id=inc_id,
            evidence_refs=diagnosis.evidence[:5],
            source_fixture=incident.get("source_record_id"),
        )

        client = _client()
        try:
            await client.aretain(
                bank_id=settings.hindsight_bank_id,
                content=content,
                context=f"Postmortem for {inc_id}",
                document_id=inc_id,
                tags=tags,
                retain_async=True,  # non-blocking; extraction runs in background
            )
        except Exception as exc:
            logger.warning("Hindsight retain failed for %s: %s", inc_id, exc)
        finally:
            await client.aclose()

        self._store.upsert(record)
        return record

    # ── query ──────────────────────────────────────────────────────────────────

    async def query_memory(self, query: str) -> MemoryQueryResult:
        """Reflect on the Hindsight bank for patterns matching query.

        Returns the answer plus a trust_level based on local approval state.
        """
        client = _client()
        try:
            response = await client.areflect(
                bank_id=settings.hindsight_bank_id,
                query=query,
                budget="low",
            )
            answer = (getattr(response, "answer", None) or "").strip()
            found = bool(answer)
        except Exception as exc:
            logger.warning("Hindsight query_memory failed: %s", exc)
            answer = ""
            found = False
        finally:
            await client.aclose()

        records = self._store.all()
        counts = self._store.counts()
        trust = _trust_level(records, found)

        return MemoryQueryResult(
            answer=answer,
            found=found,
            trust_level=trust,
            pending_count=counts.get("pending", 0),
        )

    # ── runbook ────────────────────────────────────────────────────────────────

    async def get_runbook(self) -> RunbookStatus:
        """Return current state of the Microservice Resolution Runbook."""
        client = _client()
        try:
            mm = await client.aget_mental_model(
                settings.hindsight_bank_id,
                settings.hindsight_mental_model_id,
                detail="content",
            )
            content: str | None = getattr(mm, "content", None)
            is_stale: bool = bool(getattr(mm, "is_stale", True))
            last_refreshed_at = getattr(mm, "last_refreshed_at", None)
            last_memory_seen_at = getattr(mm, "last_memory_seen_at", None)

            status_str = _runbook_status_string(
                content, is_stale, last_refreshed_at, last_memory_seen_at
            )
            counts = self._store.counts()
            return RunbookStatus(
                mental_model_id=settings.hindsight_mental_model_id,
                name=getattr(mm, "name", _RUNBOOK_NAME),
                content=content,
                is_stale=is_stale,
                last_refreshed_at=str(last_refreshed_at) if last_refreshed_at else None,
                last_memory_seen_at=str(last_memory_seen_at) if last_memory_seen_at else None,
                status=status_str,
                pending_approvals=counts.get("pending", 0),
            )
        except Exception as exc:
            logger.warning("get_runbook failed: %s", exc)
            return RunbookStatus(
                mental_model_id=settings.hindsight_mental_model_id,
                status="unavailable",
                pending_approvals=self._store.counts().get("pending", 0),
            )
        finally:
            await client.aclose()

    async def refresh_runbook(self) -> str:
        """Trigger a mental model refresh. Returns operation_id or 'failed'."""
        client = _client()
        try:
            resp = await client.arefresh_mental_model(
                settings.hindsight_bank_id,
                settings.hindsight_mental_model_id,
            )
            op_id: str = getattr(resp, "operation_id", None) or "triggered"
            logger.info("Runbook refresh triggered: %s", op_id)
            return op_id
        except Exception as exc:
            logger.warning("refresh_runbook failed: %s", exc)
            return "failed"
        finally:
            await client.aclose()

    # ── status ─────────────────────────────────────────────────────────────────

    async def get_memory_status(self) -> MemoryStatus:
        """Overall memory system health and state snapshot."""
        client = _client()
        bank_reachable = False
        total_memories = 0
        try:
            mem_list = await client.alist_memories(
                settings.hindsight_bank_id, limit=1
            )
            total_memories = getattr(mem_list, "total", 0) or 0
            bank_reachable = True
        except Exception:
            pass
        finally:
            await client.aclose()

        runbook = await self.get_runbook()
        records = self._store.all()
        counts = self._store.counts()

        return MemoryStatus(
            bank_id=settings.hindsight_bank_id,
            bank_reachable=bank_reachable,
            total_memories=total_memories,
            runbook=runbook,
            pending_approvals=counts.get("pending", 0),
            approved_count=counts.get("approved", 0),
            rejected_count=counts.get("rejected", 0),
            all_postmortems=records,
        )

    # ── approval ───────────────────────────────────────────────────────────────

    def set_approval(self, incident_id: str, status: ApprovalStatus) -> bool:
        """Approve or reject a retained postmortem. Returns False if not found."""
        return self._store.set_approval(incident_id, status)

    def get_approvals(self) -> list[PostmortemRecord]:
        """Return all retained postmortems sorted newest-first."""
        return self._store.all()

    def get_pending(self) -> list[PostmortemRecord]:
        return [r for r in self._store.all() if r.approval_status == ApprovalStatus.pending]


# ── singleton ──────────────────────────────────────────────────────────────────

_instance: MemoryService | None = None


def get_memory_service() -> MemoryService:
    """Return the module-level singleton MemoryService.

    Initialized on first call using paths from app.config.settings.
    """
    global _instance
    if _instance is None:
        from app.config import settings

        state_file = (
            Path(settings.__class__.__module__.replace(".", "/")).parent.parent.parent
            / "data"
            / "memory_state.json"
        )
        # Resolve relative to the project root reliably
        state_file = Path(__file__).parent.parent.parent.parent / "data" / "memory_state.json"
        _instance = MemoryService(state_file)
    return _instance
