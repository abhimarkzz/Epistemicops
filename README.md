# EpistemicOps

A local SRE incident-response assistant. It investigates infrastructure incidents, produces root-cause diagnoses, and builds long-term procedural memory so future similar incidents resolve faster.

**Runtime cost:** Designed to operate within the Gemini API free-tier quotas. Requires a [Gemini API key](https://aistudio.google.com/app/apikey) (free). No OpenAI or Anthropic keys are used.

---

## Table of contents

1. [Project description](#1-project-description)
2. [Architecture](#2-architecture)
3. [Prerequisites](#3-prerequisites)
4. [Installation](#4-installation)
5. [Environment variables](#5-environment-variables)
6. [Starting services](#6-starting-services)
7. [Running the backend](#7-running-the-backend)
8. [Running the frontend](#8-running-the-frontend)
9. [Running tests](#9-running-tests)
10. [Dataset preparation](#10-dataset-preparation)
11. [Demo procedure](#11-demo-procedure)
12. [Troubleshooting](#12-troubleshooting)
13. [Known limitations](#13-known-limitations)
14. [License and attribution](#14-license-and-attribution)
15. [Privacy, trust & legal considerations](#15-privacy-trust--legal-considerations)

---

## 1. Project description

EpistemicOps is a browser-based SRE assistant that runs entirely on your laptop.

**Investigation flow:**

1. Select an incident fixture from the sidebar.
2. Click **Run Investigation** to start the LangGraph agent.
3. The agent calls read-only evidence tools (logs, metrics, trace, pod status) and emits events to the UI in real time via Server-Sent Events.
4. A root-cause diagnosis and safe remediation recommendation appear when the agent finishes.
5. A concise postmortem is retained in Hindsight, which updates a persistent Microservice Resolution Runbook.
6. On a subsequent similar incident the agent queries that runbook, skips redundant evidence-gathering, and resolves the incident faster.

**Learning-loop comparison:**

- **Baseline mode** — run an investigation with memory disabled to establish a cold baseline.
- **Live mode** — run the same or a similar incident with memory enabled to measure the warm result.
- **Compare** — click "Compare last 2" to see a side-by-side table of elapsed time, tool calls, confidence, and evaluator score. All values are measured; none are invented.

**Demo mode** — streams pre-recorded events from `data/demo_events/` without calling Gemini or Hindsight. Useful for showing the UI when external services are unavailable. Every demo stream starts with a `demo_mode_started` event that identifies it clearly as a replay.

---

## 2. Architecture

```
┌─────────────────────┐      SSE (POST /api/investigate)      ┌──────────────────────┐
│   React + Vite      │ ──────────────────────────────────── │   FastAPI backend     │
│   localhost:5173    │      REST (/api/*)                    │   localhost:8000      │
└─────────────────────┘                                        └──────────┬───────────┘
                                                                          │
                                              ┌───────────────────────────┼───────────────────────┐
                                              │                           │                       │
                                   ┌──────────▼──────────┐  ┌────────────▼────────┐  ┌───────────▼──────────┐
                                   │   LangGraph agent    │  │  Hindsight (Docker) │  │ FixtureService       │
                                   │   gemini-3.8-flash   │  │  localhost:8888/9999│  │ data/incidents/*.json│
                                   │   via Gemini API     │  │  long-term memory   │  │ read-only evidence   │
                                   └─────────────────────-┘  └─────────────────────┘  └──────────────────────┘
```

**Key components:**

| Path | Role |
|---|---|
| `frontend/src/App.tsx` | React UI: 3D Command Center, incident queue, live timeline, runbook panel, learning-loop comparison |
| `frontend/src/components/three/EpistemicGraph.tsx` | Interactive 3D WebGL Epistemic Graph topology scene and accessible 2D fallback |
| `backend/app/main.py` | FastAPI: SSE endpoint, run store, memory and approval endpoints |
| `backend/app/agent/graph.py` | LangGraph `StateGraph`: query memory → call tools → diagnose → retain |
| `backend/app/agent/tools.py` | Read-only evidence tools backed by `FixtureService` |
| `backend/app/memory/service.py` | Hindsight client wrapper: bank init, retain, runbook, approval store |
| `backend/app/eval.py` | Deterministic keyword evaluator — no AI judge |
| `backend/app/runs.py` | In-memory run store with cold/warm comparison |
| `data/incidents/` | Deterministic JSON fixtures (public fields + ground truth) |
| `data/demo_events/` | Pre-recorded SSE event files for demo mode |
| `docker-compose.yml` | Hindsight service definition |

Full architecture notes: [docs/architecture.md](docs/architecture.md)

---

## 3. Prerequisites

Install these before continuing.

| Dependency | Minimum version | Purpose | Install |
|---|---|---|---|
| Gemini API key | — | LLM inference (backend only) | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| [Docker Desktop](https://www.docker.com/get-docker/) | 24+ | Runs Hindsight | docker.com |
| Python | 3.11+ | Backend | [python.org](https://python.org) |
| Node.js | 20+ | Frontend build | [nodejs.org](https://nodejs.org) |

Check versions:

```bash
docker --version
python3 --version
node --version
```

---

## 4. Installation

All commands below assume you are in the project root unless stated otherwise.

### 4.1 — Clone and enter the repository

```bash
git clone <repo-url> epistemicops
cd epistemicops
```

### 4.2 — Pull the Hindsight Docker image

Follow the Hindsight self-hosting guide at https://hindsight.dev/docs/self-hosting to obtain the Docker image, then verify the image tag in `docker-compose.yml` matches.

### 4.3 — Install backend dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 4.4 — Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 4.5 — Copy environment files

```bash
# Root / backend
cp .env.example backend/.env

# Frontend (the default is correct for local dev — no edits needed)
cp frontend/.env.example frontend/.env
```

---

## 5. Environment variables

### `backend/.env`

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | *(blank)* | `gemini` or `groq`. Blank auto-selects: Groq when `GROQ_API_KEY` is set, otherwise Gemini. |
| `GEMINI_API_KEY` | *(required for Gemini)* | Gemini API key — **backend only, never expose to frontend** |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model for agent inference |
| `GROQ_API_KEY` | *(optional)* | Free-tier Groq key ([console.groq.com](https://console.groq.com)) — **backend only**. When set, the agent uses Groq, which avoids Gemini free-tier access/quota limits. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model for agent inference |
| `HINDSIGHT_BASE_URL` | `http://127.0.0.1:8888` | Hindsight API URL |
| `HINDSIGHT_BANK_ID` | `epistemic-sre` | Name of the Hindsight memory bank |
| `HINDSIGHT_MENTAL_MODEL_ID` | `microservice-resolution-runbook` | Runbook mental model id. `scripts/init_hindsight.py` reconciles this to the server-assigned id (e.g. `mm-…`) on first setup. |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `BACKEND_HOST` | `127.0.0.1` | Host the uvicorn server binds to |
| `BACKEND_PORT` | `8000` | Port the uvicorn server listens on |
| `MAX_AGENT_STEPS` | `8` | Hard cap on LangGraph super-steps (`recursion_limit`); the agent DAG runs 7 steps, so this is the safety bound that aborts a runaway graph with a `run_failed` event |
| `LLM_TIMEOUT` | `60` | Seconds to wait for a Gemini response |

### `frontend/.env`

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | *(empty)* | Leave empty; the Vite proxy forwards `/api` and `/health` to the backend. Set to the backend origin only for a standalone deployment without a proxy. |

---

## 6. Starting services

**Terminal 1 — Hindsight (Docker):**

```bash
GEMINI_API_KEY=your-key-here docker compose up -d
```

Or set `GEMINI_API_KEY` in your shell environment first, then:

```bash
docker compose up -d
```

Verify the container is healthy:

```bash
docker compose ps
```

Expected: `hindsight` shows `Up` or `healthy`.

---

## 7. Running the backend

Run in a **new terminal tab** from the `backend/` directory.

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Confirm it started:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok","service":"epistemicops-backend","services":{"gemini":{"status":"ok",...},"hindsight":{"status":"ok",...}}}
```

The `services.gemini` and `services.hindsight` values are informational probes. The backend always returns HTTP 200; a probe reporting `"unreachable"` means the Gemini API key is missing or Hindsight is down.

To initialise the Hindsight bank and mental model explicitly (optional — the backend does this automatically on startup):

```bash
cd backend
source .venv/bin/activate
python scripts/init_hindsight.py
```

---

## 8. Running the frontend

### Development server (with hot reload)

Run in a **new terminal tab** from the `frontend/` directory.

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

### Production preview build

```bash
cd frontend
npm run build
npm run preview
```

Open http://localhost:5173

The `vite preview` command uses the same proxy configuration as `vite dev`, so the backend URL is handled automatically.

---

## 9. Running tests

### Backend tests

```bash
cd backend
source .venv/bin/activate
python -m pytest tests/ -v
```

Expected: all tests pass. The suite covers the LangGraph agent, memory service, evaluator, and run store. No external services (Gemini, Hindsight) are required — everything is mocked.

### Frontend tests and type check
 
```bash
cd frontend
npm test        # Run vitest test suite
npm run build   # TypeScript check (tsc) + Vite production bundle
```

TypeScript errors appear as build failures. There is no separate `tsc --noEmit` script; the build step runs `tsc` first.

---

## 10. Dataset preparation

Incident fixtures live in `data/incidents/`. Each fixture is a directory:

```
data/incidents/
└── inc-001/
    ├── incident.json    # incident metadata + ground truth (ground_truth key is evaluator-only)
    ├── logs.txt         # raw log lines
    ├── metrics.json     # metric snapshot
    ├── trace.json       # distributed trace (optional)
    └── pods.json        # Kubernetes pod status (optional)
```

The `FixtureService` never exposes `ground_truth` to the frontend or agent. It is only read by the evaluator inside `main.py` after a run completes.

**To add a new incident fixture:**

1. Create a new directory under `data/incidents/` (e.g. `inc-005/`).
2. Add `incident.json` with the schema matching existing fixtures. Include a `ground_truth` block with `root_cause_category`, `expected_evidence`, `expected_resolution`, and optionally `forbidden_categories`.
3. Add `logs.txt`, `metrics.json`, and optionally `trace.json` and `pods.json`.
4. Restart the backend — fixtures are loaded at startup.

**To add pre-recorded demo events for a new incident:**

1. Run a live investigation of the incident to confirm it works.
2. Copy the SSE event stream to `data/demo_events/<incident_id>.json` in the format used by `inc-003.json` and `inc-004.json`.
3. The demo file must include a `_meta` block and an `events` array. Each event has `event`, `data`, and optional `delay_ms`.

---

## 11. Demo procedure

This section walks through the full cold → warm learning loop. See [docs/DEMO.md](docs/DEMO.md) for a more detailed guide including baseline mode and evaluator explanation, and [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for a judge-facing ~1-minute walkthrough.

**One-command run:** with the stack up and a working LLM key in `backend/.env` (a free `GROQ_API_KEY` is the simplest — see §5), `./scripts/demo.sh` resets memory and runs the cold → warm → baseline sequence, printing the key events and the resulting run records.

### Phase A — Cold run (memory disabled)

```bash
# Ensure the backend is running, then open the UI
open http://localhost:5173
```

1. Select **inc-003** from the incident queue.
2. Click the **Baseline** mode button (skips memory).
3. Click **Run (baseline)**.
4. Wait for the `run_completed` event. Note the elapsed time and tool-call count shown in the Recent Runs bar.

### Phase B — Consolidate memory

After the cold run completes, a postmortem is retained in Hindsight.

Click **Approve** in the Runbook panel to approve the postmortem for consolidation. Hindsight consolidates approved postmortems into the runbook periodically (typically within a few minutes). You can monitor the runbook state in the Runbook panel.

To trigger a manual refresh:

```bash
curl -X POST http://localhost:8000/api/memory/runbook/refresh
```

### Phase C — Warm run (memory enabled)

1. Select **inc-004** from the incident queue (similar incident pattern).
2. Click the **Live** mode button.
3. Click **Run Investigation**.
4. Watch the `memory_result` event — it should show `found: true` and a summary of the prior pattern from the runbook.

### Phase D — Compare results

1. Click **Compare last 2** in the Recent Runs bar.
2. A side-by-side table appears showing elapsed time, tool calls, confidence, and evaluator pass/fail for both runs.
3. The disclaimer reads: *"These are measured values. Differences reflect actual run conditions, not claimed improvements."*

### Demo mode (no live model required)

1. Select **inc-003** or **inc-004**.
2. Click the **Demo** mode button.
3. Click **Run (demo)**.
4. Events stream from `data/demo_events/<incident_id>.json`. The timeline shows an orange **DEMO** badge.
5. The first event identifies itself: `"Demo Mode — deterministic replay"`.

### Safe memory reset

To wipe the Hindsight bank and start fresh (irreversible — use with intention):

1. In the Runbook panel, click **⚠ Reset Memory Bank**.
2. A confirmation prompt appears. Click **Confirm Reset**.
3. Only the EpistemicOps bank (`epistemic-sre`) is affected. Other Hindsight banks are untouched.

---

## 12. Troubleshooting

### Node version mismatch

**Symptom:** `npm install` or `npm run build` fails with syntax errors or unsupported feature warnings.

**Fix:** Verify Node.js 20 or later is active.

```bash
node --version   # must be v20 or higher
```

Use [nvm](https://github.com/nvm-sh/nvm) to switch:

```bash
nvm install 20
nvm use 20
```

---

### Python virtual environment not activated

**Symptom:** `uvicorn: command not found` or `ModuleNotFoundError: No module named 'fastapi'`.

**Fix:** Activate the virtual environment before running any backend command.

```bash
cd backend
source .venv/bin/activate
```

On Windows use `.venv\Scripts\activate`.

---

### Docker not running

**Symptom:** `docker compose up` fails with `Cannot connect to the Docker daemon`.

**Fix:** Start Docker Desktop, wait for the whale icon to appear in the menu bar, then retry.

```bash
docker compose up -d
```

---

### Gemini API key missing or invalid

**Symptom:** `/health` reports `"gemini": {"status": "unreachable"}`. Investigations fail with an authentication error.

**Fix:** Set `GEMINI_API_KEY` in `backend/.env`. Get a free key at [aistudio.google.com](https://aistudio.google.com/app/apikey). Then restart the backend.

---

### Hindsight unable to reach Gemini

**Symptom:** Runbook refresh returns an error, or Hindsight logs show `401 Unauthorized` or `API key not valid`.

**Fix:** Ensure `GEMINI_API_KEY` is set in your shell environment before running `docker compose up`. The compose file passes it as `HINDSIGHT_API_LLM_API_KEY`.

```bash
export GEMINI_API_KEY=your-key-here
docker compose down
docker compose up -d
```

---

### Backend port already in use

**Symptom:** `uvicorn` fails with `[Errno 48] Address already in use` on port 8000.

**Fix:** Find and stop the process using port 8000.

```bash
lsof -ti :8000 | xargs kill -9
```

Then start uvicorn again. If port 8000 is permanently occupied by another service, change `BACKEND_PORT` in `backend/.env` and update `CORS_ORIGIN` accordingly; also update the proxy target in `frontend/vite.config.ts`.

---

### Frontend port already in use

**Symptom:** `npm run dev` fails with `Port 5173 is already in use`.

**Fix:**

```bash
lsof -ti :5173 | xargs kill -9
npm run dev
```

Or start on a different port:

```bash
cd frontend
npm run dev -- --port 5174
```

If you change the frontend port, update `CORS_ORIGIN` in `backend/.env` to match.

---

### SSE connection failure

**Symptom:** The timeline shows no events after clicking Run, or the browser console shows `ERR_EMPTY_RESPONSE` or `net::ERR_CONNECTION_REFUSED` on the `/api/investigate/` request.

**Checks:**

1. Confirm the backend is running: `curl http://localhost:8000/health`
2. Confirm the Vite proxy is forwarding: the dev server log should show `Proxy /api → http://localhost:8000`.
3. Check the browser Network tab — the POST to `/api/investigate/<id>` should return `200` with `Content-Type: text/event-stream`.

If the backend is running but the stream closes immediately, check the backend terminal for a Python traceback and resolve the reported error.

---

### Hindsight consolidation delay

**Symptom:** After running an investigation and approving the postmortem, a subsequent warm run still reports `memory_result: found: false`.

**Explanation:** Hindsight consolidates approved postmortems into the runbook asynchronously. This typically takes 1–3 minutes but may take longer depending on model load time.

**Fix:** Wait 2–3 minutes, trigger a manual runbook refresh, then run the warm investigation.

```bash
curl -X POST http://localhost:8000/api/memory/runbook/refresh
```

Check the runbook state in the UI (Runbook panel, last-updated timestamp) or via:

```bash
curl http://localhost:8000/api/memory/runbook
```

---

### JSON parse error in agent output

**Symptom:** Investigation ends with `run_failed` event; the backend log shows `JSONDecodeError` or `OutputParserException`.

**Cause:** Gemini occasionally wraps its JSON in markdown code fences (` ```json ... ``` `). The backend strips these, but edge cases can produce malformed JSON.

**Fix:** Re-run the same incident. If failures are frequent, check `backend/app/agent/graph.py` `_parse_llm_json` for the stripping logic.

---

## 13. Known limitations

1. **Single run is not statistically significant.** One cold/warm comparison is anecdotal. Run at least five pairs to estimate real improvement distributions.

2. **Keyword evaluator is not semantic.** The evaluator checks for literal tokens and phrases, not meaning. A diagnosis that uses different but correct terminology may fail.

3. **Gemini API latency varies.** Cold-run elapsed time includes network round-trip to the Gemini API. First requests may be slightly slower due to quota warm-up. This affects elapsed-time comparisons between runs.

4. **Demo events are time-frozen.** `data/demo_events/*.json` reflects the system state at recording time. Fixture changes after recording will not be reflected in demo output.

5. **RunStore is in-memory.** Run records are lost on backend restart. For persistent run history, a SQLite or file-backed store would be needed.

6. **Hindsight consolidation is non-deterministic.** The runbook update that triggers warm-run memory hits depends on Hindsight internals and may not happen before the warm run if the wait is too short.

7. **No authentication.** The backend accepts requests from any local client. Do not expose port 8000 on a network interface accessible to other machines.

8. **Ground truth is keyword-based, not expert-labeled.** Fixture ground truth was written to match the fixture data, not validated by a human SRE against real incidents.

---

## 14. License and attribution

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for third-party library licences.

This project was built as a demonstration of cloud-AI, memory-augmented SRE automation. It is not affiliated with Hindsight, Google, or LangChain.

---

## 15. Privacy, trust & legal considerations

EpistemicOps is architected with a **local-first, data-minimization approach** to SRE automation:

- **Zero Cookies & Zero Tracking:** The application sets zero HTTP cookies, uses zero persistent browser storage for tracking, and includes zero third-party analytics SDKs (no Google Analytics, PostHog, Mixpanel, or Sentry).
- **Synthetic Demonstration Telemetry:** All incident investigations operate on synthetic microservice fixtures (`data/incidents/`). No live customer data or personally identifiable information (PII) is processed or retained.
- **External Network Boundaries:**
  - **Google Fonts CDN:** The frontend loads typography (`VT323` and `JetBrains Mono`) from Google Fonts.
  - **LLM APIs (Live Mode):** When executing investigations in Live Mode, incident telemetry (logs, metrics, pod names) is transmitted to the configured LLM API (Google Gemini or Groq) using your own API key. In Baseline Mode, memory is bypassed; in Demo Mode, pre-recorded replay events are used with zero external network calls.
  - **Local Memory (Hindsight):** Incident postmortems and runbooks are stored locally within the self-hosted Hindsight Docker container (`127.0.0.1:8888`).
- **Non-Production Disclaimer:** EpistemicOps is an experimental prototype. Remediations and diagnoses generated by the agent must be reviewed by qualified human engineers before taking action in live production systems.

For full audits and documentation:
- [Privacy Policy](docs/PRIVACY_POLICY.md)
- [Terms of Use & Disclaimer](docs/TERMS_OF_USE.md)
- [Privacy Data Inventory](docs/PRIVACY_DATA_INVENTORY.md)
- [Cookie Audit](docs/COOKIE_AUDIT.md)
- [Analytics & Telemetry Audit](docs/ANALYTICS_AUDIT.md)
- [Third-Party Services Audit](docs/THIRD_PARTY_AUDIT.md)
- [Legal & Privacy Audit Matrix](docs/LEGAL_PRIVACY_AUDIT.md)

