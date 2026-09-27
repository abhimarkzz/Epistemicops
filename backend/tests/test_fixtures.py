"""
Tests for the fixture schema, service, and ground-truth isolation.

All five requirements from the spec are covered:
  1. Fixtures load correctly.
  2. Invalid fixtures fail validation.
  3. Agent-visible data does not contain hidden expected-answer fields.
  4. Unknown incident IDs return a controlled error.
  5. Tool responses are deterministic.
"""

import json
import tempfile
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.fixtures import (
    FixtureService,
    GroundTruth,
    IncidentFixture,
    IncidentNotFoundError,
)

# ── helpers ───────────────────────────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).parent.parent.parent
INCIDENTS_DIR = _PROJECT_ROOT / "data" / "incidents"

MINIMAL_FIXTURE: dict = {
    "id": "inc-test-001",
    "title": "Test incident",
    "_ground_truth": {
        "root_cause": "Something broke.",
        "resolution_steps": ["Fix it."],
    },
}

FULL_FIXTURE: dict = {
    "id": "inc-test-002",
    "title": "Full test incident",
    "severity": "critical",
    "service": "orders",
    "category": "bad_deploy",
    "description": "Orders 5xx spike after bad image rollout.",
    "alert": {"title": "High error rate", "state": "alerting", "labels": {}},
    "logs": ["2026-01-01T00:00:00Z ERROR something went wrong"],
    "metrics": {"app_error_rate": 0.08},
    "traces": None,
    "pod_status": {"namespace": "rlvr-target", "pods": []},
    "k8s_events": [],
    "deployments": {"deployment": "orders", "current_revision": 12},
    "node_health": {"nodes": []},
    "tags": ["bad_deploy", "orders"],
    "source": "test",
    "source_record_id": "test-001",
    "_ground_truth": {
        "root_cause": "Nil pointer dereference in v2-broken image.",
        "root_cause_category": "bad_deploy",
        "resolution_steps": ["kubectl rollout undo deployment/orders -n rlvr-target"],
        "expected_evidence": ["revision 12", "v2-broken", "rollback"],
        "canonical_fix": "kubectl rollout undo deployment/orders -n rlvr-target",
        "fix_tool": "rollback_deployment",
        "forbidden_categories": ["resource_exhaustion"],
    },
}

HIDDEN_FIELD_NAMES = {
    "_ground_truth",
    "ground_truth",
    "root_cause",
    "root_cause_category",
    "expected_evidence",
    "canonical_fix",
    "fix_tool",
    "forbidden_categories",
    "resolution_steps",
}


def _make_service(*fixtures: dict) -> FixtureService:
    """Write fixtures to a temp dir and return a FixtureService over them."""
    tmp = tempfile.mkdtemp()
    for f in fixtures:
        path = Path(tmp) / f"{f['id']}.json"
        path.write_text(json.dumps(f))
    return FixtureService(Path(tmp))


# ── 1. Fixtures load correctly ────────────────────────────────────────────────


def test_load_minimal_fixture():
    svc = _make_service(MINIMAL_FIXTURE)
    assert "inc-test-001" in svc


def test_load_full_fixture():
    svc = _make_service(FULL_FIXTURE)
    inc = svc.get_incident("inc-test-002")
    assert inc["id"] == "inc-test-002"
    assert inc["service"] == "orders"


def test_load_real_fixtures():
    """All fixtures in data/incidents/ parse without error."""
    svc = FixtureService(INCIDENTS_DIR)
    assert len(svc) >= 2, "Expected at least 2 incident fixtures"


def test_real_fixture_ids_present():
    svc = FixtureService(INCIDENTS_DIR)
    assert "inc-001" in svc
    assert "inc-002" in svc
    assert "inc-003" in svc
    assert "inc-004" in svc
    assert "inc-005" in svc


def test_fixture_has_ground_truth():
    """Ground truth is accessible via get_ground_truth (evaluator path)."""
    svc = _make_service(FULL_FIXTURE)
    gt = svc.get_ground_truth("inc-test-002")
    assert isinstance(gt, GroundTruth)
    assert gt.root_cause_category == "bad_deploy"
    assert "revision 12" in gt.expected_evidence


# ── 2. Invalid fixtures fail validation ───────────────────────────────────────


def test_missing_id_fails():
    bad = {
        "title": "No ID",
        "_ground_truth": {"root_cause": "x"},
    }
    with pytest.raises(ValidationError):
        IncidentFixture.model_validate(bad)


def test_missing_title_fails():
    bad = {"id": "inc-x", "_ground_truth": {"root_cause": "x"}}
    with pytest.raises(ValidationError):
        IncidentFixture.model_validate(bad)


def test_missing_ground_truth_fails():
    bad = {"id": "inc-x", "title": "No ground truth"}
    with pytest.raises(ValidationError):
        IncidentFixture.model_validate(bad)


def test_missing_root_cause_in_ground_truth_fails():
    bad = {
        "id": "inc-x",
        "title": "Bad GT",
        "_ground_truth": {"resolution_steps": []},  # root_cause missing
    }
    with pytest.raises(ValidationError):
        IncidentFixture.model_validate(bad)


def test_invalid_fixture_directory_raises():
    """FixtureService raises ValueError for a malformed JSON file."""
    tmp = tempfile.mkdtemp()
    bad_path = Path(tmp) / "bad.json"
    bad_path.write_text('{"id": "x", "title": "broken"')  # truncated JSON
    with pytest.raises(Exception):
        FixtureService(Path(tmp))


# ── 3. Agent-visible data does not contain hidden expected-answer fields ───────


def test_public_dict_excludes_ground_truth():
    svc = _make_service(FULL_FIXTURE)
    pub = svc.get_incident("inc-test-002")
    for key in HIDDEN_FIELD_NAMES:
        assert key not in pub, f"Ground-truth field '{key}' leaked into public_dict"


def test_list_incidents_excludes_ground_truth():
    svc = _make_service(FULL_FIXTURE)
    for inc in svc.list_incidents():
        for key in HIDDEN_FIELD_NAMES:
            assert key not in inc, f"Field '{key}' leaked in list_incidents"


def test_real_fixtures_no_ground_truth_leak():
    """Every real fixture's public view must be free of answer fields."""
    svc = FixtureService(INCIDENTS_DIR)
    for inc in svc.list_incidents():
        for key in HIDDEN_FIELD_NAMES:
            assert key not in inc, (
                f"Ground-truth field '{key}' found in public view of incident {inc.get('id')}"
            )


def test_get_logs_no_ground_truth():
    svc = _make_service(FULL_FIXTURE)
    logs = svc.get_logs("inc-test-002")
    assert isinstance(logs, list)
    for line in logs:
        for key in ("root_cause", "resolution_steps", "expected_evidence"):
            assert key not in str(line)


def test_get_metrics_no_ground_truth():
    svc = _make_service(FULL_FIXTURE)
    m = svc.get_metrics("inc-test-002")
    assert isinstance(m, dict)
    for key in HIDDEN_FIELD_NAMES:
        assert key not in m


def test_trace_is_none_when_absent():
    svc = _make_service(FULL_FIXTURE)
    assert svc.get_trace("inc-test-002") is None


def test_trace_present_for_inc005():
    svc = FixtureService(INCIDENTS_DIR)
    trace = svc.get_trace("inc-005")
    assert trace is not None, "inc-005 (cache stampede) should have trace data"


# ── 4. Unknown incident IDs return a controlled error ─────────────────────────


def test_get_incident_unknown_raises():
    svc = _make_service(MINIMAL_FIXTURE)
    with pytest.raises(IncidentNotFoundError) as exc_info:
        svc.get_incident("does-not-exist")
    assert "does-not-exist" in str(exc_info.value)


def test_get_logs_unknown_raises():
    svc = _make_service(MINIMAL_FIXTURE)
    with pytest.raises(IncidentNotFoundError):
        svc.get_logs("does-not-exist")


def test_get_metrics_unknown_raises():
    svc = _make_service(MINIMAL_FIXTURE)
    with pytest.raises(IncidentNotFoundError):
        svc.get_metrics("does-not-exist")


def test_get_trace_unknown_raises():
    svc = _make_service(MINIMAL_FIXTURE)
    with pytest.raises(IncidentNotFoundError):
        svc.get_trace("does-not-exist")


def test_get_pod_status_unknown_raises():
    svc = _make_service(MINIMAL_FIXTURE)
    with pytest.raises(IncidentNotFoundError):
        svc.get_pod_status("does-not-exist")


def test_get_ground_truth_unknown_raises():
    svc = _make_service(MINIMAL_FIXTURE)
    with pytest.raises(IncidentNotFoundError):
        svc.get_ground_truth("does-not-exist")


# ── 5. Tool responses are deterministic ──────────────────────────────────────


def test_responses_are_deterministic():
    """Calling the same method twice returns identical results."""
    svc = _make_service(FULL_FIXTURE)
    assert svc.get_incident("inc-test-002") == svc.get_incident("inc-test-002")
    assert svc.get_logs("inc-test-002") == svc.get_logs("inc-test-002")
    assert svc.get_metrics("inc-test-002") == svc.get_metrics("inc-test-002")


def test_list_incidents_is_deterministic():
    svc = FixtureService(INCIDENTS_DIR)
    first = svc.list_incidents()
    second = svc.list_incidents()
    assert first == second


def test_list_incidents_order_is_stable():
    """Fixture loading is sorted by filename; order must not vary."""
    svc = FixtureService(INCIDENTS_DIR)
    ids = [i["id"] for i in svc.list_incidents()]
    assert ids == sorted(ids)


# ── HTTP endpoint smoke tests (via existing test_health.py patterns) ──────────


def test_http_incidents_no_ground_truth(client):
    """Regression: HTTP endpoint must not leak ground truth."""
    resp = client.get("/api/incidents")
    assert resp.status_code == 200
    for inc in resp.json():
        for key in HIDDEN_FIELD_NAMES:
            assert key not in inc, f"HTTP endpoint leaked field '{key}'"


def test_http_single_incident_no_ground_truth(client):
    resp = client.get("/api/incidents/inc-003")
    assert resp.status_code == 200
    body = resp.json()
    for key in HIDDEN_FIELD_NAMES:
        assert key not in body


def test_http_unknown_incident_404(client):
    resp = client.get("/api/incidents/does-not-exist")
    assert resp.status_code == 404


def test_http_logs_endpoint(client):
    resp = client.get("/api/incidents/inc-003/logs")
    assert resp.status_code == 200
    logs = resp.json()
    assert isinstance(logs, list)
    assert len(logs) > 0


def test_http_metrics_endpoint(client):
    resp = client.get("/api/incidents/inc-003/metrics")
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_http_trace_endpoint_null_for_no_trace(client):
    resp = client.get("/api/incidents/inc-003/trace")
    assert resp.status_code == 200
    assert resp.json() is None


def test_http_trace_endpoint_present_for_inc005(client):
    resp = client.get("/api/incidents/inc-005/trace")
    assert resp.status_code == 200
    assert resp.json() is not None


def test_http_pods_endpoint(client):
    resp = client.get("/api/incidents/inc-003/pods")
    assert resp.status_code == 200
    pods = resp.json()
    assert isinstance(pods, dict)
    assert "pods" in pods
