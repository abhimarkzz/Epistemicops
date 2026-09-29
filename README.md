# EpistemicOps

An SRE incident-response agent that builds persistent memory from resolved incidents, so future investigations start with prior knowledge instead of from zero.

| | |
|---|---|
| **GitHub** | https://github.com/abhimarkzz/Epistemicops |
| **Live Demo** | TODO |
| **Article** | TODO |
| **YouTube** | TODO |

---

## Why This Exists

Every infrastructure incident investigation starts from scratch. An on-call engineer traces a database pool exhaustion through logs and metrics, identifies the root cause, writes a postmortem — and six weeks later a teammate encounters the same failure pattern with none of that knowledge.

Monitoring systems retain everything. The humans investigating them retain almost nothing across rotation boundaries. And AI diagnostic agents? They discard their entire context after every invocation.

EpistemicOps exists to close this gap. It is not a general-purpose chatbot with memory added as a feature. It is an incident-response agent where persistent memory is the central mechanism.

---

## What EpistemicOps Does

1. Select an incident from the sidebar (5 synthetic infrastructure scenarios)
2. The LangGraph agent calls read-only evidence tools (logs, metrics, distributed traces, pod status)
3. Investigation events stream to the UI in real time via Server-Sent Events
4. A root-cause diagnosis and remediation recommendation appear when the agent finishes
5. A structured postmortem is retained in [Hindsight](https://github.com/vectorize-io/hindsight) persistent memory
6. Hindsight consolidates retained postmortems into a "Microservice Resolution Runbook"
7. On a subsequent similar incident, the agent queries that runbook and investigates with prior context

---

## Why Memory Matters

A stateless agent produces correct diagnoses — but it does so from first principles every time. It cannot say "this looks like that deployment failure from last month" because it has no last month.

Persistent memory transforms a diagnostic tool into a learning system. Each resolved incident makes the agent better prepared for the next one, not through fine-tuning or retraining, but through structured knowledge retention and semantic recall.

---

## Cold → Retain → Consolidate → Warm

```
COLD INVESTIGATION
  Incident arrives → agent has no prior knowledge
  → calls evidence tools → LLM analyzes from scratch → diagnosis
  → structured postmortem → RETAIN in Hindsight

CONSOLIDATION
  Human approves postmortem → Hindsight consolidates
  → operational knowledge synthesized into Runbook mental model

WARM INVESTIGATION
  Similar incident arrives → agent queries Hindsight → RECALL prior patterns
  → calls evidence tools → LLM analyzes with memory context → informed diagnosis
```

---

## Baseline Mode

Run any investigation with memory disabled to establish a cold baseline. Then run the same or similar incident with memory enabled. The built-in comparison view shows measured elapsed time, tool calls, confidence, and evaluator score side-by-side.

No improvements are claimed — only measured differences are displayed.

---

## How Hindsight Is Used

[Hindsight](https://github.com/vectorize-io/hindsight) provides three primitives that EpistemicOps uses:

- **Retain** (`client.aretain`): After each successful investigation, a structured postmortem (service name, root cause, evidence references, remediation) is stored in the `epistemic-sre` memory bank. Raw logs are excluded — only synthesized findings are retained.

- **Recall** (`client.arecall`): Before each investigation (unless baseline mode), the agent builds a semantic query from the incident's service, category, and alert title, then retrieves matching prior patterns. This is a vector search (no LLM call).

- **Mental Model** (`acreate_mental_model` / `arefresh_mental_model`): Hindsight consolidates individual postmortems into a "Microservice Resolution Runbook" — a higher-level synthesis of cross-incident operational knowledge. Consolidation runs in delta mode, processing only new memories.

- **Human Approval**: Retained postmortems start as `pending`. A human must approve them before they influence the consolidated runbook. This prevents low-quality diagnoses from polluting the agent's memory.

When Hindsight is unreachable, the system degrades gracefully to a stateless diagnostic tool.

See [docs/HINDSIGHT_EXPLANATION.md](docs/HINDSIGHT_EXPLANATION.md) for the full explanation with code excerpts.

**Links:**
- [Hindsight on GitHub](https://github.com/vectorize-io/hindsight)
- [Hindsight Documentation](https://hindsight.vectorize.io/)
- [What is Agent Memory?](https://vectorize.io/what-is-agent-memory)

---

## Architecture

```
┌───────────────────────┐      SSE / REST       ┌──────────────────────────┐
│  React + Vite         │ ◄────────────────────► │  FastAPI Backend         │
│  Three.js 3D scene    │                        │  LangGraph Agent (DAG)   │
│  localhost:5173        │                        │  localhost:8000           │
└───────────────────────┘                        └─────────┬────────────────┘
                                                           │
                                          ┌────────────────┼────────────────┐
                                          │                │                │
                                ┌─────────▼────────┐ ┌────▼──────────┐ ┌──▼──────────────┐
                                │  LLM Provider     │ │  Hindsight    │ │ FixtureService  │
                                │  Gemini 3.8 Flash │ │  Docker       │ │ data/incidents/ │
                                │  or Groq (free)   │ │  :8888 / :9999│ │ read-only JSON  │
                                └──────────────────-┘ └───────────────┘ └─────────────────┘
```

Full architecture details: [docs/architecture.md](docs/architecture.md)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, Three.js, @react-three/fiber, Motion |
| Backend | Python 3.11+, FastAPI, Uvicorn, Pydantic |
| Agent | LangGraph (bounded StateGraph DAG) |
| LLM | Google Gemini (`gemini-3.8-flash`) or Groq (`openai/gpt-oss-120b`, free tier) |
| Memory | Hindsight (`ghcr.io/vectorize-io/hindsight:latest`) |
| Evaluator | Deterministic keyword-based (no AI judge) |
| Streaming | Server-Sent Events (SSE) via sse-starlette |
| Data | 5 synthetic JSON incident fixtures |

---

## Prerequisites

| Dependency | Minimum | Install |
|---|---|---|
| Docker Desktop | 24+ | [docker.com](https://www.docker.com/get-docker/) |
| Python | 3.11+ | [python.org](https://python.org) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| API Key | — | [Gemini](https://aistudio.google.com/app/apikey) (free) or [Groq](https://console.groq.com) (free) |

---

## Installation

All commands assume you are in the **project root** unless stated otherwise.

### 1. Clone

```bash
git clone https://github.com/abhimarkzz/Epistemicops.git
cd Epistemicops
```

### 2. Start Hindsight

```bash
# Set your LLM key for Hindsight consolidation:
export GROQ_API_KEY=your-key-here

docker compose up -d
docker compose ps    # verify hindsight is Up
```

### 3. Install backend (from `backend/`)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 4. Install frontend (from `frontend/`)

```bash
cd frontend
npm install
cd ..
```

### 5. Configure environment

```bash
cp .env.example backend/.env
# Edit backend/.env — set GEMINI_API_KEY or GROQ_API_KEY
```

---

## Environment Variables

### `backend/.env`

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | *(auto)* | `gemini` or `groq`. Blank auto-selects: Groq if `GROQ_API_KEY` is set, else Gemini |
| `GEMINI_API_KEY` | — | Gemini API key (**backend only**) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model |
| `GROQ_API_KEY` | — | Groq API key (**backend only**) |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model |
| `HINDSIGHT_BASE_URL` | `http://127.0.0.1:8888` | Hindsight REST API |
| `HINDSIGHT_BANK_ID` | `epistemic-sre` | Memory bank name |
| `HINDSIGHT_MENTAL_MODEL_ID` | `microservice-resolution-runbook` | Runbook mental model ID |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `BACKEND_HOST` | `127.0.0.1` | Uvicorn bind host |
| `BACKEND_PORT` | `8000` | Uvicorn bind port |
| `MAX_AGENT_STEPS` | `8` | LangGraph recursion limit (safety bound) |
| `LLM_TIMEOUT` | `60` | LLM call timeout in seconds |

Never commit real API keys. Use `.env` files (gitignored).

---

## Run Locally

### Terminal 1 — Hindsight (already started above)

### Terminal 2 — Backend (from `backend/`)

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Verify: `curl http://localhost:8000/health`

### Terminal 3 — Frontend (from `frontend/`)

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

---

## Demo Walkthrough

See [docs/DEMO.md](docs/DEMO.md) for the full judge-facing walkthrough. Summary:

1. **Cold investigation (baseline)**: Select inc-003 → Baseline mode → Run. Agent investigates from scratch, retains postmortem.
2. **Approve and consolidate**: Approve the postmortem in the Runbook panel. Wait for Hindsight consolidation.
3. **Warm investigation**: Select inc-004 (similar incident) → Live mode → Run. Agent recalls prior patterns.
4. **Baseline comparison**: Select inc-004 → Baseline mode → Run. Agent investigates without memory.
5. **Compare**: Click "Compare last 2" — see measured side-by-side metrics.

**Demo mode** (offline): Select inc-003 or inc-004 → Demo mode → Run. Pre-recorded events stream without calling any external service.

**One-command demo**: `./scripts/demo.sh` runs the full cold → warm → baseline sequence.

---

## Live Demo

TODO — deploy and record URL here.

---

## Video

TODO — record, upload to YouTube, and add URL here.

---

## Article

TODO — publish and add URL here.

---

## Project Structure

```
EpistemicOps/
├── backend/
│   ├── app/
│   │   ├── agent/           # LangGraph DAG, prompts, tools, types
│   │   ├── memory/          # Hindsight service, schemas, approval store
│   │   ├── main.py          # FastAPI app, SSE endpoint, routes
│   │   ├── config.py        # Settings from .env
│   │   ├── eval.py          # Keyword evaluator
│   │   ├── fixtures.py      # Read-only incident loader
│   │   └── runs.py          # In-memory run store
│   ├── tests/               # 8 test files (agent, memory, fixtures, endpoints, etc.)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main React application
│   │   ├── api.ts           # Backend API client
│   │   ├── types.ts         # TypeScript interfaces
│   │   └── components/      # 3D scene, legal dialog
│   ├── package.json
│   └── vite.config.ts
├── data/
│   ├── incidents/           # 5 JSON incident fixtures
│   ├── demo_events/         # Pre-recorded SSE events (inc-003, inc-004)
│   └── memory_state.json    # Approval state (local persistence)
├── docs/                    # Architecture, Hindsight explanation, demo guide, article, etc.
├── scripts/                 # init_hindsight.py, demo.sh, import_datasets.py
├── deploy/                  # Server deployment configs (nginx, caddy, systemd)
├── docker-compose.yml       # Hindsight service
├── Dockerfile               # Production multi-stage build
├── start.sh                 # Production entrypoint
├── .env.example             # Environment template
└── ATTRIBUTIONS.md          # Third-party licenses and data sources
```

---

## Data and Attribution

All incident fixtures in `data/incidents/` are **synthetic**. No real production data is used.

- **inc-001, inc-002**: Hand-crafted by EpistemicOps authors
- **inc-003, inc-004, inc-005**: Derived from [quantranger/sre-agent-eda-bundle](https://huggingface.co/datasets/quantranger/sre-agent-eda-bundle) (Apache-2.0)

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) and [docs/ATTRIBUTIONS.md](docs/ATTRIBUTIONS.md) for full details.

---

## Safety and Scope

- **Simulated evidence**: All incident data is synthetic JSON fixtures. No live infrastructure is accessed.
- **Read-only tools**: The agent's 4 tools only read from `FixtureService`. No shell, kubectl, or filesystem mutation.
- **No automated remediation**: Recommended actions are advisory. The agent never executes fixes.
- **No production mutation**: The system cannot modify real infrastructure.
- **Ground truth isolation**: Hidden `_ground_truth` fields are never exposed to the agent — only to the post-run evaluator.

---

## Testing

### Backend (from `backend/`)

```bash
cd backend
source .venv/bin/activate
python -m pytest tests/ -v
```

8 test files covering: agent graph, memory service, evaluator, fixtures, endpoints, run store, health, LLM provider. All tests are mocked — no external services required.

### Frontend (from `frontend/`)

```bash
cd frontend
npm test          # vitest
npm run build     # TypeScript check + production build
```

---

## Known Limitations

1. **Single run is not statistically significant.** One cold/warm comparison is anecdotal. Multiple runs needed for meaningful comparison.
2. **Keyword evaluator is not semantic.** Correct diagnoses using different terminology may fail the evaluator.
3. **LLM latency varies.** Elapsed-time comparisons are affected by API response time, not just agent behavior.
4. **Demo events are time-frozen.** Pre-recorded events reflect the state at recording time.
5. **RunStore is in-memory.** Run records are lost on backend restart.
6. **Hindsight consolidation is asynchronous.** The runbook may not update before the warm run if the wait is too short.
7. **No authentication.** The backend accepts requests from any local client.
8. **Prototype.** Not production-ready for real incident response without significant hardening.

---

## Documentation

| Document | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Full technical architecture |
| [docs/HINDSIGHT_EXPLANATION.md](docs/HINDSIGHT_EXPLANATION.md) | How Hindsight is used |
| [docs/DEMO.md](docs/DEMO.md) | Judge/demo walkthrough |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment guide |
| [docs/ATTRIBUTIONS.md](docs/ATTRIBUTIONS.md) | Third-party attributions |
| [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md) | Submission readiness checklist |

---

## License

TODO — a LICENSE file has not been added to the repository yet. Please choose and add one (e.g., MIT, Apache-2.0).

---

## Acknowledgements

- [Hindsight](https://github.com/vectorize-io/hindsight) by [Vectorize](https://vectorize.io) — persistent agent memory
- [LangGraph](https://github.com/langchain-ai/langgraph) — agent orchestration framework
- [Google Gemini API](https://ai.google.dev) — LLM inference
- [Groq](https://console.groq.com) — free-tier LLM inference
- [quantranger/sre-agent-eda-bundle](https://huggingface.co/datasets/quantranger/sre-agent-eda-bundle) — incident fixture data (Apache-2.0)
