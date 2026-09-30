# EpistemOps Architecture Specification

This document provides a comprehensive technical overview of the EpistemicOps architecture, including state machine orchestration, memory lifecycle, evidence collection, and security isolation.

---

## 1. System Architecture

EpistemicOps is structured into three cooperating tiers:
1. **Frontend Presentation Layer (React 18 + Vite + Three.js):** Browser-based 3D Command Center rendering the real-time epistemic graph, live SSE investigation trace, runbook mental model state, and run comparison metrics.
2. **Backend Application Layer (FastAPI + LangGraph):** Orchestrates the investigation state machine, executes read-only telemetry tools against sanitized fixtures, queries LLM providers, and tracks run metrics.
3. **Memory Subsystem (Vectorize Hindsight v0.10.1):** High-performance vector memory bank storing structured postmortems, providing semantic vector recall, and maintaining an evolving SRE runbook backed by Neon Serverless PostgreSQL with `pgvector` (or local embedded `pg0`).

```mermaid
flowchart TB
    subgraph Client["Client Browser (Port 5173 / Production Web Service)"]
        UI["React 18 Command Center"]
        WebGL["Three.js Epistemic Graph Scene"]
        RunbookPanel["Runbook & Memory Governance Panel"]
        ComparePanel["Cold vs Warm Run Comparator"]
    end

    subgraph BackendAPI["Backend Service (FastAPI :8000)"]
        Router["FastAPI Application Core"]
        SSEHub["Server-Sent Events (SSE) Broadcaster"]
        RunStore["In-Memory Run Store & Comparator"]
        Evaluator["Deterministic Keyword Evaluator"]
    end

    subgraph AgentStateMachine["LangGraph Investigation State Machine"]
        LoadNode["load_incident"]
        MemoryNode["query_memory"]
        InvestigateNode["investigate"]
        AnalyzeNode["analyze"]
        ValidateNode["validate"]
        ProduceNode["produce_result"]
        RetainNode["retain_postmortem"]
    end

    subgraph TelemetryLayer["Telemetry & Fixture Engine"]
        FixtureSvc["FixtureService (Sanitization & Isolation)"]
        Tools["InvestigationTools (get_logs, get_metrics, get_trace, get_pod_status)"]
        FixturesData[("data/incidents/*.json")]
    end

    subgraph InferenceLayer["LLM Provider Tier"]
        Groq["Groq API (openai/gpt-oss-120b - Free Tier)"]
        Gemini["Google Gemini (gemini-3.8-flash - Optional)"]
    end

    subgraph MemoryTier["Hindsight Vector Memory Daemon (:8888)"]
        HindsightAPI["Hindsight Core API v0.10.1"]
        ONNXEmbed["In-Process ONNX Embeddings (multilingual-e5-small)"]
        RRFRank["Reciprocal Rank Fusion (RRF)"]
        MentalModel["Microservice Resolution Runbook"]
        PostgresDB[("Neon PostgreSQL + pgvector (or embedded pg0)")]
        ApprovalStore[("Local Approval Store (data/memory_state.json)")]
    end

    UI <-->|REST API| Router
    UI <-->|SSE Stream /api/investigate| SSEHub
    UI --- WebGL
    UI --- RunbookPanel
    UI --- ComparePanel

    Router --> AgentStateMachine
    SSEHub -.->|Stream AgentEvent| UI

    LoadNode --> MemoryNode
    MemoryNode --> InvestigateNode
    InvestigateNode --> AnalyzeNode
    AnalyzeNode --> ValidateNode
    ValidateNode --> ProduceNode
    ProduceNode --> RetainNode

    MemoryNode <-->|client.arecall| HindsightAPI
    RetainNode -->|client.aretain| HindsightAPI

    InvestigateNode --> Tools
    Tools --> FixtureSvc
    FixtureSvc --> FixturesData

    AnalyzeNode <--> InferenceLayer

    HindsightAPI --> ONNXEmbed
    HindsightAPI --> RRFRank
    HindsightAPI <--> MentalModel
    HindsightAPI <--> PostgresDB
    Router <--> ApprovalStore

    Router --> RunStore
    Router --> Evaluator

    classDef client fill:#0f172a,stroke:#38bdf8,stroke-width:1px,color:#e2e8f0;
    classDef agent fill:#1e1b4b,stroke:#818cf8,stroke-width:1px,color:#e2e8f0;
    classDef mem fill:#311042,stroke:#c084fc,stroke-width:1px,color:#e2e8f0;
    classDef tool fill:#064e3b,stroke:#34d399,stroke-width:1px,color:#e2e8f0;
    class UI,WebGL,RunbookPanel,ComparePanel client;
    class Router,SSEHub,RunStore,Evaluator,LoadNode,MemoryNode,InvestigateNode,AnalyzeNode,ValidateNode,ProduceNode,RetainNode,InferenceLayer agent;
    class HindsightAPI,ONNXEmbed,RRFRank,MentalModel,PostgresDB,ApprovalStore mem;
    class FixtureSvc,Tools,FixturesData tool;
```

---

## 2. Memory Lifecycle (Cold → Retain → Consolidate → Warm)

The core purpose of EpistemicOps is demonstrating how persistent operational memory overcomes the amnesia of stateless AI agents.

```mermaid
sequenceDiagram
    autonumber
    actor Engineer as SRE Engineer
    participant UI as Command Center UI
    participant Agent as LangGraph Agent
    participant Tools as Investigation Tools
    participant LLM as LLM Provider (Groq)
    participant Hindsight as Hindsight Memory (:8888)
    participant Runbook as Mental Model (Runbook)

    Note over Engineer,Runbook: Phase 1: Cold Run (Incident inc-001)
    Engineer->>UI: Select inc-001 & Run (Live Mode)
    UI->>Agent: POST /api/investigate/inc-001
    Agent->>Hindsight: query_incident_patterns() via arecall()
    Hindsight-->>Agent: Memory Result: found=false (no prior memories)
    Agent->>Tools: Fetch logs, metrics, trace, pod status
    Tools-->>Agent: Raw telemetry evidence
    Agent->>LLM: Analyze telemetry & diagnose root cause
    LLM-->>Agent: Diagnosis: DB Pool Exhaustion due to unindexed query
    Agent->>UI: Emit diagnosis_completed via SSE
    Agent->>Hindsight: retain_incident_full() via aretain()
    Hindsight-->>Agent: Postmortem queued for retention (document_id=inc-001)

    Note over Engineer,Runbook: Phase 2: Consolidation & Governance
    Engineer->>UI: Review postmortem & click "Approve"
    UI->>Hindsight: POST /api/memory/runbook/refresh
    Hindsight->>Runbook: Consolidate postmortem into Microservice Resolution Runbook

    Note over Engineer,Runbook: Phase 3: Warm Run (Incident inc-003 - Related Outage)
    Engineer->>UI: Select inc-003 & Run (Live Mode)
    UI->>Agent: POST /api/investigate/inc-003
    Agent->>Hindsight: query_incident_patterns() via arecall()
    Hindsight-->>Agent: Memory Result: found=true (recalled inc-001 postmortem)
    Agent->>UI: Emit memory_result (found=true, memory_used=true)
    Agent->>Tools: Fetch telemetry for inc-003
    Tools-->>Agent: Telemetry evidence
    Agent->>LLM: Analyze telemetry + Recalled Postmortem Context
    LLM-->>Agent: Targeted Diagnosis referencing prior known resolution
    Agent->>UI: Emit diagnosis_completed (memory_used=true)

    Note over Engineer,Runbook: Phase 4: Baseline Comparison
    Engineer->>UI: Click "Compare last 2"
    UI->>UI: Render side-by-side Cold vs Warm run comparison metrics
```

---

## 3. LangGraph Bounded State Machine

The diagnostic agent is implemented as an acyclic `StateGraph` in `backend/app/agent/graph.py`. Unlike unbounded cyclic agents that can loop indefinitely, EpistemicOps enforces deterministic termination:

```
load_incident ──(ok)──> query_memory ──> investigate ──(ok)──> analyze ──(ok)──> validate ──(ok)──> produce_result ──> retain_postmortem ──> END
      │                                       │                     │                    │
   (error)                                 (error)               (error)              (error)
      └───────────────────────────────────────┴─────────────────────┴────────────────────┴───────────────────────────> error_end ──> END
```

### Safety Bounds
- **Acyclic Execution:** The graph transitions strictly forward; there are no feedback loops that can stall or consume unbounded tokens.
- **Defensive Recursion Limit:** LangGraph's `recursion_limit` is set to `settings.max_agent_steps` (default 8). If the 7-node DAG ever encounters an unexpected recursion anomaly, `GraphRecursionError` is caught and surfaced as a clean `run_failed` SSE event.
- **LLM Call Timeout:** `asyncio.wait_for` wraps LLM inference with `settings.llm_timeout` (default 60s) to prevent thread hangs during upstream provider disruptions.

---

## 4. Telemetry Sanitization & Ground-Truth Isolation

EpistemicOps enforces strict boundaries to guarantee that benchmark scoring is fair and that the agent never "cheats":

1. **Hidden Ground Truth:** Fixture JSON files (`data/incidents/*.json`) include a `_ground_truth` object containing root cause categories, expected evidence tokens, canonical fix commands, and forbidden categories.
2. **Sanitization Filter:** `FixtureService` validates and strips all keys matching `HIDDEN_GT_FIELDS` (`_ground_truth`, `ground_truth`, `root_cause`, `root_cause_category`, `expected_evidence`, `canonical_fix`, `fix_tool`, `forbidden_categories`, `resolution_steps`) before the telemetry payload is handed to the agent or frontend.
3. **Automated Leak Guard:** `_node_load_incident` asserts that zero ground-truth keys exist in the loaded incident dictionary. If any leaked key is detected, the run aborts immediately with a failure event.
4. **Post-Run Evaluation:** Only after `produce_result` has yielded the final diagnosis does the evaluator (`app.eval.evaluate_diagnosis`) inspect the diagnosis against the ground truth to compute evidence overlap and category accuracy.

---

## 5. Network & Port Allocation

| Service | Port | Protocol | Scope | Role |
|---|---|---|---|---|
| Frontend Dev Server | 5173 | HTTP | Localhost | Vite development server with API proxy |
| FastAPI Application | 8000 | HTTP / SSE | 127.0.0.1 / Public | REST API, SSE event streaming, production SPA static host |
| Hindsight API Daemon | 8888 | HTTP | 127.0.0.1 (Loopback) | Vector recall, postmortem retention, mental model management |
| Neon PostgreSQL | 5432 | TCP (TLS) | External Cloud | Managed serverless pgvector database |

In production container deployments, internal services bind strictly to `127.0.0.1`, exposing only the single public application port (default `8000`).
