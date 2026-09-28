"""Transparent, keyword-based evaluator for incident diagnosis quality.

No AI judge.  Scoring is deterministic: substring checks and token overlap.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.agent.types import DiagnosisResult


class EvalResult(BaseModel):
    incident_id: str
    root_cause_category_match: bool
    evidence_keywords_found: list[str]
    evidence_score: float
    remediation_ok: bool
    forbidden_category_triggered: bool
    overall_pass: bool
    notes: list[str]


def evaluate(
    diagnosis: DiagnosisResult,
    ground_truth: dict[str, Any],
) -> EvalResult:
    """Score a diagnosis against the hidden ground truth for this incident.

    Criteria (all keyword-based, fully transparent):
    - root_cause_category_match: category keywords appear in diagnosis text
    - evidence_score: fraction of expected_evidence terms found in diagnosis text
    - remediation_ok: canonical_fix keywords appear in recommended_remediation
    - forbidden_category_triggered: root_cause mentions a forbidden category term
    - overall_pass: category match AND evidence_score >= 0.4 AND remediation_ok
                    AND NOT forbidden_category_triggered
    """
    full_text = " ".join(
        [
            diagnosis.root_cause,
            diagnosis.recommended_remediation,
            *diagnosis.evidence,
        ]
    ).lower()

    notes: list[str] = []

    # ── category match ──────────────────────────────────────────────────────────
    raw_cat = (ground_truth.get("root_cause_category") or "").lower()
    cat_tokens = [t for t in raw_cat.replace("_", " ").split() if len(t) > 3]
    cat_match = any(t in full_text for t in cat_tokens) if cat_tokens else True
    if cat_match:
        notes.append(f"category '{raw_cat}': matched (found tokens {cat_tokens})")
    else:
        notes.append(f"category '{raw_cat}': NOT matched (tokens {cat_tokens} absent)")

    # ── evidence coverage ───────────────────────────────────────────────────────
    expected = ground_truth.get("expected_evidence") or []
    found = [kw for kw in expected if kw.lower() in full_text]
    evidence_score = round(len(found) / len(expected), 2) if expected else 1.0
    notes.append(f"evidence: {len(found)}/{len(expected)} terms found → score {evidence_score}")

    # ── remediation check ───────────────────────────────────────────────────────
    canonical = (ground_truth.get("canonical_fix") or "").lower()
    canonical_tokens = [t for t in canonical.split() if len(t) > 3]
    remediation_ok = any(t in full_text for t in canonical_tokens) if canonical_tokens else True
    if remediation_ok:
        notes.append("remediation: canonical fix tokens matched")
    else:
        notes.append(f"remediation: canonical fix tokens not found ({canonical_tokens})")

    # ── forbidden category check ────────────────────────────────────────────────
    # Match the category as a phrase (e.g. "resource exhaustion") so common words
    # like "error" in "errors" don't produce false positives.
    forbidden = ground_truth.get("forbidden_categories") or []
    triggered: list[str] = []
    root_lower = diagnosis.root_cause.lower()
    for fc in forbidden:
        fc_phrase = fc.replace("_", " ").lower()
        if fc_phrase in root_lower:
            triggered.append(fc)
    forbidden_hit = bool(triggered)
    if forbidden_hit:
        notes.append(f"FORBIDDEN categories in root_cause: {triggered}")
    else:
        notes.append("no forbidden categories in root_cause")

    overall = cat_match and evidence_score >= 0.4 and remediation_ok and not forbidden_hit

    return EvalResult(
        incident_id=diagnosis.incident_id,
        root_cause_category_match=cat_match,
        evidence_keywords_found=found,
        evidence_score=evidence_score,
        remediation_ok=remediation_ok,
        forbidden_category_triggered=forbidden_hit,
        overall_pass=overall,
        notes=notes,
    )
