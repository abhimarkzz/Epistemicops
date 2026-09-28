"""Tests for the Hindsight memory subsystem (app.memory).

All tests mock Hindsight API calls — no live Hindsight service is required.
"""

from __future__ import annotations

import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agent.types import DiagnosisResult
from app.memory.schemas import ApprovalStatus, PostmortemRecord, RunbookStatus
from app.memory.service import MemoryService, _build_postmortem_text


# ── fixtures ───────────────────────────────────────────────────────────────────

_INCIDENT: dict[str, Any] = {
    "id": "inc-m01",
    "service": "payment-service",
    "category": "bad_deploy",
    "severity": "P1",
    "description": "Checkout failures after deploy v2.3.1",
    "source": "fixture",
    "source_record_id": "inc-m01",
    "alert": {"title": "High error rate on payment-service"},
    "logs": [
        "ERROR 2024-01-15T12:00:01Z payment-service connection refused db:5432",
        "WARN  2024-01-15T12:00:02Z payment-service retry 1/3",
    ],
}

_DIAGNOSIS = DiagnosisResult(
    incident_id="inc-m01",
    root_cause="Database connection pool exhausted after bad deploy",
    evidence=["High error rate spike", "DB connection refused errors"],
    recommended_remediation="Rollback deploy v2.3.1, scale DB connection pool",
    confidence=0.85,
    memory_used=False,
    tool_calls=["get_logs", "get_metrics"],
    status="completed",
)


def _make_service(tmp_path: Path) -> MemoryService:
    return MemoryService(tmp_path / "memory_state.json")


# ── postmortem text construction ───────────────────────────────────────────────


def test_build_postmortem_text_no_raw_logs():
    text = _build_postmortem_text(_INCIDENT, _DIAGNOSIS)
    for raw_log in _INCIDENT["logs"]:
        assert raw_log not in text, f"Raw log line leaked into postmortem: {raw_log!r}"


def test_build_postmortem_text_contains_key_fields():
    text = _build_postmortem_text(_INCIDENT, _DIAGNOSIS)
    assert "inc-m01" in text
    assert "payment-service" in text
    assert "bad_deploy" in text
    assert _DIAGNOSIS.root_cause in text
    assert _DIAGNOSIS.recommended_remediation in text


def test_build_postmortem_text_includes_evidence():
    text = _build_postmortem_text(_INCIDENT, _DIAGNOSIS)
    for ev in _DIAGNOSIS.evidence:
        assert ev in text


# ── approval store (local JSON) ────────────────────────────────────────────────


def test_approval_store_initial_state(tmp_path):
    svc = _make_service(tmp_path)
    assert svc.get_approvals() == []
    assert svc.get_pending() == []


def test_approval_store_upsert_and_retrieve(tmp_path):
    svc = _make_service(tmp_path)
    record = PostmortemRecord(
        incident_id="inc-m01",
        service="payment-service",
        severity="P1",
        retained_at=datetime.now(timezone.utc),
        document_id="inc-m01",
    )
    svc._store.upsert(record)
    retrieved = svc._store.get("inc-m01")
    assert retrieved is not None
    assert retrieved.incident_id == "inc-m01"
    assert retrieved.approval_status == ApprovalStatus.pending


def test_approval_store_set_approval(tmp_path):
    svc = _make_service(tmp_path)
    record = PostmortemRecord(
        incident_id="inc-m01",
        service="payment-service",
        severity="P1",
        retained_at=datetime.now(timezone.utc),
        document_id="inc-m01",
    )
    svc._store.upsert(record)
    updated = svc.set_approval("inc-m01", ApprovalStatus.approved)
    assert updated is True
    assert svc._store.get("inc-m01").approval_status == ApprovalStatus.approved


def test_approval_store_set_approval_not_found(tmp_path):
    svc = _make_service(tmp_path)
    updated = svc.set_approval("nonexistent", ApprovalStatus.approved)
    assert updated is False


def test_approval_store_rejected(tmp_path):
    svc = _make_service(tmp_path)
    record = PostmortemRecord(
        incident_id="inc-m01",
        service="s",
        severity="P2",
        retained_at=datetime.now(timezone.utc),
        document_id="inc-m01",
    )
    svc._store.upsert(record)
    svc.set_approval("inc-m01", ApprovalStatus.rejected)
    assert svc._store.get("inc-m01").approval_status == ApprovalStatus.rejected


def test_approval_store_persists_across_instances(tmp_path):
    state_file = tmp_path / "memory_state.json"
    svc1 = MemoryService(state_file)
    record = PostmortemRecord(
        incident_id="inc-m01",
        service="s",
        severity="P1",
        retained_at=datetime.now(timezone.utc),
        document_id="inc-m01",
    )
    svc1._store.upsert(record)

    svc2 = MemoryService(state_file)
    assert svc2._store.get("inc-m01") is not None


# ── bank initialization (idempotent) ──────────────────────────────────────────


def _mock_hindsight(mental_model_exists=True):
    """Build a mock Hindsight client context manager."""
    mm_mock = MagicMock()
    mm_mock.name = "Microservice Resolution Runbook"
    mm_mock.content = "Existing runbook content"
    mm_mock.is_stale = False
    mm_mock.last_refreshed_at = None
    mm_mock.last_memory_seen_at = None

    client = MagicMock()
    client.acreate_bank = AsyncMock(return_value=MagicMock())
    if mental_model_exists:
        client.aget_mental_model = AsyncMock(return_value=mm_mock)
    else:
        client.aget_mental_model = AsyncMock(side_effect=Exception("not found"))
        client.acreate_mental_model = AsyncMock(
            return_value=MagicMock(mental_model_id="microservice-resolution-runbook")
        )
    client.aupdate_mental_model = AsyncMock(return_value=MagicMock())
    client.aclose = AsyncMock()
    return client


async def _init(svc, client):
    with patch("app.memory.service._client", return_value=client):
        return await svc.initialize()


def test_initialize_bank_confirmed(tmp_path):
    svc = _make_service(tmp_path)
    client = _mock_hindsight(mental_model_exists=True)
    result = asyncio.run(_init(svc, client))
    assert result.get("bank") == "confirmed"
    client.acreate_bank.assert_awaited_once()


def test_initialize_mental_model_existing(tmp_path):
    svc = _make_service(tmp_path)
    client = _mock_hindsight(mental_model_exists=True)
    result = asyncio.run(_init(svc, client))
    assert "confirmed" in result.get("mental_model", "")
    client.aupdate_mental_model.assert_awaited_once()


def test_initialize_mental_model_created(tmp_path):
    svc = _make_service(tmp_path)
    client = _mock_hindsight(mental_model_exists=False)
    result = asyncio.run(_init(svc, client))
    assert "created" in result.get("mental_model", "")
    client.acreate_mental_model.assert_awaited_once()


def test_initialize_idempotent(tmp_path):
    svc = _make_service(tmp_path)
    client = _mock_hindsight(mental_model_exists=True)
    with patch("app.memory.service._client", return_value=client):
        r1 = asyncio.run(svc.initialize())
        r2 = asyncio.run(svc.initialize())
    assert r1.get("bank") == r2.get("bank") == "confirmed"


def test_initialize_hindsight_unavailable(tmp_path):
    svc = _make_service(tmp_path)
    client = MagicMock()
    client.acreate_bank = AsyncMock(side_effect=Exception("connection refused"))
    client.aclose = AsyncMock()
    with patch("app.memory.service._client", return_value=client):
        result = asyncio.run(svc.initialize())
    assert "error" in result


# ── retain_incident ────────────────────────────────────────────────────────────


async def _retain(svc, client):
    with patch("app.memory.service._client", return_value=client):
        return await svc.retain_incident(_INCIDENT, _DIAGNOSIS)


def _retain_client():
    client = MagicMock()
    client.aretain = AsyncMock(return_value=MagicMock())
    client.aclose = AsyncMock()
    return client


def test_retain_creates_pending_record(tmp_path):
    svc = _make_service(tmp_path)
    client = _retain_client()
    record = asyncio.run(_retain(svc, client))
    assert record.incident_id == "inc-m01"
    assert record.approval_status == ApprovalStatus.pending


def test_retain_calls_hindsight_aretain(tmp_path):
    svc = _make_service(tmp_path)
    client = _retain_client()
    asyncio.run(_retain(svc, client))
    client.aretain.assert_awaited_once()
    call_kwargs = client.aretain.call_args.kwargs
    assert call_kwargs.get("retain_async") is True
    assert call_kwargs.get("document_id") == "inc-m01"


def test_retain_payload_no_raw_logs(tmp_path):
    svc = _make_service(tmp_path)
    captured_content: list[str] = []

    async def fake_aretain(**kwargs):
        captured_content.append(kwargs.get("content", ""))
        return MagicMock()

    client = MagicMock()
    client.aretain = fake_aretain
    client.aclose = AsyncMock()
    asyncio.run(_retain(svc, client))

    assert captured_content, "aretain was never called"
    postmortem_text = captured_content[-1]
    for raw_log in _INCIDENT["logs"]:
        assert raw_log not in postmortem_text, f"Raw log leaked: {raw_log!r}"


def test_retain_idempotent_upsert(tmp_path):
    svc = _make_service(tmp_path)
    client = _retain_client()
    asyncio.run(_retain(svc, client))
    asyncio.run(_retain(svc, client))
    records = svc.get_approvals()
    assert len(records) == 1
    assert records[0].incident_id == "inc-m01"


def test_retain_hindsight_unavailable_still_writes_record(tmp_path):
    svc = _make_service(tmp_path)
    client = MagicMock()
    client.aretain = AsyncMock(side_effect=Exception("connection refused"))
    client.aclose = AsyncMock()
    record = asyncio.run(_retain(svc, client))
    assert record.incident_id == "inc-m01"
    assert svc._store.get("inc-m01") is not None


# ── query_memory ───────────────────────────────────────────────────────────────


async def _query(svc, client, query="bad_deploy payment-service"):
    with patch("app.memory.service._client", return_value=client):
        return await svc.query_memory(query)


def _recall_client(*texts):
    """Mock a Hindsight client whose arecall returns memories with the given texts."""
    resp = MagicMock()
    resp.results = [MagicMock(text=t) for t in texts]
    client = MagicMock()
    client.arecall = AsyncMock(return_value=resp)
    client.aclose = AsyncMock()
    return client


def test_query_memory_returns_answer(tmp_path):
    svc = _make_service(tmp_path)
    client = _recall_client("Rollback the bad deploy.")
    result = asyncio.run(_query(svc, client))
    assert result.found is True
    assert "Rollback" in result.answer


def test_query_memory_empty_answer(tmp_path):
    svc = _make_service(tmp_path)
    client = _recall_client()  # no memories recalled
    result = asyncio.run(_query(svc, client))
    assert result.found is False
    assert result.trust_level == "empty"


def test_query_memory_trust_level_pending(tmp_path):
    svc = _make_service(tmp_path)
    # Retain a pending record first
    record = PostmortemRecord(
        incident_id="inc-m01",
        service="s",
        severity="P1",
        retained_at=datetime.now(timezone.utc),
        document_id="inc-m01",
    )
    svc._store.upsert(record)
    client = _recall_client("Some answer")
    result = asyncio.run(_query(svc, client))
    assert result.trust_level == "pending"
    assert result.pending_count == 1


def test_query_memory_trust_level_approved(tmp_path):
    svc = _make_service(tmp_path)
    record = PostmortemRecord(
        incident_id="inc-m01",
        service="s",
        severity="P1",
        retained_at=datetime.now(timezone.utc),
        approval_status=ApprovalStatus.approved,
        document_id="inc-m01",
    )
    svc._store.upsert(record)
    client = _recall_client("Some answer")
    result = asyncio.run(_query(svc, client))
    assert result.trust_level == "approved"


def test_query_memory_hindsight_unavailable(tmp_path):
    svc = _make_service(tmp_path)
    client = MagicMock()
    client.arecall = AsyncMock(side_effect=Exception("connection refused"))
    client.aclose = AsyncMock()
    result = asyncio.run(_query(svc, client))
    assert result.found is False
    assert result.answer == ""


# ── get_runbook ────────────────────────────────────────────────────────────────


def _runbook_client(content="Step 1: Check logs.", is_stale=False, last_refreshed_at=None):
    mm = MagicMock()
    mm.content = content
    mm.is_stale = is_stale
    mm.last_refreshed_at = last_refreshed_at
    mm.last_memory_seen_at = None
    mm.name = "Microservice Resolution Runbook"
    client = MagicMock()
    client.aget_mental_model = AsyncMock(return_value=mm)
    client.aclose = AsyncMock()
    return client


async def _get_runbook(svc, client):
    with patch("app.memory.service._client", return_value=client):
        return await svc.get_runbook()


def test_get_runbook_current(tmp_path):
    svc = _make_service(tmp_path)
    client = _runbook_client(is_stale=False)
    rb = asyncio.run(_get_runbook(svc, client))
    assert rb.status == "current"
    assert "Step 1" in (rb.content or "")


def test_get_runbook_stale(tmp_path):
    svc = _make_service(tmp_path)
    client = _runbook_client(is_stale=True)
    rb = asyncio.run(_get_runbook(svc, client))
    assert rb.status == "stale"


def test_get_runbook_generating(tmp_path):
    svc = _make_service(tmp_path)
    client = _runbook_client(content="Generating content...", is_stale=False)
    rb = asyncio.run(_get_runbook(svc, client))
    assert rb.status == "generating"


def test_get_runbook_unavailable(tmp_path):
    svc = _make_service(tmp_path)
    client = MagicMock()
    client.aget_mental_model = AsyncMock(side_effect=Exception("connection refused"))
    client.aclose = AsyncMock()
    rb = asyncio.run(_get_runbook(svc, client))
    assert rb.status == "unavailable"


# ── consolidation detection ────────────────────────────────────────────────────


def test_runbook_consolidation_pending(tmp_path):
    """last_memory_seen_at newer than last_refreshed_at → consolidation_pending."""
    svc = _make_service(tmp_path)
    # Simulate: memory arrived after last refresh
    client = _runbook_client(
        content="Existing content.",
        is_stale=False,
        last_refreshed_at="2024-01-01T12:00:00+00:00",
    )
    mm = client.aget_mental_model.return_value
    mm.last_memory_seen_at = "2024-01-02T12:00:00+00:00"

    rb = asyncio.run(_get_runbook(svc, client))
    assert rb.status == "consolidation_pending"
