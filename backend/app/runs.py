"""In-memory run store.  Resets on server restart — suitable for demo use.

A RunRecord is created at the start of each investigation and updated
as events stream through.  The evaluator is run once diagnosis is available.
"""
from __future__ import annotations

import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Literal

from pydantic import BaseModel, Field

from app.agent.types import DiagnosisResult
from app.eval import EvalResult, evaluate

_MAX_RUNS = 50


class RunRecord(BaseModel):
    run_id: str
    incident_id: str
    mode: Literal["live", "baseline", "demo"]
    started_at: datetime
    elapsed_ms: int | None = None
    tool_calls: list[str] = Field(default_factory=list)
    memory_used: bool = False
    diagnosis: DiagnosisResult | None = None
    eval_result: EvalResult | None = None
    error: str | None = None
    status: Literal["running", "completed", "failed"] = "running"


class RunComparison(BaseModel):
    run_a: RunRecord
    run_b: RunRecord
    delta: dict[str, Any]


class RunStore:
    def __init__(self) -> None:
        self._records: dict[str, RunRecord] = {}
        self._order: Deque[str] = deque(maxlen=_MAX_RUNS)

    def create(
        self,
        incident_id: str,
        mode: Literal["live", "baseline", "demo"],
    ) -> RunRecord:
        run_id = str(uuid.uuid4())[:8]
        record = RunRecord(
            run_id=run_id,
            incident_id=incident_id,
            mode=mode,
            started_at=datetime.now(timezone.utc),
        )
        self._records[run_id] = record
        self._order.append(run_id)
        # Evict if over limit
        while len(self._order) < len(self._records):
            oldest = next(iter(self._records))
            del self._records[oldest]
        return record

    def on_event(self, run_id: str, event_name: str, data: dict[str, Any]) -> None:
        record = self._records.get(run_id)
        if record is None:
            return
        if event_name == "run_failed":
            record.status = "failed"
            record.error = data.get("error", "unknown error")
        elif event_name == "diagnosis_completed":
            record.memory_used = bool(data.get("memory_used", False))
            inc_id = data.get("incident_id", record.incident_id)
            if data.get("root_cause"):
                record.diagnosis = DiagnosisResult(
                    incident_id=inc_id,
                    root_cause=data.get("root_cause", ""),
                    evidence=data.get("evidence", []),
                    recommended_remediation=data.get("recommended_remediation", ""),
                    confidence=float(data.get("confidence", 0.5)),
                    memory_used=bool(data.get("memory_used", False)),
                    tool_calls=data.get("tool_calls", []),
                    status=data.get("status", "completed"),
                )
                record.tool_calls = data.get("tool_calls", [])

    def finalize(
        self,
        run_id: str,
        diagnosis: DiagnosisResult | None,
        elapsed_ms: int,
        ground_truth: dict[str, Any] | None = None,
    ) -> None:
        record = self._records.get(run_id)
        if record is None:
            return
        record.elapsed_ms = elapsed_ms
        # Use passed diagnosis, or fall back to what was captured via on_event
        effective = diagnosis if diagnosis is not None else record.diagnosis
        if effective is not None:
            record.diagnosis = effective
            record.tool_calls = list(effective.tool_calls) or record.tool_calls
            record.memory_used = effective.memory_used
            if ground_truth and record.eval_result is None:
                try:
                    record.eval_result = evaluate(effective, ground_truth)
                except Exception:
                    pass
            if record.status == "running":
                record.status = "completed"
        elif record.status == "running":
            record.status = "failed"

    def get(self, run_id: str) -> RunRecord | None:
        return self._records.get(run_id)

    def list_recent(self, limit: int = 20) -> list[RunRecord]:
        ids = list(self._order)[-limit:]
        ids.reverse()
        return [self._records[rid] for rid in ids if rid in self._records]

    def compare(self, run_id_a: str, run_id_b: str) -> RunComparison | None:
        a = self._records.get(run_id_a)
        b = self._records.get(run_id_b)
        if a is None or b is None:
            return None
        delta: dict[str, Any] = {
            "memory_used_a": a.memory_used,
            "memory_used_b": b.memory_used,
            "elapsed_ms_a": a.elapsed_ms,
            "elapsed_ms_b": b.elapsed_ms,
            "elapsed_ms_delta": (
                (b.elapsed_ms or 0) - (a.elapsed_ms or 0)
                if a.elapsed_ms is not None and b.elapsed_ms is not None
                else None
            ),
            "tool_calls_a": len(a.tool_calls),
            "tool_calls_b": len(b.tool_calls),
            "eval_pass_a": a.eval_result.overall_pass if a.eval_result else None,
            "eval_pass_b": b.eval_result.overall_pass if b.eval_result else None,
            "evidence_score_a": a.eval_result.evidence_score if a.eval_result else None,
            "evidence_score_b": b.eval_result.evidence_score if b.eval_result else None,
        }
        return RunComparison(run_a=a, run_b=b, delta=delta)


_store = RunStore()


def get_run_store() -> RunStore:
    return _store
