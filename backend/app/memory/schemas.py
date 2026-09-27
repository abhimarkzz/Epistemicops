"""Pydantic models for the EpistemicOps memory subsystem.

These are application-level types; Hindsight-specific types do not appear here.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ApprovalStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class PostmortemRecord(BaseModel):
    """Tracks one retained incident postmortem and its human approval state."""

    incident_id: str
    service: str = "unknown"
    category: str | None = None
    severity: str = "unknown"
    retained_at: datetime
    approval_status: ApprovalStatus = ApprovalStatus.pending
    tags: list[str] = Field(default_factory=list)
    # Hindsight document_id used for idempotent upsert (== incident_id)
    document_id: str
    # Free-text evidence references for UI provenance display
    evidence_refs: list[str] = Field(default_factory=list)
    source_fixture: str | None = None


class MemoryQueryResult(BaseModel):
    """Result of a memory query against the Hindsight bank."""

    answer: str
    found: bool
    # "approved" — all relevant postmortems are approved
    # "partial"  — mix of approved and pending
    # "pending"  — relevant postmortems exist but none are approved yet
    # "empty"    — no relevant postmortems found
    trust_level: str = "empty"
    pending_count: int = 0


class RunbookStatus(BaseModel):
    """State of the Microservice Resolution Runbook mental model."""

    mental_model_id: str
    name: str = "Microservice Resolution Runbook"
    content: str | None = None
    is_stale: bool = True
    last_refreshed_at: str | None = None
    last_memory_seen_at: str | None = None
    # "current"               — content reflects all retained memories
    # "stale"                 — new memories since last refresh
    # "consolidation_pending" — refresh triggered; Hindsight still processing
    # "generating"            — content is being generated for the first time
    # "unavailable"           — Hindsight unreachable
    status: str = "unknown"
    pending_approvals: int = 0
    refresh_operation_id: str | None = None


class MemoryStatus(BaseModel):
    """Overall memory subsystem health snapshot."""

    bank_id: str
    bank_reachable: bool
    total_memories: int = 0
    runbook: RunbookStatus
    pending_approvals: int = 0
    approved_count: int = 0
    rejected_count: int = 0
    all_postmortems: list[PostmortemRecord] = Field(default_factory=list)
