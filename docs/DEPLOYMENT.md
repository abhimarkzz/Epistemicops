# EpistemicOps Production Deployment Guide & Operations Manual

This document details the production deployment architecture for EpistemicOps, covering the zero-credit-card container deployment (Render + Neon Serverless PostgreSQL) as well as self-hosted Linux container/systemd deployments.

---

## 1. Architecture

In production, EpistemicOps packages both the React 18 single-page application (SPA) and the FastAPI backend into a single unified container. Hindsight runs in-process or as an internal daemon on the loopback interface (`127.0.0.1:8888`), storing vector embeddings in Neon Serverless PostgreSQL with `pgvector`.

```
                  Public Internet (User Browser)
                               │
               HTTPS (https://epistemicops.onrender.com)
                               ▼
        ┌──────────────────────────────────────────────┐
        │        Render Web Service / Docker Host      │
        │        • Single Exposed Port ($PORT, 8000)   │
        │        • Container Non-Root User (UID 1000)  │
        │                                              │
        │   ┌──────────────────────────────────────┐   │
        │   │ FastAPI Web Application (:8000)      │   │
        │   │  • Serves React 18 + Three.js Bundle │   │
        │   │  • Handles REST & Streams SSE Events │   │
        │   │  • LangGraph Bounded SRE Agent       │   │
        │   └───────────────┬──────────────────────┘   │
        │                   │                          │
        │   ┌───────────────▼──────────────────────┐   │
        │   │ Native Hindsight Daemon (:8888)      │   │
        │   │  • Local In-Process ONNX Embeddings  │   │
        │   │    (intfloat/multilingual-e5-small)  │   │
        │   │  • Reciprocal Rank Fusion (RRF)      │   │
        │   │  • Bound strictly to 127.0.0.1       │   │
        │   └───────────────┬──────────────────────┘   │
        └───────────────────┼──────────────────────────┘
                            │ Encrypted TLS (Port 5432)
                            ▼
        ┌──────────────────────────────────────────────┐
        │     Neon Serverless PostgreSQL (Cloud)       │
        │     • pgvector extension enabled             │
        │     • 384-dimension vector schema            │
        │     • Preserves postmortems across restarts  │
        └──────────────────────────────────────────────┘
```

---

## 2. Prerequisites

- **Git & GitHub Account** (for repository hosting and webhook deployments)
- **Groq API Key:** Free tier account at [console.groq.com](https://console.groq.com)
- **Neon PostgreSQL Account:** Free serverless database at [neon.tech](https://neon.tech)
- **Docker 24+** (if building or running containers locally)
- **Render Account** (or any standard Docker container platform such as Railway, Fly.io, or an Ubuntu VM)

---

## 3. Environment Variables

Store all credentials in the hosting platform's secure environment settings (or `backend/.env` for local hosting). Never check secrets into Git:

| Variable | Recommended Production Value | Description |
|---|---|---|
| `PORT` | `8000` | Application HTTP port assigned by host. |
| `LLM_PROVIDER` | `groq` | Agent LLM provider (`groq` or `gemini`). |
| `GROQ_API_KEY` | `gsk_...` | Production Groq API key for agent inference. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Model identifier for diagnostic reasoning. |
| `HINDSIGHT_PORT` | `8888` | Loopback port for native Hindsight daemon. |
| `HINDSIGHT_BASE_URL` | `http://127.0.0.1:8888` | Internal loopback URL used by FastAPI. |
| `HINDSIGHT_BANK_ID` | `epistemic-sre` | Isolated memory bank ID. |
| `HINDSIGHT_MENTAL_MODEL_ID` | `microservice-resolution-runbook` | ID of the operational resolution runbook. |
| `HINDSIGHT_API_EMBEDDINGS_PROVIDER` | `onnx` | Uses local ONNX embeddings without external API costs. |
| `HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID` | `intfloat/multilingual-e5-small` | Pre-cached 384-dimension ONNX embedding model. |
| `HINDSIGHT_API_RERANKER_PROVIDER` | `rrf` | Reciprocal rank fusion reranker (zero memory overhead). |
| `HINDSIGHT_API_DATABASE_URL` | `postgresql://...@...neon.tech/neondb?sslmode=require` | Neon PostgreSQL connection string with `pgvector`. |
| `ALLOW_PUBLIC_RESET` | `false` | Disables unauthenticated memory wipes on public instances. |
| `ADMIN_TOKEN` | *(generate random 32-char string)* | Bearer token required for `DELETE /api/memory/bank`. |
| `MAX_CONCURRENT_INVESTIGATIONS` | `2` | Concurrency limiter preventing resource exhaustion. |

---

## 4. Build Process

The project uses a production multi-stage `Dockerfile`:

1. **Stage 1 (Frontend Builder):**
   - Node 20 Alpine environment installs npm dependencies via `npm ci`.
   - Runs `npm run build` (`tsc && vite build`) to generate optimized static chunks in `frontend/dist/`.
2. **Stage 2 (Runtime Python Environment):**
   - Python 3.11 Slim installs system packages (`curl`, `build-essential`, `libpq-dev`).
   - Creates a dedicated non-root user `user` (UID 1000).
   - Installs backend requirements and `hindsight-api-slim[embedded-db,local-onnx]==0.10.1`.
   - Pre-downloads the ONNX model and tokenizer from HuggingFace Hub during image construction to eliminate cold-start download pauses.
   - Copies compiled frontend assets from Stage 1 into `/app/frontend/dist/`.

To build locally:
```bash
docker build -t epistemicops:latest .
```

---

## 5. Startup Sequence (`start.sh`)

When the container starts, `/app/start.sh` executes the following orchestration:

1. **Database Schema Verification:** Runs `python scripts/verify_db_schema.py` to ensure the Neon PostgreSQL instance has `vector` enabled and `memory_units.embedding` configured for 384 dimensions.
2. **Launch Hindsight Daemon:** Starts `hindsight-api --port 8888` in the background with local ONNX embeddings and RRF reranking.
3. **Health Probes:** Polls `http://127.0.0.1:8888/health/live` and `/health/ready` until Hindsight and the database connection report healthy.
4. **Data Initialization:** Executes `python scripts/init_hindsight.py` to ensure the `epistemic-sre` memory bank and `microservice-resolution-runbook` mental model exist.
5. **Launch Application:** Starts Uvicorn on `0.0.0.0:$PORT` to serve the FastAPI REST API, SSE endpoints, and static React SPA.

---

## 6. Health Checks & Verification

### Local / Internal Health Probes
```bash
# Backend application health
curl -s http://127.0.0.1:8000/health | jq .

# Native Hindsight daemon liveness
curl -s http://127.0.0.1:8888/health/live

# Native Hindsight database readiness
curl -s http://127.0.0.1:8888/health/ready
```

### Public Endpoint Probe
```bash
curl -s https://epistemicops.onrender.com/health | jq .
```

Expected response:
```json
{
  "status": "ok",
  "service": "epistemicops-backend",
  "services": {
    "llm": {
      "provider": "groq",
      "status": "ok",
      "url": "https://api.groq.com (model: openai/gpt-oss-120b)"
    },
    "hindsight": {
      "status": "ok",
      "url": "http://127.0.0.1:8888"
    }
  }
}
```

---

## 7. Logs & Observability

- **Container Logs:** Stream live logs via your container platform (e.g. `render logs` or `docker logs -f <container-id>`).
- **Internal Hindsight Logs:** Stored in `/tmp/hindsight.log` inside the container for debugging startup sequences.
- **Investigation Telemetry:** Real-time event streams emitted over SSE on `/api/investigate/{incident_id}`.

---

## 8. Secrets Management

- **Zero Client Exposure:** The frontend SPA bundle (`frontend/dist/assets/*.js`) contains zero API keys or database connection strings.
- **Backend Isolation:** `GROQ_API_KEY`, `HINDSIGHT_API_DATABASE_URL`, and `ADMIN_TOKEN` are passed exclusively via environment variables.
- **Git Protection:** `.env` and `backend/.env` are strictly included in `.gitignore` and `.dockerignore`.

---

## 9. Public Deployment URL

- **Production Live URL:** [https://epistemicops.onrender.com](https://epistemicops.onrender.com)
- **Repository Source:** [https://github.com/abhimarkzz/Epistemops](https://github.com/abhimarkzz/Epistemops)

---

## 10. Known Free-Tier Limitations

1. **Idle Spin-Down:** On Render's free tier, the web service spins down after 15 minutes of inactivity. The first subsequent request triggers a cold-start boot taking approximately 45–60 seconds.
2. **512 MB Memory Ceiling:** The stack uses in-process ONNX embeddings with `rrf` (reciprocal rank fusion) rather than neural cross-encoders to ensure total container memory stays comfortably under 450 MB RSS.
3. **Database Storage Quota:** Neon's free tier provides 0.5 GB of storage. Postmortems are stored as concise text summaries (~1 KB each), supporting tens of thousands of incidents without exceeding quotas.
4. **Groq Free-Tier Rate Limits:** Heavy background consolidation can trigger tokens-per-minute limits on the free Groq tier. Vector recall operates independently of the LLM and remains unaffected.

---

## 11. Rollback Procedure

If an update causes regressions:
1. In the hosting dashboard (e.g. Render), navigate to **Deploys**.
2. Select the previous successful deployment and click **Rollback**.
3. Because operational memory resides permanently in Neon PostgreSQL, rolling back code never causes loss of stored postmortems or runbook entries.
