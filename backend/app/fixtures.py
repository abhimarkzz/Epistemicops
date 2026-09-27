"""
Fixture schema, validation, and read-only service for EpistemicOps incidents.

Ground truth (expected root cause, resolution, evidence keywords) is stored
in JSON files under the `_ground_truth` key.  The FixtureService NEVER returns
that data through agent-facing methods; only `get_ground_truth()` exposes it,
and that method is reserved for the post-run evaluator.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ── ground truth (hidden from agent) ──────────────────────────────────────────


class GroundTruth(BaseModel):
    """Expected answers for evaluation only. Must never be exposed to the agent."""

    model_config = ConfigDict(extra="allow")

    root_cause: str
    root_cause_category: str | None = None
    # Legacy fields kept for backward compat with hand-crafted inc-001/002
    root_cause_file: str | None = None
    root_cause_line: int | None = None
    resolution_steps: list[str] = []
    expected_evidence: list[str] = []
    canonical_fix: str | None = None
    fix_tool: str | None = None
    forbidden_categories: list[str] = []


# ── agent-visible incident fixture ────────────────────────────────────────────


class IncidentFixture(BaseModel):
    """
    Full fixture model including hidden ground truth.

    Call `public_dict()` to get the agent-visible subset.
    The `ground_truth` field is always excluded from that view.
    """

    model_config = ConfigDict(populate_by_name=True)

    # Required
    id: str
    title: str

    # Descriptive
    severity: str = "unknown"
    service: str = "unknown"
    category: str | None = None
    description: str | None = None

    # Structured evidence (new fixtures)
    alert: dict[str, Any] | None = None
    logs: list[str] = []
    metrics: dict[str, Any] = {}
    traces: list[dict[str, Any]] | dict[str, Any] | None = None
    pod_status: dict[str, Any] | None = None
    k8s_events: list[dict[str, Any]] = []
    deployments: dict[str, Any] | None = None
    node_health: dict[str, Any] | None = None

    # Legacy evidence fields (inc-001 / inc-002 schema)
    symptoms: list[str] = []
    topology: dict[str, Any] | None = None
    recent_deploys: list[dict[str, Any]] = []
    timestamp: str | None = None
    duration_minutes: int | None = None
    environment: str | None = None

    # Attribution
    tags: list[str] = []
    source: str | None = None
    source_record_id: str | None = None

    # Hidden ground truth — alias matches the JSON key `_ground_truth`
    ground_truth: GroundTruth = Field(alias="_ground_truth")

    def public_dict(self) -> dict[str, Any]:
        """Return only agent-visible fields. Ground truth is always excluded."""
        return self.model_dump(exclude={"ground_truth"}, exclude_none=True)


# ── errors ────────────────────────────────────────────────────────────────────


class IncidentNotFoundError(KeyError):
    def __init__(self, incident_id: str) -> None:
        self.incident_id = incident_id
        super().__init__(f"Incident '{incident_id}' not found")


# ── fixture service ───────────────────────────────────────────────────────────


class FixtureService:
    """
    Read-only access to incident fixtures.

    Agent-facing methods (get_incident, get_logs, get_metrics, get_trace,
    get_pod_status) never return ground-truth fields.

    get_ground_truth() is evaluator-only and must not be called from agent tools.
    """

    def __init__(self, incidents_dir: Path) -> None:
        self._fixtures: dict[str, IncidentFixture] = {}
        for path in sorted(incidents_dir.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                fixture = IncidentFixture.model_validate(data)
                self._fixtures[fixture.id] = fixture
            except Exception as exc:
                raise ValueError(f"Failed to load fixture '{path.name}': {exc}") from exc

    # ── agent-facing tools ────────────────────────────────────────────────────

    def list_incidents(self) -> list[dict[str, Any]]:
        """Return a list of all incidents (public fields only)."""
        return [f.public_dict() for f in self._fixtures.values()]

    def get_incident(self, incident_id: str) -> dict[str, Any]:
        """Return a single incident by id (public fields only)."""
        return self._require(incident_id).public_dict()

    def get_logs(self, incident_id: str) -> list[str]:
        """Return log lines for an incident."""
        return self._require(incident_id).logs

    def get_metrics(self, incident_id: str) -> dict[str, Any]:
        """Return metric snapshot for an incident."""
        return self._require(incident_id).metrics

    def get_trace(self, incident_id: str) -> list[dict[str, Any]] | dict[str, Any] | None:
        """Return distributed trace data for an incident, or None if unavailable."""
        return self._require(incident_id).traces

    def get_pod_status(self, incident_id: str) -> dict[str, Any] | None:
        """Return Kubernetes pod status for an incident, or None if unavailable."""
        return self._require(incident_id).pod_status

    # ── evaluator-only ────────────────────────────────────────────────────────

    def get_ground_truth(self, incident_id: str) -> GroundTruth:
        """
        Return hidden ground truth for post-run evaluation.
        Must NOT be called from agent investigation tools.
        """
        return self._require(incident_id).ground_truth

    # ── internal ─────────────────────────────────────────────────────────────

    def _require(self, incident_id: str) -> IncidentFixture:
        if incident_id not in self._fixtures:
            raise IncidentNotFoundError(incident_id)
        return self._fixtures[incident_id]

    def __len__(self) -> int:
        return len(self._fixtures)

    def __contains__(self, incident_id: str) -> bool:
        return incident_id in self._fixtures
