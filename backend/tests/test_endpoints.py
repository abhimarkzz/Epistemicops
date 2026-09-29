"""HTTP endpoint tests for baseline and demo investigation modes.

- Baseline mode (?baseline=true) must skip memory and emit memory_skipped,
  with memory_used=false in the diagnosis. The LLM is mocked so no live
  Gemini key is required.
- Demo mode (?demo=true) must replay pre-recorded events with a clear
  demo_mode_started banner and never invoke a live model.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessage

_VALID_LLM_RESPONSE = json.dumps({
    "root_cause": "bad_deploy: nil pointer in orders v2-broken image",
    "evidence": ["v2-broken", "nil pointer"],
    "recommended_remediation": "kubectl rollout undo deployment/orders",
    "confidence": 0.9,
})


def _mock_llm() -> MagicMock:
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=AIMessage(content=_VALID_LLM_RESPONSE))
    return llm


def _events(client, url: str) -> list[dict]:
    with client.stream("POST", url) as response:
        assert response.status_code == 200
        lines = [l for l in response.iter_lines() if l.startswith("data:")]
    return [json.loads(l[len("data:"):].strip()) for l in lines]


# ── baseline mode ──────────────────────────────────────────────────────────────

def test_baseline_emits_memory_skipped(client):
    with (
        patch("app.agent.graph.query_incident_patterns", AsyncMock(return_value="")),
        patch("app.agent.graph.retain_incident_full", AsyncMock(return_value=True)),
        patch("app.agent.graph._make_default_llm", return_value=_mock_llm()),
    ):
        events = _events(client, "/api/investigate/inc-003?baseline=true")
    names = [e["event"] for e in events]
    assert "memory_skipped" in names
    assert "memory_query_started" not in names


def test_baseline_diagnosis_memory_used_false(client):
    with (
        patch("app.agent.graph.query_incident_patterns", AsyncMock(return_value="")),
        patch("app.agent.graph.retain_incident_full", AsyncMock(return_value=True)),
        patch("app.agent.graph._make_default_llm", return_value=_mock_llm()),
    ):
        events = _events(client, "/api/investigate/inc-003?baseline=true")
    completed = next(e for e in events if e["event"] == "diagnosis_completed")
    assert completed["data"]["memory_used"] is False


def test_baseline_run_started_mode_is_baseline(client):
    with (
        patch("app.agent.graph.query_incident_patterns", AsyncMock(return_value="")),
        patch("app.agent.graph.retain_incident_full", AsyncMock(return_value=True)),
        patch("app.agent.graph._make_default_llm", return_value=_mock_llm()),
    ):
        events = _events(client, "/api/investigate/inc-003?baseline=true")
    started = next(e for e in events if e["event"] == "run_started")
    assert started["data"]["mode"] == "baseline"


def test_baseline_does_not_query_memory(client):
    """query_incident_patterns must never be called in baseline mode."""
    spy = AsyncMock(return_value="should-not-be-used")
    with (
        patch("app.agent.graph.query_incident_patterns", spy),
        patch("app.agent.graph.retain_incident_full", AsyncMock(return_value=True)),
        patch("app.agent.graph._make_default_llm", return_value=_mock_llm()),
    ):
        _events(client, "/api/investigate/inc-003?baseline=true")
    spy.assert_not_called()


# ── demo mode ──────────────────────────────────────────────────────────────────
# Demo replay sleeps between events; patch asyncio.sleep so tests stay fast and
# deterministic without altering the replay logic under test.

def test_demo_first_event_is_demo_mode_started(client):
    with patch("app.main.asyncio.sleep", AsyncMock()):
        events = _events(client, "/api/investigate/inc-003?demo=true")
    assert events[0]["event"] == "demo_mode_started"
    assert "NOT a live model" in events[0]["data"].get("warning", "")


def test_demo_reaches_run_completed(client):
    with patch("app.main.asyncio.sleep", AsyncMock()):
        events = _events(client, "/api/investigate/inc-003?demo=true")
    names = [e["event"] for e in events]
    assert "diagnosis_completed" in names
    assert names[-1] == "run_completed"


def test_demo_does_not_call_live_model(client):
    """No live LLM should be constructed in demo mode."""
    with (
        patch("app.main.asyncio.sleep", AsyncMock()),
        patch("app.agent.graph._make_default_llm") as make_llm,
    ):
        _events(client, "/api/investigate/inc-003?demo=true")
    make_llm.assert_not_called()


def test_demo_missing_file_emits_run_failed(client):
    events = _events(client, "/api/investigate/inc-001?demo=true")
    # inc-001 has no demo_events file → run_failed with a helpful message
    assert any(e["event"] == "run_failed" for e in events)


# ── demo support + selected-incident-id propagation ─────────────────────────────

def test_demo_incidents_lists_supported_ids(client):
    resp = client.get("/api/demo/incidents")
    assert resp.status_code == 200
    ids = resp.json()
    assert "inc-003" in ids and "inc-004" in ids
    # incidents without a demo file must NOT be listed
    assert "inc-001" not in ids and "inc-005" not in ids


def test_demo_inc004_reaches_run_completed(client):
    with patch("app.main.asyncio.sleep", AsyncMock()):
        events = _events(client, "/api/investigate/inc-004?demo=true")
    assert events[0]["event"] == "demo_mode_started"
    assert events[0]["data"]["incident_id"] == "inc-004"
    assert events[-1]["event"] == "run_completed"


def test_demo_uses_selected_incident_never_falls_back(client):
    # An unsupported incident must fail for THAT incident id — never substitute inc-001.
    events = _events(client, "/api/investigate/inc-005?demo=true")
    failed = next(e for e in events if e["event"] == "run_failed")
    assert "inc-005" in failed["data"]["error"]
    assert "inc-001" not in failed["data"]["error"]
    # and the banner (if any) must reference inc-005, not another incident
    started = next((e for e in events if e["event"] == "demo_mode_started"), None)
    if started:
        assert started["data"]["incident_id"] == "inc-005"


def test_demo_banner_incident_matches_request(client):
    with patch("app.main.asyncio.sleep", AsyncMock()):
        events = _events(client, "/api/investigate/inc-003?demo=true")
    assert events[0]["data"]["incident_id"] == "inc-003"


def test_reset_memory_bank_public_disabled(client):
    with (
        patch("app.main.settings.allow_public_reset", False),
        patch("app.main.settings.admin_token", "secret123"),
    ):
        # without token -> 403
        resp = client.delete("/api/memory/bank")
        assert resp.status_code == 403
        assert "Admin token required" in resp.json()["detail"]

        # with wrong token -> 403
        resp = client.delete("/api/memory/bank?token=wrong")
        assert resp.status_code == 403

        # with valid token in query -> 200
        with patch("app.memory.service.MemoryService.reset_bank", AsyncMock(return_value=None)):
            resp = client.delete("/api/memory/bank?token=secret123")
            assert resp.status_code == 200

        # with valid token in Authorization header -> 200
        with patch("app.memory.service.MemoryService.reset_bank", AsyncMock(return_value=None)):
            resp = client.delete("/api/memory/bank", headers={"Authorization": "Bearer secret123"})
            assert resp.status_code == 200


def test_serve_static_index(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "html" in resp.headers.get("content-type", "").lower()


