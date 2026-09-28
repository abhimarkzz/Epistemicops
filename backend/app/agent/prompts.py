"""LLM prompt builders for the investigation agent.

No ground-truth fields are included in any prompt sent to the LLM.
build_postmortem_content never includes raw log lines.
"""

from __future__ import annotations

import json
from typing import Any

from .types import DiagnosisResult

SYSTEM_PROMPT = (
    "You are an expert SRE investigating a production incident. "
    "Analyze the evidence provided and identify the root cause. "
    "Base every conclusion strictly on the evidence given — do not guess. "
    "YOUR ENTIRE RESPONSE MUST BE A SINGLE VALID JSON OBJECT. "
    "Do not include any text, explanation, or markdown before or after the JSON. "
    "Do not wrap the JSON in code fences. Output only the raw JSON object."
)


def build_analysis_prompt(
    incident: dict[str, Any],
    memory_context: str | None,
    tool_results: dict[str, Any],
) -> str:
    parts: list[str] = []

    parts.append(
        f"INCIDENT: {incident.get('id')} "
        f"| service={incident.get('service', '?')} "
        f"| severity={incident.get('severity', '?')}"
    )
    if incident.get("description"):
        parts.append(f"Description: {incident['description']}")
    alert = incident.get("alert") or {}
    if alert.get("title"):
        parts.append(f"Alert: {alert['title']} ({alert.get('state', 'alerting')})")
    if incident.get("symptoms"):
        parts.append("Symptoms: " + "; ".join(incident["symptoms"]))

    if memory_context:
        parts.append(f"\n--- PRIOR INCIDENT PATTERNS (from memory) ---\n{memory_context}\n---")

    logs: list[str] = tool_results.get("logs") or []
    if logs:
        shown = logs[-20:]
        parts.append("\nLOGS (most recent):\n" + "\n".join(shown))

    metrics = tool_results.get("metrics")
    if metrics:
        parts.append(f"\nMETRICS:\n{json.dumps(metrics, indent=2)[:2000]}")

    pod_status = tool_results.get("pod_status")
    if pod_status:
        parts.append(f"\nPOD STATUS:\n{json.dumps(pod_status, indent=2)[:2000]}")

    trace = tool_results.get("trace")
    if trace:
        parts.append(f"\nTRACES:\n{json.dumps(trace, indent=2)[:1500]}")

    parts.append(
        '\nRespond with this JSON structure:\n'
        '{\n'
        '  "root_cause": "concise description of the root cause",\n'
        '  "evidence": ["key evidence item 1", "key evidence item 2"],\n'
        '  "recommended_remediation": "specific remediation steps",\n'
        '  "confidence": 0.85\n'
        '}'
    )
    return "\n".join(parts)


def build_postmortem_content(
    incident: dict[str, Any],
    diagnosis: DiagnosisResult,
) -> str:
    """Build a postmortem narrative for Hindsight retention.

    Raw log lines are intentionally excluded — only synthesized findings
    and diagnostic patterns are retained so the memory stays compact.
    """
    lines = [
        f"Incident Pattern: service={incident.get('service', '?')}, "
        f"category={incident.get('category', '?')}, "
        f"severity={incident.get('severity', '?')}",
        f"Root Cause: {diagnosis.root_cause}",
        "Diagnostic Evidence:",
    ]
    for item in diagnosis.evidence:
        lines.append(f"  - {item}")
    lines.append(f"Remediation: {diagnosis.recommended_remediation}")
    lines.append(f"Confidence: {diagnosis.confidence:.0%}")
    alert = incident.get("alert") or {}
    if alert.get("title"):
        lines.append(f"Alert Pattern: {alert['title']}")
    if incident.get("description"):
        lines.append(f"Context: {incident['description']}")
    return "\n".join(lines)
