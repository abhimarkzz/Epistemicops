"""
EpistemicOps dataset import script.

Inspects two Hugging Face datasets, identifies suitable incidents, normalizes
selected records into the EpistemicOps fixture format, and writes JSON files
to data/incidents/.

This script is reproducible: running it again overwrites the fixture files with
the same content.  It does NOT overwrite hand-crafted fixtures (inc-001, inc-002).

Usage
-----
    cd <project_root>
    source backend/.venv/bin/activate
    pip install datasets  # if not already installed
    python scripts/import_datasets.py

Datasets used
-------------
1. quantranger/sre-agent-eda-bundle  (Apache-2.0)
   Config: corpus
   Selected records: 011-bad_deploy_errors, 015-stuck_rollout, 009-cache_stampede

2. Snaseem2026/devops-incident-response  (no explicit license declared)
   Inspected only; no records normalized into fixtures (see notes below).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# ── paths ─────────────────────────────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).parent.parent
INCIDENTS_DIR = _PROJECT_ROOT / "data" / "incidents"
INCIDENTS_DIR.mkdir(parents=True, exist_ok=True)

# IDs of hand-crafted fixtures that must not be overwritten by this script
_PROTECTED_IDS = {"inc-001", "inc-002"}

# ── schema inspection ─────────────────────────────────────────────────────────


def inspect_dataset_1() -> None:
    """
    Inspect Snaseem2026/devops-incident-response.

    Schema: incident_id, title, severity, category, environment, description,
    symptoms (list), troubleshooting_conversation (list of role/message turns),
    root_cause, resolution_steps, prevention_measures, time_to_detect,
    time_to_resolve, impact, tags, related_technologies.

    Evidence modalities: free-text symptoms and a Q&A conversation transcript.
    There are NO structured pod status, metrics, or trace objects — only prose
    descriptions that mention values.  No license is declared on HuggingFace.

    Decision: not used for normalization because:
      • Evidence is prose, not structured (no pod_status, metrics dict, traces).
      • No explicit license.
    """
    try:
        from datasets import load_dataset  # type: ignore
    except ImportError:
        print("datasets not installed — skipping dataset 1 inspection")
        return

    print("=== Dataset 1: Snaseem2026/devops-incident-response ===")
    ds = load_dataset("Snaseem2026/devops-incident-response", trust_remote_code=False)
    total = sum(len(s) for s in ds.values())
    print(f"  Splits: {list(ds.keys())} | Total records: {total}")
    print(f"  Columns: {ds['train'].column_names}")
    print("  Evidence modalities: prose symptoms, Q&A conversation transcript")
    print("  Structured evidence: NONE (no pod_status, metrics dict, or traces)")
    print("  License: not declared")
    print("  → Not used for fixture normalization (see docstring for rationale)\n")


def inspect_dataset_2() -> None:
    """
    Inspect quantranger/sre-agent-eda-bundle, config 'corpus'.

    Schema:
      trajectory_id, provider, incident, scenario_id, difficulty, source,
      alert (dict), scenario (dict), evidence (dict of named JSON blobs),
      answer (dict), remediation (dict), trajectory (list), meta (dict).

    Evidence keys vary by scenario; common keys:
      k8s_pods.json, k8s_events.json, k8s_pod_logs.json, k8s_deployments.json,
      k8s_node_health.json, prometheus_metrics.json, prometheus_alerts.json,
      traces.json (present for ~30% of scenarios).

    License: Apache-2.0.
    """
    try:
        from datasets import load_dataset  # type: ignore
    except ImportError:
        print("datasets not installed — skipping dataset 2 inspection")
        return

    print("=== Dataset 2: quantranger/sre-agent-eda-bundle (corpus config) ===")
    ds = load_dataset("quantranger/sre-agent-eda-bundle", "corpus", trust_remote_code=False)
    split = ds["train"]
    print(f"  Total records: {len(split)}")
    print(f"  Columns: {split.column_names}")

    # Summarize unique base scenarios (no seed variants)
    base = [r for r in split if not any(f"-s{i:03d}" in r["scenario_id"] for i in range(100))]
    print(f"  Base scenarios (no seed suffix): {len(base)}")
    print("\n  Candidate scenarios selected for EpistemicOps:")

    targets = {"011-bad_deploy_errors", "015-stuck_rollout", "009-cache_stampede"}
    for row in split:
        if row["scenario_id"] in targets:
            ev_keys = list(row["evidence"].keys())
            has_traces = "traces.json" in ev_keys
            print(
                f"    {row['scenario_id']}"
                f" | category={row['meta'].get('root_cause_category','?')}"
                f" | difficulty={row['difficulty']}"
                f" | evidence={ev_keys}"
                f" | traces={'YES' if has_traces else 'NO'}"
            )
    print()


# ── normalization helpers ─────────────────────────────────────────────────────


def _normalize_record(row: dict[str, Any], inc_id: str) -> dict[str, Any]:
    """
    Normalize a corpus record into the EpistemicOps fixture format.

    Only fields that actually exist in the source record are included.
    No values are fabricated or renamed to sound like a different modality.
    """
    sc = row["scenario"]
    alert_raw = row["alert"]
    ev = row["evidence"]
    answer = row["answer"]
    rem = row["remediation"]
    meta = row["meta"]

    # Construct the alert dict from the source alert object
    alert: dict[str, Any] = {
        "title": alert_raw.get("title", ""),
        "state": alert_raw.get("state", "alerting"),
        "labels": alert_raw.get("commonLabels", {}),
        "annotations": alert_raw.get("commonAnnotations", {}),
    }

    # Logs come from k8s_pod_logs.json
    log_blob = ev.get("k8s_pod_logs.json", {})
    logs: list[str] = log_blob.get("lines", []) if isinstance(log_blob, dict) else []

    # Metrics come from prometheus_metrics.json
    metrics: dict[str, Any] = ev.get("prometheus_metrics.json", {})

    # Traces only if actually present in evidence
    traces = ev.get("traces.json")  # None if absent — not fabricated

    # Pod status from k8s_pods.json
    pod_status: dict[str, Any] | None = ev.get("k8s_pods.json")

    # K8s events from k8s_events.json
    k8s_events_blob = ev.get("k8s_events.json", {})
    k8s_events: list[dict[str, Any]] = (
        k8s_events_blob.get("events", []) if isinstance(k8s_events_blob, dict) else []
    )

    # Deployment info from k8s_deployments.json
    deployments: dict[str, Any] | None = ev.get("k8s_deployments.json")

    # Node health from k8s_node_health.json
    node_health: dict[str, Any] | None = ev.get("k8s_node_health.json")

    # Derive tags
    tags: list[str] = [
        meta.get("root_cause_category", ""),
        row["incident"],
        row["source"],
    ]
    tags = [t for t in tags if t]  # drop empty strings

    # Ground truth (never exposed to the agent)
    ground_truth: dict[str, Any] = {
        "root_cause": _build_root_cause_description(row),
        "root_cause_category": meta.get("root_cause_category"),
        "resolution_steps": _build_resolution_steps(rem),
        "expected_evidence": answer.get("required_keywords", []),
        "canonical_fix": rem.get("canonical_fix"),
        "fix_tool": rem.get("fix_tool"),
        "forbidden_categories": answer.get("forbidden_categories", []),
    }

    fixture: dict[str, Any] = {
        "id": inc_id,
        "title": alert_raw.get("title", row["incident"]),
        "severity": sc.get("severity", "unknown"),
        "service": alert_raw.get("commonLabels", {}).get("service", "unknown"),
        "category": meta.get("root_cause_category"),
        "description": alert_raw.get("commonAnnotations", {}).get(
            "description", alert_raw.get("commonAnnotations", {}).get("summary", "")
        ),
        "alert": alert,
        "logs": logs,
        "metrics": metrics,
        "traces": traces,
        "pod_status": pod_status,
        "k8s_events": k8s_events,
        "deployments": deployments,
        "node_health": node_health,
        "tags": tags,
        "source": "quantranger/sre-agent-eda-bundle",
        "source_record_id": row["scenario_id"],
        "_ground_truth": ground_truth,
    }

    # Remove None-valued optional keys to keep JSON compact
    return {k: v for k, v in fixture.items() if v is not None or k == "_ground_truth"}


def _build_root_cause_description(row: dict[str, Any]) -> str:
    """Construct a prose root-cause from answer keywords and scenario metadata."""
    scenario = row["scenario"]
    failure_mode = scenario.get("failure_mode", "")
    keywords = row["answer"].get("required_keywords", [])
    return (
        f"Failure mode: {failure_mode}. "
        f"Key evidence to identify: {', '.join(keywords[:5])}."
    )


def _build_resolution_steps(rem: dict[str, Any]) -> list[str]:
    steps = []
    if rem.get("canonical_fix"):
        steps.append(f"Apply fix: {rem['canonical_fix']}")
    if rem.get("primary_metric") and rem.get("recovery_check"):
        steps.append(f"Verify recovery: {rem['recovery_check']}")
    return steps or ["See canonical_fix in ground truth."]


# ── selection and export ──────────────────────────────────────────────────────

SELECTED: list[tuple[str, str]] = [
    # (scenario_id,  fixture_id)
    ("011-bad_deploy_errors", "inc-003"),
    ("015-stuck_rollout", "inc-004"),
    ("009-cache_stampede", "inc-005"),
]


def export_fixtures() -> None:
    """Load selected corpus records and write normalized fixture JSON files."""
    try:
        from datasets import load_dataset  # type: ignore
    except ImportError:
        print("ERROR: 'datasets' package not installed.")
        print("Install it with: pip install datasets")
        sys.exit(1)

    ds = load_dataset("quantranger/sre-agent-eda-bundle", "corpus", trust_remote_code=False)
    split = ds["train"]

    # Index by scenario_id for O(1) lookup
    by_id = {row["scenario_id"]: row for row in split}

    for scenario_id, inc_id in SELECTED:
        if inc_id in _PROTECTED_IDS:
            print(f"  SKIP {inc_id} — protected hand-crafted fixture")
            continue

        row = by_id.get(scenario_id)
        if row is None:
            print(f"  WARNING: scenario '{scenario_id}' not found in corpus — skipping")
            continue

        fixture = _normalize_record(row, inc_id)
        out_path = INCIDENTS_DIR / f"{inc_id}-{row['incident'].replace('_','-')}.json"
        out_path.write_text(json.dumps(fixture, indent=2, ensure_ascii=False))
        print(f"  Written: {out_path.name}")


# ── selection rationale (printed on run) ─────────────────────────────────────


def print_selection_rationale() -> None:
    print("=" * 68)
    print("SELECTED SCENARIOS")
    print("=" * 68)
    rows = [
        (
            "inc-003",
            "011-bad_deploy_errors",
            "bad_deploy",
            "Initial cold incident. Broken image causes 8% 5xx on /checkout. "
            "No traces — agent must diagnose from logs, events, and deployment history.",
        ),
        (
            "inc-004",
            "015-stuck_rollout",
            "bad_deploy",
            "Similar later incident. Nonexistent image tag causes ImagePullBackOff. "
            "Memory reuse from inc-003 should shorten MTTD (same fix: rollback).",
        ),
        (
            "inc-005",
            "009-cache_stampede",
            "saturation",
            "Optional third incident. Redis FLUSHALL triggers thundering herd on Postgres. "
            "Includes distributed traces — exercises the trace evidence modality.",
        ),
    ]
    for inc_id, src_id, category, rationale in rows:
        print(f"\n  {inc_id}  ←  {src_id}  [{category}]")
        print(f"  {rationale}")
    print()
    print("GROUND-TRUTH PROTECTION")
    print("-" * 68)
    print("  _ground_truth keys (root_cause, resolution_steps, expected_evidence,")
    print("  canonical_fix, fix_tool, forbidden_categories) are stored in the JSON")
    print("  fixture file under the '_ground_truth' key.  FixtureService.public_dict()")
    print("  always excludes this key.  Only FixtureService.get_ground_truth() returns")
    print("  it, and that method is reserved for the post-run evaluator.\n")


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    print_selection_rationale()
    print("=== Inspecting datasets ===\n")
    inspect_dataset_1()
    inspect_dataset_2()
    print("=== Exporting fixtures ===\n")
    export_fixtures()
    print("\nDone.")


if __name__ == "__main__":
    main()
