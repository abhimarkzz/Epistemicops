"""Tests for the in-memory RunStore (app.runs).

Covers create/on_event/finalize lifecycle, eviction, comparison, and the
evaluator wiring that runs at finalize time.  No live services required.
"""

from __future__ import annotations

from app.agent.types import DiagnosisResult
from app.runs import RunStore, _MAX_RUNS


_GT = {
    "root_cause_category": "bad_deploy",
    "expected_evidence": ["v2-broken", "nil pointer"],
    "canonical_fix": "kubectl rollout undo deployment/orders",
    "forbidden_categories": ["resource_exhaustion"],
}


def _good_diagnosis(inc: str = "inc-003") -> DiagnosisResult:
    return DiagnosisResult(
        incident_id=inc,
        root_cause="bad_deploy: nil pointer in orders v2-broken image",
        evidence=["v2-broken image running", "nil pointer at checkout"],
        recommended_remediation="kubectl rollout undo deployment/orders",
        confidence=0.9,
        memory_used=False,
        tool_calls=["get_logs", "get_metrics", "get_trace", "get_pod_status"],
        status="completed",
    )


# ── create ────────────────────────────────────────────────────────────────────

def test_create_returns_record_with_id_and_running_status():
    store = RunStore()
    rec = store.create("inc-001", "live")
    assert rec.run_id
    assert rec.incident_id == "inc-001"
    assert rec.mode == "live"
    assert rec.status == "running"


def test_created_run_is_retrievable():
    store = RunStore()
    rec = store.create("inc-001", "live")
    assert store.get(rec.run_id) is rec


# ── on_event ────────────────────────────────────────────────────────────────────

def test_on_event_run_failed_sets_failed_status_and_error():
    store = RunStore()
    rec = store.create("inc-001", "live")
    store.on_event(rec.run_id, "run_failed", {"error": "boom"})
    assert rec.status == "failed"
    assert rec.error == "boom"


def test_on_event_diagnosis_completed_captures_memory_and_tools():
    store = RunStore()
    rec = store.create("inc-003", "live")
    store.on_event(rec.run_id, "diagnosis_completed", {
        "incident_id": "inc-003",
        "root_cause": "bad_deploy",
        "evidence": ["x"],
        "recommended_remediation": "rollback",
        "confidence": 0.8,
        "memory_used": True,
        "tool_calls": ["get_logs", "get_metrics"],
        "status": "completed",
    })
    assert rec.memory_used is True
    assert rec.tool_calls == ["get_logs", "get_metrics"]
    assert rec.diagnosis is not None


def test_on_event_unknown_run_id_is_noop():
    store = RunStore()
    # Should not raise
    store.on_event("nope", "run_failed", {"error": "x"})


# ── finalize + evaluator ────────────────────────────────────────────────────────

def test_finalize_sets_elapsed_and_completed():
    store = RunStore()
    rec = store.create("inc-003", "live")
    store.finalize(rec.run_id, _good_diagnosis(), 1234, _GT)
    assert rec.elapsed_ms == 1234
    assert rec.status == "completed"


def test_finalize_runs_evaluator_when_ground_truth_present():
    store = RunStore()
    rec = store.create("inc-003", "live")
    store.finalize(rec.run_id, _good_diagnosis(), 1000, _GT)
    assert rec.eval_result is not None
    assert rec.eval_result.overall_pass is True


def test_finalize_without_diagnosis_marks_failed():
    store = RunStore()
    rec = store.create("inc-001", "live")
    store.finalize(rec.run_id, None, 500, None)
    assert rec.status == "failed"


def test_finalize_falls_back_to_on_event_diagnosis():
    store = RunStore()
    rec = store.create("inc-003", "live")
    store.on_event(rec.run_id, "diagnosis_completed", {
        "incident_id": "inc-003",
        "root_cause": "bad_deploy nil pointer v2-broken",
        "evidence": ["v2-broken", "nil pointer"],
        "recommended_remediation": "kubectl rollout undo deployment/orders",
        "confidence": 0.9,
        "memory_used": False,
        "tool_calls": ["get_logs"],
        "status": "completed",
    })
    store.finalize(rec.run_id, None, 800, _GT)
    assert rec.status == "completed"
    assert rec.eval_result is not None


# ── list + eviction ──────────────────────────────────────────────────────────

def test_list_recent_newest_first():
    store = RunStore()
    a = store.create("inc-001", "live")
    b = store.create("inc-002", "live")
    recent = store.list_recent(10)
    assert recent[0].run_id == b.run_id
    assert recent[1].run_id == a.run_id


def test_eviction_caps_at_max_runs():
    store = RunStore()
    for i in range(_MAX_RUNS + 10):
        store.create(f"inc-{i}", "live")
    assert len(store._records) <= _MAX_RUNS
    assert len(store.list_recent(_MAX_RUNS + 50)) <= _MAX_RUNS


# ── compare ──────────────────────────────────────────────────────────────────

def test_compare_returns_delta_of_measured_values():
    store = RunStore()
    a = store.create("inc-003", "baseline")
    b = store.create("inc-003", "live")
    cold = _good_diagnosis()               # memory_used=False (baseline)
    warm = _good_diagnosis()
    warm.memory_used = True                # warm run used memory
    store.finalize(a.run_id, cold, 2000, _GT)
    store.finalize(b.run_id, warm, 1500, _GT)

    cmp = store.compare(a.run_id, b.run_id)
    assert cmp is not None
    assert cmp.delta["elapsed_ms_a"] == 2000
    assert cmp.delta["elapsed_ms_b"] == 1500
    assert cmp.delta["elapsed_ms_delta"] == -500
    assert cmp.delta["memory_used_a"] is False
    assert cmp.delta["memory_used_b"] is True


def test_compare_missing_run_returns_none():
    store = RunStore()
    a = store.create("inc-003", "live")
    assert store.compare(a.run_id, "missing") is None
