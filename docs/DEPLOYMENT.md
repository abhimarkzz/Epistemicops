# EpistemicOps — Deployment Guide

## Local Development (Recommended for Demo)

### Requirements

| Dependency | Minimum | Purpose |
|---|---|---|
| Docker Desktop | 24+ | Runs Hindsight |
| Python | 3.11+ | Backend |
| Node.js | 20+ | Frontend |
| Gemini API key or Groq API key | — | LLM inference |

### Start Hindsight (from project root)

```bash
# Set your LLM key for Hindsight consolidation:
export GROQ_API_KEY=your-key-here
# Or: export GEMINI_API_KEY=your-key-here

docker compose up -d
docker compose ps   # verify "hindsight" is Up
```

### Start Backend (from `backend/`)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../. env.example .env        # Then edit .env with your API key
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Verify: `curl http://localhost:8000/health`

### Start Frontend (from `frontend/`)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## Production Deployment: Render (Free Tier, $0)

### Architecture

The Dockerfile bundles Hindsight + FastAPI + pre-built frontend into a single container.

- Hindsight runs as an embedded process (not Docker-in-Docker)
- ONNX embeddings (local, no external embedding API)
- RRF reranker (local, no external reranker API)
- Neon PostgreSQL for persistent memory (survives container restarts)
- Groq free tier for LLM inference

### Steps

1. **Create a free Neon database** at [neon.tech](https://neon.tech/)
   - Run: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Copy the connection string

2. **Create a free Web Service** on [render.com](https://render.com/)
   - Connect your GitHub repository
   - Environment: **Docker**

3. **Set environment variables** on Render:

   | Variable | Value |
   |---|---|
   | `PORT` | `8000` |
   | `GROQ_API_KEY` | Your Groq key |
   | `HINDSIGHT_API_DATABASE_URL` | Your Neon connection string |
   | `HINDSIGHT_API_EMBEDDINGS_PROVIDER` | `onnx` |
   | `HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID` | `intfloat/multilingual-e5-small` |
   | `HINDSIGHT_API_RERANKER_PROVIDER` | `rrf` |
   | `CORS_ORIGIN` | Your Render public URL |
   | `ALLOW_PUBLIC_RESET` | `false` |
   | `ADMIN_TOKEN` | A secure random token |

4. **Deploy** — Render builds and launches automatically with free HTTPS.

### Free Tier Limitations

- Render free web services sleep after 15 minutes of inactivity
- First request after sleep takes ~45–60 seconds (cold start)
- Neon free tier has a 0.5 GiB storage limit
- Groq free tier has rate limits (varies by model)

---

## Self-Hosted Linux Server (OCI / Any Ubuntu)

See [deploy/README.md](../deploy/README.md) for the full guide using:

- Oracle Cloud Always Free VM (or any Ubuntu 22.04/24.04 LTS)
- Native Hindsight binary (not Docker)
- Systemd service units
- Nginx or Caddy reverse proxy with Let's Encrypt HTTPS

### Quick Start

```bash
git clone https://github.com/abhimarkzz/Epistemicops.git
cd Epistemicops
sudo bash deploy/setup-server.sh
```

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | *(auto)* | `gemini` or `groq` |
| `GEMINI_API_KEY` | — | Gemini API key (backend only) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model |
| `GROQ_API_KEY` | — | Groq API key (backend only) |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model |
| `HINDSIGHT_BASE_URL` | `http://127.0.0.1:8888` | Hindsight API URL |
| `HINDSIGHT_BANK_ID` | `epistemic-sre` | Memory bank name |
| `HINDSIGHT_MENTAL_MODEL_ID` | `microservice-resolution-runbook` | Runbook model ID |
| `BACKEND_HOST` | `127.0.0.1` | Uvicorn bind host |
| `BACKEND_PORT` | `8000` | Uvicorn bind port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `MAX_AGENT_STEPS` | `8` | LangGraph recursion limit |
| `LLM_TIMEOUT` | `60` | LLM call timeout (seconds) |
| `ALLOW_PUBLIC_RESET` | `true` | Allow unauthenticated memory reset |
| `ADMIN_TOKEN` | — | Required for reset when `ALLOW_PUBLIC_RESET=false` |
| `MAX_CONCURRENT_INVESTIGATIONS` | `2` | Concurrent investigation limit |

### Hindsight (Docker Compose / Dockerfile)

| Variable | Default | Description |
|---|---|---|
| `HINDSIGHT_LLM_PROVIDER` | `groq` | LLM for Hindsight extraction/consolidation |
| `HINDSIGHT_LLM_MODEL` | `openai/gpt-oss-120b` | Model for Hindsight |
| `HINDSIGHT_LLM_API_KEY` | `${GROQ_API_KEY}` | API key for Hindsight LLM |
| `HINDSIGHT_API_DATABASE_URL` | — | External PostgreSQL (Neon) for persistence |

**Never commit real API keys.** Use `.env` files (gitignored) or platform secret management.

---

## Health Checks

| Endpoint | Expected |
|---|---|
| `GET /health` | `{"status": "ok", "services": {"llm": ..., "hindsight": ...}}` |
| `GET /api/incidents` | JSON array of 5 incidents |
| `GET /api/memory/status` | Memory subsystem health snapshot |

Hindsight probe failures are informational — the backend returns HTTP 200 regardless.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `hindsight: unreachable` in `/health` | Start Hindsight: `docker compose up -d` |
| `llm: unreachable` in `/health` | Set `GEMINI_API_KEY` or `GROQ_API_KEY` in `backend/.env` |
| Runbook stays "generating" | Wait 1–3 minutes, or trigger refresh: `curl -X POST localhost:8000/api/memory/runbook/refresh` |
| Container exits on Render | Check build logs; ensure `PORT` is set |
| Neon connection refused | Verify `HINDSIGHT_API_DATABASE_URL` includes `?sslmode=require` |
