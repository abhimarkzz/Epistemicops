"""Read-only investigation tools wrapping FixtureService.

These are the only data-access paths available to the agent.
No shell, kubectl, filesystem mutation, or real infrastructure access.
"""

from __future__ import annotations

from typing import Any

from app.fixtures import FixtureService

TOOL_ORDER = ["get_logs", "get_metrics", "get_trace", "get_pod_status"]


class InvestigationTools:
    def __init__(self, service: FixtureService) -> None:
        self._svc = service

    def get_logs(self, incident_id: str) -> list[str]:
        return self._svc.get_logs(incident_id)

    def get_metrics(self, incident_id: str) -> dict[str, Any]:
        return self._svc.get_metrics(incident_id)

    def get_trace(self, incident_id: str) -> list[dict[str, Any]] | dict[str, Any] | None:
        return self._svc.get_trace(incident_id)

    def get_pod_status(self, incident_id: str) -> dict[str, Any] | None:
        return self._svc.get_pod_status(incident_id)
