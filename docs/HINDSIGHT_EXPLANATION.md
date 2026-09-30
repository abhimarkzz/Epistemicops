# Hindsight in EpistemOps

This document is the authoritative technical specification of how **Vectorize Hindsight** provides persistent, cross-incident operational memory in EpistemicOps.

---

## Why memory is needed

Production Site Reliability Engineering (SRE) is fundamentally cumulative. When an on-call engineer diagnoses an outage caused by database connection pool saturation, cache stampedes, or bad configuration rollouts, the organization gains valuable operational knowledge.

Stateless AI assistants discard this context the moment an incident resolution finishes. Relying on conversational chat history across days or weeks fails because:
- Context windows are finite and degrade prompt reasoning when stuffed with voluminous raw logs.
- Chat history is linear and lacks semantic indexing to retrieve the right incident playbook when a related failure occurs weeks later.
- Without an isolated memory substrate, an agent cannot distinguish between verified, approved postmortems and speculative in-progress hypotheses.

Hindsight provides a dedicated, persistent memory layer that enables an SRE agent to accumulate, govern, and recall institutional knowledge across separate incidents.

---

## What gets retained

Retaining raw telemetry (e.g. 50,000 raw log lines or gigabytes of Prometheus time-series) creates noise and degrades vector similarity search. EpistemicOps explicitly filters raw evidence before retention.

Only synthesized, high-signal postmortem narratives are stored in Hindsight:
- **Incident Identity & Tags:** Incident ID, service name, failure category, severity.
- **Root Cause Summary:** The concise explanation of why the failure occurred.
- **Key Evidence Tokens:** Specific keywords, error codes, and metric anomalies that characterized the outage.
- **Recommended Remediation:** Actionable resolution steps, rollbacks, or config modifications.
- **Diagnostic Confidence:** Agent confidence score at the time of resolution.
- **Alert Pattern:** The high-level alert title that triggered the event.

Raw log lines and ephemeral trace spans are deliberately excluded from retention.

---

## Retain

Retention occurs asynchronously after the LangGraph agent validates its diagnostic findings.

In `backend/app/memory/service.py`, `MemoryService.retain_incident()` formats the structured postmortem and calls Hindsight's `aretain` method:

```python
async def retain_incident(
    self,
    incident: dict[str, Any],
    diagnosis: DiagnosisResult,
) -> PostmortemRecord:
    inc_id = diagnosis.incident_id
    content = _build_postmortem_text(incident, diagnosis)
    tags = list(
        {
            t
            for t in [
                incident.get("service"),
                incident.get("category"),
                "postmortem",
                inc_id,
            ]
            if t
        }
    )

    record = PostmortemRecord(
        incident_id=inc_id,
        service=incident.get("service", "unknown"),
        category=incident.get("category"),
        severity=incident.get("severity", "unknown"),
        retained_at=datetime.now(timezone.utc),
        approval_status=ApprovalStatus.pending,
        tags=tags,
        document_id=inc_id,
        evidence_refs=diagnosis.evidence[:5],
        source_fixture=incident.get("source_record_id"),
    )

    client = _client()
    try:
        await client.aretain(
            bank_id=settings.hindsight_bank_id,
            content=content,
            context=f"Postmortem for {inc_id}",
            document_id=inc_id,
            tags=tags,
            retain_async=True,  # Non-blocking; fact extraction runs in background
        )
    except Exception as exc:
        logger.warning("Hindsight retain failed for %s: %s", inc_id, exc)
    finally:
        await client.aclose()

    self._store.upsert(record)
    return record
```

Setting `retain_async=True` ensures the HTTP response to the user remains fast while Hindsight indexes memories and extracts entities in the background.

---

## Recall

When a new alert arrives, EpistemicOps queries Hindsight before running telemetry queries.

A key engineering decision in EpistemicOps is using **semantic vector recall** (`arecall`) rather than agentic reflection (`reflect`) for memory retrieval:
1. Vector recall executes directly via embedding vector search without an intermediate LLM call.
2. It operates at sub-100ms latency and consumes **zero LLM tokens**, ensuring reliability on free-tier LLM providers.
3. It directly surfaces past postmortems sharing service names, categories, and alert symptoms.

From `backend/app/memory/service.py`:

```python
async def query_memory(self, query: str) -> MemoryQueryResult:
    client = _client()
    try:
        response = await client.arecall(
            bank_id=settings.hindsight_bank_id,
            query=query,
            budget="low",
            max_tokens=1024,
        )
        answer = _format_recall(getattr(response, "results", None) or [])
        found = bool(answer)
    except Exception as exc:
        logger.warning("Hindsight query_memory failed: %s", exc)
        answer = ""
        found = False
    finally:
        await client.aclose()

    records = self._store.all()
    counts = self._store.counts()
    trust = _trust_level(records, found)

    return MemoryQueryResult(
        answer=answer,
        found=found,
        trust_level=trust,
        pending_count=counts.get("pending", 0),
    )
```

The recalled postmortem text is formatted into markdown bullet points and injected into the agent's diagnosis prompt under the `PRIOR OPERATIONAL KNOWLEDGE (Hindsight)` section.

---

## Consolidation / Reflection

Individual postmortems capture point-in-time incidents. Hindsight's observation engine (`HINDSIGHT_API_ENABLE_OBSERVATIONS=true`) periodically synthesizes memories into cross-incident operational observations.

When multiple postmortems mention database pool saturation or rollback procedures across different microservices, Hindsight consolidates these entries into higher-level architectural insights (e.g., identifying connection pool misconfigurations as a recurring cross-service anti-pattern).

---

## Mental Model / Runbook

Hindsight's Mental Model feature provides an evolving, human-readable operational runbook.

In EpistemicOps, startup initialization creates a Mental Model named **"Microservice Resolution Runbook"** (`microservice-resolution-runbook`) configured with delta trigger mode:

```python
# Initialized in MemoryService.initialize()
await client.acreate_mental_model(
    bank_id=settings.hindsight_bank_id,
    name="Microservice Resolution Runbook",
    source_query=(
        "microservice incident root cause diagnosis resolution steps "
        "failure pattern remediation SRE postmortem bad_deploy saturation"
    ),
    tags=["sre", "incident", "runbook", "microservices"],
    max_tokens=2048,
    trigger={
        "mode": "delta",
        "refresh_after_consolidation": True,
    },
)
```

- When postmortems are retained and consolidated, the runbook content updates automatically.
- Engineers can also trigger an immediate on-demand refresh via `POST /api/memory/runbook/refresh`.
- The UI displays the runbook status truthfully: `generating`, `stale`, `consolidation_pending`, or `current`.

---

## Cold vs Warm

| Dimension | Cold Run (First Occurrence) | Warm Run (Post-Retention) |
|---|---|---|
| **Incident Scenario** | `inc-003` (`orders`, `bad_deploy`) | `inc-004` (`shipping`, `bad_deploy`) |
| **Hindsight Query** | `query_memory()` yields `found=false` | `query_memory()` yields `found=true` |
| **Agent Context** | Empty operational memory | Injected prior postmortem & fix steps |
| **Investigation Trace** | Evaluates all symptoms from scratch | Corroborates known failure signature |
| **Diagnosis Output** | Derives diagnosis from telemetry alone | References prior postmortem pattern |
| **Memory Badge** | `memory_used: false` | `memory_used: true` |

---

## Baseline mode

To verify that differences between runs stem from memory rather than prompt randomness, EpistemicOps provides an experimental control: **Baseline Mode**.

When `skip_memory=True` (`POST /api/investigate/{id}?baseline=true`), the LangGraph state machine skips `query_memory` entirely:

```python
# backend/app/agent/graph.py
if state.get("skip_memory", False):
    # Baseline intentionally skips Hindsight retrieval so it can serve as the memory-off experimental control.
    return {
        "memory_context": None,
        "events": [AgentEvent(event="memory_skipped", data={"reason": "baseline mode"})],
    }
```

Running the exact same incident in Baseline mode produces an unassisted control measurement that can be compared against a warm run in the Recent Runs bar.

---

## What Hindsight does NOT do

To maintain reliability and clear operational boundaries, Hindsight is strictly scoped:
- **No Direct Infrastructure Execution:** Hindsight does not execute bash commands, modify Kubernetes clusters, or apply remediation patches directly.
- **No Raw Telemetry Ingestion:** Hindsight is not a metric timeseries database (like Prometheus) or log aggregation platform (like Loki). It stores synthesized diagnostic knowledge.
- **No Unsupervised Auto-Approval:** Retained postmortems default to `pending` status until reviewed by an engineer in the approval panel.
- **No Shared Tenant Contamination:** Operations are strictly constrained to the isolated bank `epistemic-sre`.

---

## Failure / unavailable-memory behavior

EpistemicOps is engineered to degrade gracefully if Hindsight is unreachable:
- **Startup Resilience:** If Hindsight is not running on port 8888 when the FastAPI backend starts, `lifespan` logs a warning and proceeds.
- **Safe Query Fallback:** If `query_memory()` throws a network or timeout error, it logs the exception, returns `found=false`, and yields an empty memory string. The LangGraph agent proceeds as a cold run.
- **Safe Retain Fallback:** If `retain_incident()` fails to connect to Hindsight, it records the postmortem in the local JSON store (`data/memory_state.json`) and allows the investigation run to finish normally.
- **Health Reporting:** `GET /health` reports `"hindsight": {"status": "unreachable"}` without breaking HTTP 200 backend availability.

---

## Relevant code paths

- `backend/app/memory/service.py`: Core `MemoryService` wrapper managing bank initialization, postmortem retention, vector recall, mental model runbooks, and approval storage.
- `backend/app/memory/schemas.py`: Pydantic models for `PostmortemRecord`, `MemoryQueryResult`, `RunbookStatus`, and `MemoryStatus`.
- `backend/app/agent/graph.py`: LangGraph state machine routing memory query nodes and retention nodes.
- `backend/app/agent/memory.py`: Thin delegation layer between the agent graph and `MemoryService`.
- `scripts/init_hindsight.py`: Standalone CLI script to verify Hindsight connectivity and idempotently initialize the bank and mental model.
- `scripts/verify_db_schema.py`: Neon PostgreSQL schema validator ensuring the `memory_units` table matches 384-dimension vector specifications.

---

## Hindsight resources

For further documentation and technical specifications on agent memory architecture:
- [Hindsight GitHub Repository](https://github.com/vectorize-io/hindsight)
- [Hindsight Official Documentation](https://hindsight.vectorize.io/)
- [Vectorize: What is Agent Memory?](https://vectorize.io/what-is-agent-memory)
