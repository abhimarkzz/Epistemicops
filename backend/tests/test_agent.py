"""
Tests for the LangGraph investigation agent.

All tests are Ollama-independent: the LLM is replaced with a mock that returns
preset JSON.  Hindsight memory functions are patched at the module level.

Coverage:
  1. Happy-path run emits all expected event types in correct order.
  2. LLM prompt contains no ground-truth fields.
  3. Postmortem retained in Hindsight contains no raw log lines.
  4. Unknown incident ID produces run_failed event.
  5. Malformed LLM output produces run_failed event.
  6. Memory query fires before investigate (ordering guarantee).
  7. DiagnosisResult fields are correctly populated.
  8. HTTP investigate endpoint streams events.
  9. memory_used flag is true when prior context was found.
 10. Tools are called in declared order.
"""

from __future__ import annotations

import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from app.agent.graph import run_investigation
from app.agent.tools import TOOL_ORDER
from app.agent.types import AgentEvent
from app.fixtures import FixtureService

# ── shared test fixture ───────────────────────────────────────────────────────

_INCIDENT: dict = {
    "id": "inc-t01",
    "title": "Orders 5xx spike",
    "service": "orders",
    "severity": "critical",
    "category": "bad_deploy",
    "description": "Orders service spiking 5xx after deploy.",
    "alert": {"title": "High error rate on /checkout", "state": "alerting"},
    "logs": [
        "2026-01-01T00:00:01Z ERROR nil pointer dereference at checkout.go:42",
        "2026-01-01T00:00:02Z ERROR nil pointer dereference at checkout.go:42",
        "2026-01-01T00:00:03Z WARN  connection refused redis:6379",
    ],
    "metrics": {"app_error_rate": [{"value": 0.08}]},
    "pod_status": {
        "namespace": "rlvr-target",
        "pods": [{"name": "orders-abc", "status": "Running", "image": "rlvr/orders:v2-broken"}],
    },
    "tags": ["bad_deploy", "orders"],
    "_ground_truth": {
        "root_cause": "Nil pointer dereference in v2-broken image.",
        "root_cause_category": "bad_deploy",
        "resolution_steps": ["kubectl rollout undo deployment/orders"],
        "expected_evidence": ["v2-broken", "nil pointer"],
        "canonical_fix": "kubectl rollout undo deployment/orders",
        "fix_tool": "rollback_deployment",
        "forbidden_categories": ["resource_exhaustion"],
    },
}

_VALID_LLM_RESPONSE = json.dumps({
    "root_cause": "Nil pointer dereference in orders:v2-broken image",
    "evidence": ["nil pointer at checkout.go:42", "pod running rlvr/orders:v2-broken"],
    "recommended_remediation": "kubectl rollout undo deployment/orders -n rlvr-target",
    "confidence": 0.92,
})

# Ground-truth keywords that must never appear in the LLM prompt
_GT_KEYWORDS = {
    "_ground_truth", "ground_truth", "root_cause_category", "expected_evidence",
    "canonical_fix", "fix_tool", "forbidden_categories", "resolution_steps",
    # actual GT values that must not leak
    "Nil pointer dereference in v2-broken image.",
    "kubectl rollout undo deployment/orders",
    "rollback_deployment",
    "resource_exhaustion",
}


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_svc(*fixtures: dict) -> FixtureService:
    tmp = tempfile.mkdtemp()
    for f in fixtures:
        (Path(tmp) / f"{f['id']}.json").write_text(json.dumps(f))
    return FixtureService(Path(tmp))


def _mock_llm(content: str = _VALID_LLM_RESPONSE) -> MagicMock:
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=AIMessage(content=content))
    return llm


async def _run(
    incident_id: str,
    svc: FixtureService,
    llm: Any = None,
    memory_context: str = "",
) -> list[AgentEvent]:
    events: list[AgentEvent] = []
    with (
        patch("app.agent.graph.query_incident_patterns", AsyncMock(return_value=memory_context)),
        patch("app.agent.graph.retain_incident_full", AsyncMock(return_value=True)),
    ):
        async for ev in run_investigation(incident_id, svc, llm or _mock_llm()):
            events.append(ev)
    return events


# ── 1. Happy path event types and ordering ────────────────────────────────────

def test_happy_path_emits_all_event_types():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    names = [e.event for e in events]
    for expected in [
        "incident_started",
        "memory_query_started",
        "memory_result",
        "tool_started",
        "tool_result_summary",
        "diagnosis_started",
        "diagnosis_completed",
        "memory_retention_started",
        "postmortem_created",
        "run_completed",
    ]:
        assert expected in names, f"Missing event: {expected}"


def test_happy_path_last_event_is_run_completed():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    assert events[-1].event == "run_completed"


def test_happy_path_no_run_failed():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    assert not any(e.event == "run_failed" for e in events)


def test_incident_started_before_memory_query():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    names = [e.event for e in events]
    assert names.index("incident_started") < names.index("memory_query_started")


def test_memory_result_before_tool_started():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    names = [e.event for e in events]
    assert names.index("memory_result") < names.index("tool_started")


def test_diagnosis_completed_before_postmortem():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    names = [e.event for e in events]
    assert names.index("diagnosis_completed") < names.index("postmortem_created")


# ── 2. LLM prompt contains no ground-truth fields ─────────────────────────────

def test_llm_prompt_no_ground_truth():
    svc = _make_svc(_INCIDENT)
    captured: list[str] = []

    async def spy_ainvoke(messages, **_):
        for m in messages:
            if hasattr(m, "content"):
                captured.append(m.content)
        return AIMessage(content=_VALID_LLM_RESPONSE)

    llm = MagicMock()
    llm.ainvoke = spy_ainvoke
    asyncio.run(_run("inc-t01", svc, llm))

    full_prompt = "\n".join(captured)
    for kw in _GT_KEYWORDS:
        assert kw not in full_prompt, f"GT keyword '{kw}' found in LLM prompt"


# ── 3. Postmortem contains no raw log lines ───────────────────────────────────

def test_postmortem_retain_called():
    """Verifies retain_incident_full is called with incident and diagnosis objects.

    Raw-log exclusion is verified in test_memory.py via _build_postmortem_text.
    """
    svc = _make_svc(_INCIDENT)
    calls: list[tuple] = []

    async def fake_retain(incident: dict, diagnosis: object) -> bool:
        calls.append((incident, diagnosis))
        return True

    with (
        patch("app.agent.graph.query_incident_patterns", AsyncMock(return_value="")),
        patch("app.agent.graph.retain_incident_full", fake_retain),
    ):
        asyncio.run(_drain(run_investigation("inc-t01", svc, _mock_llm())))

    assert calls, "retain_incident_full was never called"
    incident_arg, diagnosis_arg = calls[-1]
    assert incident_arg.get("id") == "inc-t01"
    assert hasattr(diagnosis_arg, "incident_id")


async def _drain(gen) -> None:
    async for _ in gen:
        pass


# ── 4. Unknown incident → run_failed ─────────────────────────────────────────

def test_unknown_incident_emits_run_failed():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("does-not-exist", svc))
    assert any(e.event == "run_failed" for e in events)


def test_unknown_incident_no_run_completed():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("does-not-exist", svc))
    assert not any(e.event == "run_completed" for e in events)


def test_run_failed_carries_error_message():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("does-not-exist", svc))
    failed = next(e for e in events if e.event == "run_failed")
    assert "does-not-exist" in failed.data.get("error", "")


# ── 5. Malformed LLM output → run_failed ─────────────────────────────────────

def test_malformed_llm_output_run_failed():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc, _mock_llm("not valid json")))
    assert any(e.event == "run_failed" for e in events)
    assert not any(e.event == "run_completed" for e in events)


def test_llm_missing_root_cause_run_failed():
    svc = _make_svc(_INCIDENT)
    bad = json.dumps({"recommended_remediation": "restart", "confidence": 0.5})
    events = asyncio.run(_run("inc-t01", svc, _mock_llm(bad)))
    assert any(e.event == "run_failed" for e in events)


def test_llm_missing_remediation_run_failed():
    svc = _make_svc(_INCIDENT)
    bad = json.dumps({"root_cause": "bad deploy", "confidence": 0.9})
    events = asyncio.run(_run("inc-t01", svc, _mock_llm(bad)))
    assert any(e.event == "run_failed" for e in events)


# ── 6. memory_used flag ───────────────────────────────────────────────────────

def test_memory_used_false_when_no_context():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc, memory_context=""))
    completed = next(e for e in events if e.event == "diagnosis_completed")
    assert completed.data["memory_used"] is False


def test_memory_used_true_when_context():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc, memory_context="Prior bad_deploy pattern found."))
    completed = next(e for e in events if e.event == "diagnosis_completed")
    assert completed.data["memory_used"] is True


# ── 7. DiagnosisResult fields ─────────────────────────────────────────────────

def test_diagnosis_completed_fields():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    completed = next(e for e in events if e.event == "diagnosis_completed")
    assert completed.data["incident_id"] == "inc-t01"
    assert "root_cause" in completed.data
    assert "confidence" in completed.data
    assert completed.data["status"] == "completed"


def test_run_completed_carries_incident_id():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    run_done = next(e for e in events if e.event == "run_completed")
    assert run_done.data["incident_id"] == "inc-t01"


# ── 8. HTTP investigate endpoint ─────────────────────────────────────────────

def test_http_investigate_returns_200(client):
    with (
        patch("app.agent.graph.query_incident_patterns", AsyncMock(return_value="")),
        patch("app.agent.graph.retain_incident_full", AsyncMock(return_value=True)),
        patch("app.agent.graph._make_default_llm", return_value=_mock_llm()),
    ):
        with client.stream("POST", "/api/investigate/inc-003") as response:
            assert response.status_code == 200
            lines = [l for l in response.iter_lines() if l.startswith("data:")]

    assert len(lines) > 0


def test_http_investigate_streams_incident_started(client):
    with (
        patch("app.agent.graph.query_incident_patterns", AsyncMock(return_value="")),
        patch("app.agent.graph.retain_incident_full", AsyncMock(return_value=True)),
        patch("app.agent.graph._make_default_llm", return_value=_mock_llm()),
    ):
        with client.stream("POST", "/api/investigate/inc-003") as response:
            lines = [l for l in response.iter_lines() if l.startswith("data:")]

    events = [json.loads(l[len("data:"):].strip()) for l in lines]
    assert any(e["event"] == "incident_started" for e in events)


def test_http_investigate_unknown_incident_run_failed(client):
    with (
        patch("app.agent.graph.query_incident_patterns", AsyncMock(return_value="")),
        patch("app.agent.graph.retain_incident_full", AsyncMock(return_value=True)),
        patch("app.agent.graph._make_default_llm", return_value=_mock_llm()),
    ):
        with client.stream("POST", "/api/investigate/no-such-incident") as response:
            lines = [l for l in response.iter_lines() if l.startswith("data:")]

    events = [json.loads(l[len("data:"):].strip()) for l in lines]
    assert any(e["event"] == "run_failed" for e in events)


# ── 9. Tool ordering ──────────────────────────────────────────────────────────

def test_tools_called_in_declared_order():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    started = [e.data["tool"] for e in events if e.event == "tool_started"]
    assert started == TOOL_ORDER


def test_each_tool_start_has_matching_result_summary():
    svc = _make_svc(_INCIDENT)
    events = asyncio.run(_run("inc-t01", svc))
    started = [e.data["tool"] for e in events if e.event == "tool_started"]
    summarized = [e.data["tool"] for e in events if e.event == "tool_result_summary"]
    assert started == summarized


# ── 10. Real fixture ids work end-to-end ─────────────────────────────────────

def test_real_fixture_inc003_happy_path():
    """inc-003 from real incidents dir runs without error."""
    from pathlib import Path
    real_dir = Path(__file__).parent.parent.parent / "data" / "incidents"
    svc = FixtureService(real_dir)
    events = asyncio.run(_run("inc-003", svc))
    assert any(e.event == "run_completed" for e in events)
    assert not any(e.event == "run_failed" for e in events)
