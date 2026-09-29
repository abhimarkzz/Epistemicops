# EpistemicOps — Architecture

## Overview

EpistemicOps is a browser-based SRE incident-response agent that investigates infrastructure incidents, produces root-cause diagnoses, and builds persistent procedural memory using [Hindsight](https://github.com/vectorize-io/hindsight) so future similar incidents can benefit from prior knowledge.

---

## System Diagram

```
┌───────────────────────────┐         SSE stream           ┌──────────────────────────────┐
│   React + Vite + Three.js │ ◄──────────────────────────► │      FastAPI Backend         │
│   localhost:5173 (dev)    │    REST /api/*                │      localhost:8000          │
│                           │                               │                              │
│  • 3D Epistemic Graph     │                               │  ┌─────────────────────────┐ │
│  • Incident queue         │                               │  │    LangGraph Agent       │ │
│  • Live event timeline    │                               │  │    (bounded DAG)         │ │
│  • Runbook panel          │                               │  │                           │ │
│  • Approval workflow      │                               │  │  load_incident            │ │
│  • Run comparison table   │                               │  │  → query_memory           │ │
│  • Baseline/Demo toggle   │                               │  │  → investigate            │ │
└───────────────────────────┘                               │  │  → analyze (LLM)          │ │
                                                            │  │  → validate               │ │
                                                            │  │  → produce_result         │ │
                                                            │  │  → retain_postmortem      │ │
                                                            │  └──────────┬──────────────┘ │
                                                            │             │                 │
                                                            │  ┌──────────▼──────────────┐ │
                                                            │  │   MemoryService          │ │
                                                            │  │   (Hindsight client)     │ │
                                                            │  └──────────┬──────────────┘ │
                                                            │             │                 │
                                                            │  ┌──────────▼──────────────┐ │
                                                            │  │   FixtureService         │ │
                                                            │  │   data/incidents/*.json  │ │
                                                            │  │   (read-only evidence)   │ │
                                                            │  └──────────────────────────┘ │
                                                            └──────────────┬───────────────┘
                                                                           │
                         ┌─────────────────────────────────────────────────┼──────────────────┐
                         │                                                 │                  │
              ┌──────────▼──────────┐                          ┌──────────▼──────────┐       │
              │   LLM Provider      │                          │  Hindsight (Docker)  │       │
              │                     │                          │  localhost:8888      │       │
              │  Gemini 3.8 Flash   │                          │  localhost:9999 (UI) │       │
              │  — OR —             │                          │                      │       │
              │  Groq (free tier)   │                          │  • Memory bank       │       │
              │                     │                          │  • Mental model      │       │
              └─────────────────────┘                          │  • Embedded pg0 DB   │       │
                                                               └──────────────────────┘       │
                                                                                              │
                                                            ┌─────────────────────────────────┘
                                                            │  Keyword Evaluator (eval.py)
                                                            │  Deterministic, no AI judge
                                                            │  Runs post-diagnosis against
                                                            │  hidden ground truth
                                                            └─────────────────────────────────
```

---

## Component Map

| Component | Path | Role |
|---|---|---|
| **Frontend** | `frontend/src/App.tsx` | React SPA: incident queue, 3D scene, live timeline, runbook panel, comparison table |
| **3D Graph** | `frontend/src/components/three/EpistemicGraph.tsx` | WebGL topology scene with 2D fallback |
| **API Client** | `frontend/src/api.ts` | Typed fetch wrappers for backend REST + SSE |
| **Types** | `frontend/src/types.ts` | Shared TypeScript interfaces |
| **Backend Entry** | `backend/app/main.py` | FastAPI app: SSE investigate endpoint, memory/run/approval routes |
| **Agent Graph** | `backend/app/agent/graph.py` | LangGraph `StateGraph` with 7 nodes + error handler |
| **Agent Prompts** | `backend/app/agent/prompts.py` | System prompt and analysis prompt builder |
| **Agent Tools** | `backend/app/agent/tools.py` | Read-only evidence tools (logs, metrics, trace, pod status) |
| **Agent Memory** | `backend/app/agent/memory.py` | Delegation layer: agent → MemoryService |
| **Agent Types** | `backend/app/agent/types.py` | `AgentState`, `AgentEvent`, `DiagnosisResult` |
| **MemoryService** | `backend/app/memory/service.py` | Hindsight API wrapper: retain, recall, runbook, bank management |
| **Memory Schemas** | `backend/app/memory/schemas.py` | Pydantic models: `PostmortemRecord`, `RunbookStatus`, `MemoryStatus` |
| **Evaluator** | `backend/app/eval.py` | Keyword-based scoring against hidden ground truth |
| **Run Store** | `backend/app/runs.py` | In-memory run records with comparison |
| **Fixtures** | `backend/app/fixtures.py` | Read-only incident loader; ground truth never exposed to agent |
| **Config** | `backend/app/config.py` | `Settings` via pydantic-settings (.env) |
| **Incident Data** | `data/incidents/*.json` | 5 synthetic incident fixtures |
| **Demo Events** | `data/demo_events/*.json` | Pre-recorded SSE streams (inc-003, inc-004) |
| **Approval State** | `data/memory_state.json` | Local JSON store for postmortem approval status |
| **Docker Compose** | `docker-compose.yml` | Hindsight container definition |
| **Dockerfile** | `Dockerfile` | Multi-stage production build |
| **Start Script** | `start.sh` | Production entrypoint (Hindsight + FastAPI) |
| **Init Script** | `scripts/init_hindsight.py` | Bank and mental model creation |

---

## Agent DAG (LangGraph StateGraph)

```
load_incident
      │
      ▼
query_memory ──── (baseline mode: skip, emit memory_skipped)
      │
      ▼
investigate ──── calls 4 tools in order: get_logs, get_metrics, get_trace, get_pod_status
      │
      ▼
analyze ──── single LLM call (Gemini or Groq), JSON response
      │
      ▼
validate ──── parse and validate LLM JSON output
      │
      ▼
produce_result ──── emit diagnosis_completed event
      │
      ▼
retain_postmortem ──── retain structured postmortem in Hindsight
      │
      ▼
     END
```

Any node that sets `state["error"]` routes to `error_end → END`.

The graph is a bounded acyclic DAG. `max_agent_steps` (default: 8) is a safety recursion limit.

---

## Memory Flow

### Retain (after diagnosis)

1. `_node_retain_postmortem` builds a structured postmortem text (no raw logs)
2. Calls `MemoryService.retain_incident()` → `client.aretain()` (async, non-blocking)
3. Hindsight extracts facts and stores memories in the `epistemic-sre` bank
4. A `PostmortemRecord` is saved to `data/memory_state.json` with `approval_status: pending`

### Consolidation (Hindsight-managed)

1. Human approves the postmortem in the UI (or via API)
2. Hindsight consolidates approved memories into the "Microservice Resolution Runbook" mental model
3. Consolidation runs asynchronously; `trigger.mode = "delta"` enables incremental updates
4. The runbook content is a synthesis of all retained incident patterns

### Recall (before investigation)

1. `_node_query_memory` builds a semantic query from incident service, category, and alert title
2. Calls `MemoryService.query_memory()` → `client.arecall()` (vector search, no LLM)
3. Top-3 results are formatted and injected into `memory_context`
4. The analysis prompt includes prior patterns under `--- PRIOR INCIDENT PATTERNS (from memory) ---`

### Baseline Mode

1. `skip_memory=True` causes `_node_query_memory` to emit `memory_skipped` and set `memory_context = None`
2. The LLM never sees prior patterns — it reasons from raw evidence only
3. This enables cold/warm comparison via the run comparison endpoint

---

## Data Flow

### Investigation Request

```
Browser → POST /api/investigate/{incident_id}?baseline=false
       ← SSE event stream
          run_started
          incident_started
          memory_query_started
          memory_result (found: true/false)
          tool_started (×4)
          tool_result_summary (×4)
          diagnosis_started
          diagnosis_completed
          memory_retention_started
          postmortem_created
          run_completed
```

### Run Comparison

```
Browser → POST /api/runs/compare { run_id_a, run_id_b }
       ← { run_a, run_b, delta: { elapsed_ms, tool_calls, eval_pass, evidence_score } }
```

---

## Ports

| Service | Port | Scope |
|---|---|---|
| Frontend (dev) | 5173 | localhost |
| Backend (FastAPI) | 8000 | localhost |
| Hindsight REST API | 8888 | localhost |
| Hindsight Web UI | 9999 | localhost |
| Production (Dockerfile) | 7860 | public |

---

## LLM Provider Selection

```
if LLM_PROVIDER is explicitly "gemini" or "groq" → use that
elif GROQ_API_KEY is set → use Groq
else → use Gemini
```

Both providers use `temperature=0` for deterministic output.

---

## Safety Constraints

- **No shell execution**: The agent has no `exec`, `kubectl`, or filesystem mutation tools
- **No automated remediation**: Recommended actions are advisory only
- **Read-only evidence**: All tools read from static JSON fixtures, never from live infrastructure
- **Ground truth isolation**: `FixtureService` never exposes `_ground_truth` to agent-facing methods
- **Concurrency control**: `max_concurrent_investigations` semaphore (default: 2)
- **Timeout**: `llm_timeout` (default: 60s) prevents hung LLM calls
- **Step limit**: `max_agent_steps` (default: 8) caps LangGraph recursion
