# EpistemicOps — Architecture

## Overview

EpistemicOps is a local SRE incident-response assistant with $0 runtime cost.
All AI inference runs through a local Ollama instance; no external API keys are required.

```
Browser (port 5173)
    │  REST + SSE
    ▼
FastAPI backend (port 8000)
    │  LangGraph agent loop
    ├── read-only investigation tools
    │       reads JSON fixtures from data/incidents/
    │
    ├── Ollama (port 11434)   ← Qwen3 8B, local inference
    │
    └── Hindsight (port 8888) ← Docker, local persistent memory
              uses Ollama internally (not an external AI API)
```

## Components

### Frontend
- **React 18 + Vite + TypeScript**
- Plain CSS; no UI framework dependency
- Communicates with the backend over REST (incident selection, status) and SSE (live agent trace)
- `VITE_API_BASE_URL` controls the backend origin (default `http://localhost:8000`)

### Backend
- **Python + FastAPI + Uvicorn**
- Exposes a REST API and an SSE stream
- Hosts the LangGraph agent that drives incident investigation
- Reads incident fixtures from `data/incidents/`; strips `_`-prefixed ground-truth fields before returning data to any client or agent tool

### LangGraph Agent *(implemented in a later stage)*
- Multi-step reasoning loop powered by Qwen3 8B via `langchain-ollama`
- Read-only investigation tools: logs, metrics, topology, recent deploys
- Produces: root-cause diagnosis, remediation recommendation, concise postmortem
- Writes postmortem to Hindsight after resolution
- Maximum steps bounded by `MAX_AGENT_STEPS` to prevent runaway loops

### Ollama
- Local LLM runtime at `http://127.0.0.1:11434`
- Default model: `qwen3:8b`
- Used by both the FastAPI backend (agent inference) and Hindsight (memory consolidation)

### Hindsight (Docker)
- Local long-term procedural memory service
- API at port 8888; control plane at port 9999
- Configured to call the host Ollama instance via `host.docker.internal:11434`
- **Memory bank** `epistemic-sre`: stores postmortems from resolved incidents
- **Mental Model** `microservice-resolution-runbook`: Hindsight consolidates postmortems into an evolving SRE runbook; queried at the start of each incident run to surface prior knowledge
- Observations and Mental Models must **not** be disabled

## Key data flow

### Cold run (no prior knowledge)
```
1. User selects incident in UI
2. Backend starts LangGraph agent
3. Agent queries Hindsight mental model → no match (cold)
4. Agent calls investigation tools (logs, metrics, topology, deploys)
5. Agent synthesises root-cause diagnosis + recommendation
6. Agent streams execution trace to UI via SSE
7. Backend writes postmortem to Hindsight bank
8. Hindsight consolidates postmortem into mental model runbook
```

### Warm run (prior knowledge available)
```
1. User selects similar incident in UI
2. Backend starts LangGraph agent
3. Agent queries Hindsight mental model → match found
4. Agent uses learned pattern to skip unnecessary investigation steps
5. Agent produces diagnosis faster, citing prior runbook entry
6. Postmortem written; runbook updated
```

## Ground-truth isolation

Incident fixture files contain `_ground_truth` objects with the actual root cause
and resolution steps.  These fields are **never** passed to the agent.
The `_strip_private()` function in `backend/app/main.py` removes every key whose
name starts with `_` before the data leaves the backend.

The evaluator may compare the agent's diagnosis against `_ground_truth` after the
run completes to assess correctness.

## Ports summary

| Service | Port | Protocol |
|---|---|---|
| Frontend (Vite) | 5173 | HTTP |
| Backend (Uvicorn) | 8000 | HTTP (REST + SSE) |
| Ollama | 11434 | HTTP |
| Hindsight API | 8888 | HTTP |
| Hindsight control plane | 9999 | HTTP |

## Not in scope (by design)

- Authentication and authorisation
- Kubernetes or any real infrastructure
- External AI APIs (OpenAI, Anthropic, Gemini, etc.)
- Custom vector databases or cross-encoder reranking
- Slack or other notification integrations
- Automated code patching
