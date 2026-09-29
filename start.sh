#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " Starting EpistemicOps Production Stack on Port ${PORT:-7860}"
echo "=========================================================="

export PORT="${PORT:-7860}"
export HINDSIGHT_PORT="${HINDSIGHT_PORT:-8888}"
export HINDSIGHT_BASE_URL="http://127.0.0.1:${HINDSIGHT_PORT}"
export HINDSIGHT_BANK_ID="${HINDSIGHT_BANK_ID:-epistemic-sre}"
export HINDSIGHT_MENTAL_MODEL_ID="${HINDSIGHT_MENTAL_MODEL_ID:-microservice-resolution-runbook}"

# LLM provider settings for Hindsight (matches backend)
export HINDSIGHT_API_LLM_PROVIDER="${HINDSIGHT_LLM_PROVIDER:-groq}"
export HINDSIGHT_API_LLM_MODEL="${HINDSIGHT_LLM_MODEL:-openai/gpt-oss-120b}"
export HINDSIGHT_API_LLM_API_KEY="${HINDSIGHT_LLM_API_KEY:-${GROQ_API_KEY:-}}"
export HINDSIGHT_API_LLM_MAX_CONCURRENT="1"
export HINDSIGHT_API_ENABLE_OBSERVATIONS="true"
export HINDSIGHT_API_LLM_GROQ_SERVICE_TIER="on_demand"
# Embeddings and Reranker providers for Hindsight
# Configured for remote Google/Gemini embeddings and RRF reranking (lightweight, zero local neural models)
export HINDSIGHT_API_EMBEDDINGS_PROVIDER="${HINDSIGHT_API_EMBEDDINGS_PROVIDER:-google}"
export HINDSIGHT_API_EMBEDDINGS_GEMINI_MODEL="${HINDSIGHT_API_EMBEDDINGS_GEMINI_MODEL:-gemini-embedding-001}"
export HINDSIGHT_API_RERANKER_PROVIDER="${HINDSIGHT_API_RERANKER_PROVIDER:-rrf}"
export HINDSIGHT_API_MODEL_INIT_TIMEOUT="1200"

# Explicitly pass GEMINI_API_KEY to Hindsight's dedicated embedding key variable
if [ -n "${GEMINI_API_KEY:-}" ]; then
    export HINDSIGHT_API_EMBEDDINGS_GEMINI_API_KEY="${HINDSIGHT_API_EMBEDDINGS_GEMINI_API_KEY:-$GEMINI_API_KEY}"
fi

# External Database (Neon / Supabase Postgres with pgvector for persistent memory)
if [ -n "${DATABASE_URL:-}" ] && [ -z "${HINDSIGHT_API_DATABASE_URL:-}" ]; then
    export HINDSIGHT_API_DATABASE_URL="$DATABASE_URL"
fi

if [ -n "${HINDSIGHT_API_DATABASE_URL:-}" ]; then
    echo "[*] Using external persistent PostgreSQL (Neon) for Hindsight memory."
else
    echo "[!] Notice: HINDSIGHT_API_DATABASE_URL not set; using local embedded pg0."
fi

# 1. Start Hindsight in background
echo "[*] Launching Hindsight Vector Memory Service on port ${HINDSIGHT_PORT}..."
echo "[*] Hindsight Settings: Embeddings=${HINDSIGHT_API_EMBEDDINGS_PROVIDER} (model=${HINDSIGHT_API_EMBEDDINGS_GEMINI_MODEL}), Reranker=${HINDSIGHT_API_RERANKER_PROVIDER}"
hindsight-api --port "$HINDSIGHT_PORT" &
HINDSIGHT_PID=$!

# Trap signals to ensure Hindsight is cleaned up on exit
cleanup() {
    echo "[*] Shutting down Hindsight process (PID: $HINDSIGHT_PID)..."
    kill -TERM "$HINDSIGHT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 2. Wait for Hindsight readiness probe
echo "[*] Waiting for Hindsight to be ready at http://127.0.0.1:${HINDSIGHT_PORT}/health/live..."
READY=0
for i in $(seq 1 45); do
    if curl -sf "http://127.0.0.1:${HINDSIGHT_PORT}/health/live" >/dev/null 2>&1; then
        echo "[✓] Hindsight is ready!"
        READY=1
        break
    fi
    # Check if Hindsight process died prematurely
    if ! kill -0 "$HINDSIGHT_PID" 2>/dev/null; then
        echo "[!] CRITICAL ERROR: Hindsight process terminated unexpectedly during startup."
        exit 1
    fi
    sleep 1
done

if [ "$READY" -eq 0 ]; then
    echo "[!] CRITICAL ERROR: Hindsight readiness probe timed out after 45s. Refusing to start FastAPI."
    exit 1
fi

# 3. Initialize Hindsight structures (bank & mental model)
echo "[*] Initializing Hindsight bank and mental model..."
python scripts/init_hindsight.py || echo "[!] Notice: Initializer ran, continuing."

# 4. Start FastAPI backend (serving both API and frontend SPA)
echo "[*] Launching EpistemicOps FastAPI on port ${PORT}..."
cd /app/backend
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1
