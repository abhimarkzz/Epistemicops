# How Hindsight Is Used in EpistemicOps

## Why Hindsight

SRE incident response suffers from a fundamental problem: every investigation starts from zero. An on-call engineer encounters a database connection pool exhaustion, spends 45 minutes tracing logs and metrics to a root cause, writes a postmortem — and six weeks later, a teammate investigates the same failure pattern without any of that prior knowledge.

EpistemicOps uses [Hindsight](https://github.com/vectorize-io/hindsight) as its persistent memory layer because Hindsight provides exactly the primitives needed to solve this:

- **Retain**: Store structured postmortems after each resolved incident
- **Recall**: Semantically search prior incident patterns when a new incident arrives
- **Mental Models**: Consolidate individual postmortems into a living "Microservice Resolution Runbook" — a synthesis that captures cross-incident patterns, not just individual facts

Hindsight is not an add-on feature in EpistemicOps. It is the mechanism that transforms a stateless diagnostic tool into a learning system.

For more context on what agent memory is and why it matters, see [What is Agent Memory?](https://vectorize.io/what-is-agent-memory) by Vectorize.

---

## What Is Retained

After every successful investigation, the agent builds a structured postmortem containing:

- **Incident metadata**: service name, failure category, severity
- **Root cause**: the synthesized diagnosis (not raw logs)
- **Key evidence references**: which evidence items supported the diagnosis
- **Recommended remediation**: specific fix steps
- **Confidence score**: the agent's self-assessed certainty
- **Alert pattern**: the triggering alert title
- **Incident context**: the human-readable description

Raw log lines are **intentionally excluded** from retained content. Only synthesized findings and diagnostic patterns are stored so the memory stays compact and semantically useful.

### What stays in incident fixtures (not retained)

- Raw log lines (`data/incidents/*.json` → `logs` field)
- Metric time series
- Distributed trace spans
- Pod status snapshots
- Ground truth evaluation data (`_ground_truth`)

These are evidence that the agent reads during investigation. They are too voluminous and incident-specific to store in memory.

---

## How Retain Is Triggered

Retain happens automatically at the end of every successful investigation, in the `retain_postmortem` node of the LangGraph agent DAG:

```python
# backend/app/agent/graph.py — _node_retain_postmortem
async def node(state: AgentState) -> dict:
    diagnosis = state["diagnosis"]
    incident = state["incident"]
    # ...
    success = await retain_incident_full(incident, diagnosis)
    events.append(AgentEvent(event="postmortem_created", data={"success": success}))
```

This calls `MemoryService.retain_incident()`, which:

1. Builds the postmortem text via `_build_postmortem_text()`
2. Calls `client.aretain()` with `retain_async=True` (non-blocking)
3. Saves a `PostmortemRecord` to `data/memory_state.json` with `approval_status: pending`

The retain call is fire-and-forget from the agent's perspective. Hindsight processes the content in the background, extracting structured facts for later retrieval.

---

## How Recall Is Performed

Recall happens at the beginning of every investigation (unless baseline mode is active), in the `query_memory` node:

```python
# backend/app/agent/graph.py — _node_query_memory
incident = state["incident"]
alert = incident.get("alert") or {}
query = (
    f"service={incident.get('service', '')} "
    f"category={incident.get('category', '')} "
    f"alert: {alert.get('title', '')}"
)
context = await query_incident_patterns(query)
```

This calls `MemoryService.query_memory()`, which uses `client.arecall()` — a semantic vector search (not an LLM call). The top-3 results are formatted as a compact context string and injected into the `memory_context` field of the agent state.

When the LLM receives the analysis prompt, prior patterns appear under a clearly labeled section:

```
--- PRIOR INCIDENT PATTERNS (from memory) ---
- POSTMORTEM | incident=inc-003 | service=orders-api ...
  Root Cause: Bad deployment configuration ...
---
```

This gives the LLM concrete prior experience to draw from when diagnosing the current incident.

---

## When Recall Occurs

- **Live mode**: Recall runs before investigation. The `memory_result` SSE event reports `found: true` or `found: false`.
- **Baseline mode**: Recall is skipped entirely. The `memory_skipped` event is emitted instead.
- **Demo mode**: Pre-recorded events are replayed. No live recall occurs.

---

## Consolidation and the Mental Model

Individual postmortems are valuable, but the real power of Hindsight is consolidation. EpistemicOps configures a **Mental Model** called "Microservice Resolution Runbook":

```python
# backend/app/memory/service.py — initialize()
await client.acreate_mental_model(
    bank_id=settings.hindsight_bank_id,
    name="Microservice Resolution Runbook",
    source_query="microservice incident root cause diagnosis resolution steps ...",
    tags=["sre", "incident", "runbook", "microservices"],
    trigger={"mode": "delta", "refresh_after_consolidation": True},
)
```

The mental model is a higher-level synthesis. Instead of storing "inc-003 had a bad deploy" and "inc-004 had a stuck rollout" as separate facts, Hindsight consolidates them into operational knowledge like: "Kubernetes deployment failures often involve image pull errors or readiness probe misconfigurations; check pod events and deployment rollout status first."

### How consolidation works

1. An investigation completes → postmortem is retained
2. A human reviews and **approves** the postmortem in the EpistemicOps UI
3. Hindsight's observation pipeline detects new approved memories
4. The mental model is refreshed (delta mode: only new memories are processed)
5. The runbook content is updated with synthesized patterns

Manual refresh can be triggered via `POST /api/memory/runbook/refresh`.

Consolidation is asynchronous. It typically takes 1–3 minutes but may be longer depending on LLM load.

---

## How Memory Changes the Investigation Path

### Without memory (cold / baseline)

```
load_incident → query_memory (skip) → investigate (4 tools) → analyze → diagnosis
```

The LLM sees only the raw evidence for the current incident. It must reason from first principles.

### With memory (warm / live)

```
load_incident → query_memory (recall) → investigate (4 tools) → analyze → diagnosis
```

The LLM sees raw evidence **plus** prior incident patterns. It can:
- Recognize a similar failure mode from a previous incident
- Focus on the most relevant evidence (based on prior experience)
- Produce a diagnosis that builds on prior knowledge

The agent does not skip evidence-gathering when memory is available. All 4 tools are always called. Memory provides additional context, not a shortcut.

---

## What Baseline Mode Does

Baseline mode (`?baseline=true` on the investigate endpoint) disables memory query. This allows direct comparison between memory-enabled and memory-disabled investigations of the same or similar incidents.

The comparison endpoint (`POST /api/runs/compare`) shows side-by-side metrics:
- Elapsed time
- Tool call count
- Confidence
- Evaluator pass/fail
- Evidence score

The UI displays measured values with the disclaimer: *"These are measured values. Differences reflect actual run conditions, not claimed improvements."*

---

## What Happens When Memory Is Unavailable

If Hindsight is unreachable:
- The backend still starts (the lifespan handler catches init failures)
- `query_memory` returns an empty result (`found: false`)
- `retain_incident` logs a warning but does not crash
- The investigation proceeds without memory context
- The `/health` endpoint reports `hindsight: unreachable` (informational only)

The system degrades gracefully to a stateless diagnostic tool.

---

## What Hindsight Does NOT Do

- **Hindsight does not execute remediation.** Recommended actions are advisory.
- **Hindsight does not replace the investigation.** All 4 evidence tools are always called regardless of memory state.
- **Hindsight does not guarantee improved accuracy.** A warm run may or may not produce a better diagnosis depending on how relevant the prior knowledge is.
- **Hindsight does not process raw logs.** Only synthesized postmortem content is retained.
- **Hindsight does not auto-approve memories.** A human must approve retained postmortems before they influence the runbook.

---

## Links

- [Hindsight on GitHub](https://github.com/vectorize-io/hindsight)
- [Hindsight Documentation](https://hindsight.vectorize.io/)
- [What is Agent Memory?](https://vectorize.io/what-is-agent-memory)
