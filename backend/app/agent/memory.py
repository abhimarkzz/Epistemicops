"""Thin delegation layer: agent graph → MemoryService.

The agent graph imports query_incident_patterns and retain_incident_full.
All Hindsight API details live in app.memory.service — not here.
"""

from __future__ import annotations

from typing import Any

from app.agent.types import DiagnosisResult
from app.memory.service import get_memory_service


async def query_incident_patterns(query: str) -> str:
    """Reflect on Hindsight for patterns matching the query.

    Returns the answer text, or '' if nothing found or Hindsight unavailable.
    """
    result = await get_memory_service().query_memory(query)
    return result.answer


async def retain_incident_full(
    incident: dict[str, Any],
    diagnosis: DiagnosisResult,
) -> bool:
    """Retain a full postmortem via MemoryService (includes approval tracking).

    Returns True on success (Hindsight may still be processing in background).
    """
    try:
        await get_memory_service().retain_incident(incident, diagnosis)
        return True
    except Exception:
        return False
