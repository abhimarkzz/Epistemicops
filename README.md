# EpistemicOps

A local SRE incident-response assistant that investigates infrastructure incidents, produces root-cause diagnoses, and builds long-term procedural memory through Hindsight.

## What it does

1. **Cold incident** — user selects a predefined incident fixture
2. **Investigate** — LangGraph agent queries read-only evidence tools (logs, metrics, topology)
3. **Diagnose** — agent produces a root-cause diagnosis and safe remediation recommendation
4. **Retain** — concise postmortem is stored in Hindsight
5. **Learn** — Hindsight updates a persistent SRE runbook (Mental Model)
6. **Warm incident** — a later similar incident queries learned memory to skip unnecessary steps

No external AI APIs are required. All inference runs through a local Ollama model.

## Runtime cost

**$0.** Everything runs locally: Ollama, Hindsight (Docker), and the backend Python process.

## Prerequisites

| Dependency | Purpose | Install |
|---|---|---|
| [Ollama](https://ollama.ai) | Local LLM inference | `brew install ollama` |
| Qwen3 8B model | Default reasoning model | `ollama pull qwen3:8b` |
| Docker Desktop | Runs Hindsight | [docker.com/get-docker](https://www.docker.com/get-docker/) |
| Python 3.11+ | Backend | [python.org](https://python.org) |
| Node.js 20+ | Frontend | [nodejs.org](https://nodejs.org) |

## Quick start

### 1 — Pull the Hindsight Docker image

Follow the Hindsight self-hosting guide at https://hindsight.dev/docs/self-hosting to obtain the Docker image, then update the image tag in `docker-compose.yml` if needed.

### 2 — Start services

```bash
# From the project root
ollama serve            # terminal 1 — keep running

docker compose up -d    # terminal 2 — starts Hindsight
```

### 3 — Backend

```bash
cd backend
python -m venv .venv            # skip if .venv already exists
source .venv/bin/activate       # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env         # then edit .env as needed
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 4 — Frontend

```bash
cd frontend
npm install
cp .env.example .env            # already correct for local dev
npm run dev
```

Open http://localhost:5173

## Project structure

```
epistemicops/
├── frontend/          React + Vite + TypeScript (plain CSS)
├── backend/
│   ├── app/           FastAPI application
│   └── tests/
├── data/
│   └── incidents/     Deterministic JSON incident fixtures
├── docs/              Architecture and design notes
├── scripts/           Utility scripts
├── docker-compose.yml Hindsight service
├── .env.example       Documented environment variables
└── ATTRIBUTIONS.md    Third-party licences
```

## Ports

| Service | Port |
|---|---|
| Frontend | 5173 |
| Backend | 8000 |
| Ollama | 11434 |
| Hindsight API | 8888 |
| Hindsight control plane | 9999 |

## Architecture

See [docs/architecture.md](docs/architecture.md).
