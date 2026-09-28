# EpistemicOps — Architecture

## Overview

EpistemicOps is an SRE incident-response assistant. AI inference uses the Gemini API (backend only); Hindsight provides local long-term memory via Docker.

```
Browser (port 5173)
    │  REST + SSE
    ▼
FastAPI backend (port 8000)
    │  LangGraph agent loop
    ├── read-only investigation tools
    │       reads JSON fixtures from data/incidents/
    │
    ├── Gemini API (gemini-3.8-flash)  ← GEMINI_API_KEY in backend/.env only
    │
    └── Hindsight (port 8888) ← Docker, local persistent memory
              uses Gemini API internally for consolidation
```

## Components

### Frontend
- **React 18 + Vite + TypeScript**
- Plain CSS; no UI framework dependency
- Communicates with the backend over REST (incident selection, status) and SSE (live agent trace)
- `VITE_API_BASE_URL` controls the backend origin (default `http://localhost:8000`)
- **The frontend never receives the Gemini API key.** It only knows the backend URL.

### Backend
- **Python + FastAPI + Uvicorn**
- Exposes a REST API and an SSE stream
- Hosts the LangGraph agent that drives incident investigation
- Reads incident fixtures from `data/incidents/`; strips `_`-prefixed ground-truth fields before returning data to any client or agent tool

### LangGraph Agent
- Bounded acyclic `StateGraph` powered by `gemini-3.8-flash` via `langchain-google-genai`
- Read-only investigation tools: logs, metrics, trace, pod status
- Produces: root-cause diagnosis, remediation recommendation, concise postmortem
- Writes postmortem to Hindsight after resolution
- The graph is acyclic (load → query_memory → investigate → analyze → validate → produce_result → retain_postmortem → END), so it terminates deterministically. `MAX_AGENT_STEPS` is applied as LangGraph's `recursion_limit` — a defensive hard cap that aborts a runaway graph with a `run_failed` event.

### Gemini API
- Cloud inference at `https://generativelanguage.googleapis.com`
- Default model: `gemini-3.8-flash`
- API key stored in `backend/.env` only — never in frontend files or Vite variables
- Used by both the FastAPI backend (agent inference) and Hindsight (memory consolidation)

### Hindsight (Docker)
- Local long-term procedural memory service
- API at port 8888; control plane at port 9999
- Configured to call the Gemini API via `HINDSIGHT_API_LLM_PROVIDER=gemini`
- **Memory bank** `epistemic-sre`: stores postmortems from resolved incidents
- **Mental Model** `microservice-resolution-runbook`: Hindsight consolidates postmortems into an evolving SRE runbook; queried at the start of each incident run to surface prior knowledge
- Observations and Mental Models must **not** be disabled

## Key data flow

### Cold run (no prior knowledge)
```
1. User selects incident in UI
2. Backend starts LangGraph agent
3. Agent queries Hindsight mental model → no match (cold)
4. Agent calls investigation tools (logs, metrics, trace, pods)
5. Agent synthesises root-cause diagnosis + recommendation via Gemini
6. Agent streams execution trace to UI via SSE
7. Backend writes postmortem to Hindsight bank
8. Hindsight consolidates postmortem into mental model runbook via Gemini
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
| Hindsight API | 8888 | HTTP |
| Hindsight control plane | 9999 | HTTP |

## Not in scope (by design)

- Authentication and authorisation
- Kubernetes or any real infrastructure
- OpenAI or Anthropic API keys
- Custom vector databases or cross-encoder reranking
- Slack or other notification integrations
- Automated code patching
