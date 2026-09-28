"""Tests for app.eval — transparent keyword-based evaluator."""
import pytest

from app.agent.types import DiagnosisResult
from app.eval import EvalResult, evaluate

_GT_BAD_DEPLOY = {
    "root_cause": "...",
    "root_cause_category": "bad_deploy",
    "expected_evidence": ["revision 12", "v2-broken", "nil pointer", "HTTP 500", "rollback"],
    "canonical_fix": "kubectl rollout undo deployment/orders",
    "forbidden_categories": ["resource_exhaustion", "network_fault", "config_error"],
}

_GOOD_DIAG = DiagnosisResult(
    incident_id="inc-003",
    root_cause="Deployment revision 12 introduced rlvr/orders:v2-broken with a nil pointer dereference causing HTTP 500 errors on /checkout.",
    evidence=["revision 12", "v2-broken image", "nil pointer in checkoutHandler"],
    recommended_remediation="kubectl rollout undo deployment/orders -n rlvr-target to rollback the bad deploy.",
    confidence=0.92,
    memory_used=False,
    tool_calls=["get_logs", "get_metrics"],
    status="completed",
)


# ── category matching ─────────────────────────────────────────────────────────

def test_category_match_when_present():
    result = evaluate(_GOOD_DIAG, _GT_BAD_DEPLOY)
    assert result.root_cause_category_match is True


def test_category_no_match():
    diag = _GOOD_DIAG.model_copy(update={
        "root_cause": "CPU spike caused OOM on the node — resource issue",
        "recommended_remediation": "Add more CPU",
    })
    result = evaluate(diag, _GT_BAD_DEPLOY)
    assert result.root_cause_category_match is False


def test_category_match_empty_gt():
    gt = {**_GT_BAD_DEPLOY, "root_cause_category": ""}
    result = evaluate(_GOOD_DIAG, gt)
    # Empty category → defaults to True (can't fail on absent criteria)
    assert result.root_cause_category_match is True


# ── evidence coverage ─────────────────────────────────────────────────────────

def test_evidence_score_full():
    result = evaluate(_GOOD_DIAG, _GT_BAD_DEPLOY)
    assert result.evidence_score >= 0.4
    assert len(result.evidence_keywords_found) >= 2


def test_evidence_score_empty_expected():
    gt = {**_GT_BAD_DEPLOY, "expected_evidence": []}
    result = evaluate(_GOOD_DIAG, gt)
    assert result.evidence_score == 1.0  # 0/0 → 1.0 (no expectations)


def test_evidence_score_none_found():
    diag = _GOOD_DIAG.model_copy(update={
        "root_cause": "Something completely unrelated",
        "evidence": [],
        "recommended_remediation": "reboot server",
    })
    result = evaluate(diag, _GT_BAD_DEPLOY)
    assert result.evidence_score == 0.0
    assert result.evidence_keywords_found == []


def test_evidence_keywords_list():
    result = evaluate(_GOOD_DIAG, _GT_BAD_DEPLOY)
    for kw in result.evidence_keywords_found:
        assert kw in _GT_BAD_DEPLOY["expected_evidence"]


# ── remediation check ─────────────────────────────────────────────────────────

def test_remediation_ok_when_canonical_present():
    result = evaluate(_GOOD_DIAG, _GT_BAD_DEPLOY)
    assert result.remediation_ok is True


def test_remediation_fails_when_absent():
    diag = _GOOD_DIAG.model_copy(update={
        "recommended_remediation": "Restart the database and check connection pool",
    })
    result = evaluate(diag, _GT_BAD_DEPLOY)
    assert result.remediation_ok is False


def test_remediation_ok_empty_canonical():
    gt = {**_GT_BAD_DEPLOY, "canonical_fix": ""}
    result = evaluate(_GOOD_DIAG, gt)
    assert result.remediation_ok is True


# ── forbidden category check ──────────────────────────────────────────────────

def test_forbidden_not_triggered_for_correct_diagnosis():
    result = evaluate(_GOOD_DIAG, _GT_BAD_DEPLOY)
    assert result.forbidden_category_triggered is False


def test_forbidden_triggered_when_wrong_category_in_root_cause():
    diag = _GOOD_DIAG.model_copy(update={
        "root_cause": "Resource exhaustion: CPU was maxed out causing OOM and pod crashes.",
    })
    result = evaluate(diag, _GT_BAD_DEPLOY)
    assert result.forbidden_category_triggered is True


def test_forbidden_not_triggered_on_empty_list():
    gt = {**_GT_BAD_DEPLOY, "forbidden_categories": []}
    result = evaluate(_GOOD_DIAG, gt)
    assert result.forbidden_category_triggered is False


# ── overall_pass ──────────────────────────────────────────────────────────────

def test_overall_pass_for_good_diagnosis():
    result = evaluate(_GOOD_DIAG, _GT_BAD_DEPLOY)
    assert result.overall_pass is True


def test_overall_fail_low_evidence():
    diag = _GOOD_DIAG.model_copy(update={
        "root_cause": "Bad deploy caused issues",
        "evidence": [],
        "recommended_remediation": "kubectl rollout undo deployment/orders",
    })
    result = evaluate(diag, _GT_BAD_DEPLOY)
    assert result.evidence_score < 0.4
    assert result.overall_pass is False


def test_overall_fail_forbidden():
    diag = _GOOD_DIAG.model_copy(update={
        "root_cause": "Resource exhaustion: node ran out of CPU after bad deploy",
    })
    result = evaluate(diag, _GT_BAD_DEPLOY)
    assert result.forbidden_category_triggered is True
    assert result.overall_pass is False


# ── return type ───────────────────────────────────────────────────────────────

def test_returns_eval_result_model():
    result = evaluate(_GOOD_DIAG, _GT_BAD_DEPLOY)
    assert isinstance(result, EvalResult)
    assert result.incident_id == "inc-003"


def test_notes_are_non_empty():
    result = evaluate(_GOOD_DIAG, _GT_BAD_DEPLOY)
    assert len(result.notes) >= 4


def test_evidence_score_clamped_between_0_and_1():
    result = evaluate(_GOOD_DIAG, _GT_BAD_DEPLOY)
    assert 0.0 <= result.evidence_score <= 1.0


# ── inc-004 bad_deploy scenario ───────────────────────────────────────────────

_GT_INC_004 = {
    "root_cause_category": "bad_deploy",
    "expected_evidence": [
        "rollout", "revision 8", "rlvr/shipping:v99-nonexistent",
        "ImagePullBackOff", "manifest unknown", "ProgressDeadlineExceeded",
        "replicas unavailable", "rollback",
    ],
    "canonical_fix": "kubectl rollout undo deployment/shipping -n rlvr-target",
    "forbidden_categories": ["resource_exhaustion", "node_failure", "network_fault"],
}

_DIAG_INC_004 = DiagnosisResult(
    incident_id="inc-004",
    root_cause=(
        "Deployment revision 8 specified non-existent image rlvr/shipping:v99-nonexistent. "
        "ImagePullBackOff on all new pods. manifest unknown from registry. "
        "ProgressDeadlineExceeded — rollout stuck. Replicas unavailable."
    ),
    evidence=["revision 8", "ImagePullBackOff", "ProgressDeadlineExceeded"],
    recommended_remediation="kubectl rollout undo deployment/shipping -n rlvr-target",
    confidence=0.94,
    memory_used=True,
    tool_calls=["get_logs", "get_metrics", "get_trace", "get_pod_status"],
    status="completed",
)


def test_inc004_passes_evaluation():
    result = evaluate(_DIAG_INC_004, _GT_INC_004)
    assert result.overall_pass is True
    assert result.root_cause_category_match is True
    assert result.remediation_ok is True
    assert result.evidence_score >= 0.4


def test_inc004_memory_used_does_not_affect_score():
    diag_no_mem = _DIAG_INC_004.model_copy(update={"memory_used": False})
    with_mem = evaluate(_DIAG_INC_004, _GT_INC_004)
    without_mem = evaluate(diag_no_mem, _GT_INC_004)
    assert with_mem.evidence_score == without_mem.evidence_score
    assert with_mem.overall_pass == without_mem.overall_pass
