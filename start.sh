#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " Starting EpistemicOps Production Stack on Port ${PORT:-8000}"
echo "=========================================================="

export PORT="${PORT:-8000}"
export HINDSIGHT_PORT="${HINDSIGHT_PORT:-8888}"
export HINDSIGHT_BASE_URL="http://127.0.0.1:${HINDSIGHT_PORT}"
export HINDSIGHT_BANK_ID="${HINDSIGHT_BANK_ID:-epistemic-sre}"
export HINDSIGHT_MENTAL_MODEL_ID="${HINDSIGHT_MENTAL_MODEL_ID:-microservice-resolution-runbook}"

# LLM provider settings for Hindsight (matches backend)
export LLM_PROVIDER="${LLM_PROVIDER:-groq}"
export HINDSIGHT_API_LLM_PROVIDER="${HINDSIGHT_LLM_PROVIDER:-groq}"
export HINDSIGHT_API_LLM_MODEL="${HINDSIGHT_LLM_MODEL:-openai/gpt-oss-120b}"
export HINDSIGHT_API_LLM_API_KEY="${HINDSIGHT_LLM_API_KEY:-${GROQ_API_KEY:-}}"
export HINDSIGHT_API_LLM_GROQ_API_KEY="${HINDSIGHT_LLM_API_KEY:-${GROQ_API_KEY:-}}"
export HINDSIGHT_API_LLM_MAX_CONCURRENT="1"
export HINDSIGHT_API_ENABLE_OBSERVATIONS="true"
export HINDSIGHT_API_LLM_GROQ_SERVICE_TIER="on_demand"

# Embeddings and Reranker providers for Hindsight
# Configured for local ONNX multilingual-e5-small embeddings and RRF reranking (no external embedding API)
export HINDSIGHT_API_EMBEDDINGS_PROVIDER="onnx"
export HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID="intfloat/multilingual-e5-small"
export HINDSIGHT_API_EMBEDDINGS_ONNX_FILE="onnx/model.onnx"
export HINDSIGHT_API_EMBEDDINGS_ONNX_DIMENSIONS="384"
export HINDSIGHT_API_EMBEDDINGS_ONNX_QUERY_PREFIX="query: "
export HINDSIGHT_API_EMBEDDINGS_ONNX_PASSAGE_PREFIX="passage: "
export HINDSIGHT_API_EMBEDDINGS_ONNX_BATCH_SIZE="${HINDSIGHT_API_EMBEDDINGS_ONNX_BATCH_SIZE:-8}"
export HINDSIGHT_API_EMBEDDINGS_ONNX_CPU_MEM_ARENA="${HINDSIGHT_API_EMBEDDINGS_ONNX_CPU_MEM_ARENA:-false}"

export HINDSIGHT_API_RERANKER_PROVIDER="rrf"
export HINDSIGHT_API_MODEL_INIT_TIMEOUT="1200"

# Model and Tokenizer local artifact paths
LOCAL_MODEL_DIR="/app/models/multilingual-e5-small"
if [ -f "${LOCAL_MODEL_DIR}/onnx/model.onnx" ]; then
    export HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_PATH="${LOCAL_MODEL_DIR}/onnx/model.onnx"
    export HINDSIGHT_API_EMBEDDINGS_ONNX_TOKENIZER_NAME_OR_PATH="${LOCAL_MODEL_DIR}"
    export HF_HUB_OFFLINE=1
    export TRANSFORMERS_OFFLINE=1
    echo "[HINDSIGHT] using pre-cached ONNX model at ${HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_PATH}"
else
    # Fallback to HuggingFace hub cache if present
    HF_CACHE_DIR="${HF_HOME:-/home/user/.cache/huggingface}/hub/models--intfloat--multilingual-e5-small/snapshots"
    SNAPSHOT_DIR=$(find "$HF_CACHE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -n 1)
    if [ -n "$SNAPSHOT_DIR" ] && [ -f "${SNAPSHOT_DIR}/onnx/model.onnx" ]; then
        export HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_PATH="${SNAPSHOT_DIR}/onnx/model.onnx"
        export HINDSIGHT_API_EMBEDDINGS_ONNX_TOKENIZER_NAME_OR_PATH="${SNAPSHOT_DIR}"
        export HF_HUB_OFFLINE=1
        export TRANSFORMERS_OFFLINE=1
        echo "[HINDSIGHT] using hub-cached ONNX model at ${HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_PATH}"
    else
        echo "[HINDSIGHT] pre-cached model not found; will download if online."
    fi
fi

# External Database (Neon / Supabase Postgres with pgvector for persistent memory)
if [ -n "${DATABASE_URL:-}" ] && [ -z "${HINDSIGHT_API_DATABASE_URL:-}" ]; then
    export HINDSIGHT_API_DATABASE_URL="$DATABASE_URL"
fi

if [ -n "${HINDSIGHT_API_DATABASE_URL:-}" ]; then
    echo "[HINDSIGHT] using external persistent PostgreSQL (Neon) for Hindsight memory."
    # Verify or adjust database vector schema dimension before startup
    python scripts/verify_db_schema.py || echo "[HINDSIGHT][WARNING] schema verification script exited with error, continuing."
else
    echo "[HINDSIGHT] HINDSIGHT_API_DATABASE_URL not set; using local embedded pg0."
fi

# 1. Start Hindsight in background
echo "[HINDSIGHT] process starting on port ${HINDSIGHT_PORT}..."
echo "[HINDSIGHT] settings: Embeddings=${HINDSIGHT_API_EMBEDDINGS_PROVIDER} (model=${HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID}, dim=${HINDSIGHT_API_EMBEDDINGS_ONNX_DIMENSIONS}), Reranker=${HINDSIGHT_API_RERANKER_PROVIDER}"
hindsight-api --port "$HINDSIGHT_PORT" > >(tee /tmp/hindsight.log) 2>&1 &
HINDSIGHT_PID=$!
echo "[HINDSIGHT] process started pid=${HINDSIGHT_PID}"

# Trap signals to ensure Hindsight is cleaned up on exit
cleanup() {
    echo "[*] Cleaning up child processes..."
    if kill -0 "$HINDSIGHT_PID" 2>/dev/null; then
        echo "[HINDSIGHT] terminating child process pid=${HINDSIGHT_PID}..."
        kill -TERM "$HINDSIGHT_PID" 2>/dev/null || true
        wait "$HINDSIGHT_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# 2. Wait for Hindsight liveness and readiness
echo "[HINDSIGHT] waiting for TCP :${HINDSIGHT_PORT}..."
TIMEOUT_SECONDS=120
POLL_INTERVAL=2
MAX_ATTEMPTS=$((TIMEOUT_SECONDS / POLL_INTERVAL))

LIVE_OK=0
READY_OK=0
LIVE_STATUS="000"
READY_STATUS="000"
LIVE_BODY=""
READY_BODY=""

for i in $(seq 1 "$MAX_ATTEMPTS"); do
    ELAPSED=$((i * POLL_INTERVAL))

    # Check if Hindsight process died unexpectedly
    if ! kill -0 "$HINDSIGHT_PID" 2>/dev/null; then
        echo "[HINDSIGHT][ERROR] child process terminated unexpectedly during startup."
        echo "[HINDSIGHT][ERROR] liveness status=${LIVE_STATUS} body=${LIVE_BODY}"
        echo "[HINDSIGHT][ERROR] readiness status=${READY_STATUS} body=${READY_BODY}"
        echo "[HINDSIGHT][ERROR] child process status=dead"
        echo "[HINDSIGHT][ERROR] last log stage:"
        tail -n 25 /tmp/hindsight.log 2>/dev/null || true
        exit 1
    fi

    # Phase A: Wait for /health/live
    if [ "$LIVE_OK" -eq 0 ]; then
        LIVE_STATUS=$(curl -s -o /tmp/hindsight_live.json -w "%{http_code}" "http://127.0.0.1:${HINDSIGHT_PORT}/health/live" 2>/dev/null || true)
        LIVE_STATUS="${LIVE_STATUS:-000}"
        LIVE_BODY=$(cat /tmp/hindsight_live.json 2>/dev/null || echo "")
        if [ "$LIVE_STATUS" = "200" ]; then
            echo "[HINDSIGHT] /health/live -> 200"
            LIVE_OK=1
        else
            echo "[HINDSIGHT] waiting for liveness (${ELAPSED}s / ${TIMEOUT_SECONDS}s) status=${LIVE_STATUS}..."
        fi
    fi

    # Phase B: Once alive, wait for /health/ready (database readiness)
    if [ "$LIVE_OK" -eq 1 ]; then
        READY_STATUS=$(curl -s -o /tmp/hindsight_ready.json -w "%{http_code}" "http://127.0.0.1:${HINDSIGHT_PORT}/health/ready" 2>/dev/null || true)
        READY_STATUS="${READY_STATUS:-000}"
        READY_BODY=$(cat /tmp/hindsight_ready.json 2>/dev/null || echo "")
        if [ "$READY_STATUS" = "200" ]; then
            echo "[HINDSIGHT] /health/ready -> 200"
            echo "[HINDSIGHT] database ready"
            echo "[HINDSIGHT] startup complete"
            READY_OK=1
            break
        else
            echo "[HINDSIGHT] waiting for database readiness (${ELAPSED}s / ${TIMEOUT_SECONDS}s) status=${READY_STATUS} body=${READY_BODY}..."
        fi
    fi

    sleep "$POLL_INTERVAL"
done

if [ "$READY_OK" -eq 0 ]; then
    echo "[HINDSIGHT][ERROR] Readiness probe timed out after ${TIMEOUT_SECONDS}s. Refusing to start FastAPI."
    echo "[HINDSIGHT][ERROR] liveness status=${LIVE_STATUS} body=${LIVE_BODY}"
    echo "[HINDSIGHT][ERROR] readiness status=${READY_STATUS} body=${READY_BODY}"
    if kill -0 "$HINDSIGHT_PID" 2>/dev/null; then
        echo "[HINDSIGHT][ERROR] child process status=alive (pid=${HINDSIGHT_PID})"
    else
        echo "[HINDSIGHT][ERROR] child process status=dead"
    fi
    echo "[HINDSIGHT][ERROR] last log stage:"
    tail -n 30 /tmp/hindsight.log 2>/dev/null || true
    exit 1
fi

# 3. Initialize Hindsight structures (bank & mental model)
echo "[*] Initializing Hindsight bank and mental model..."
python scripts/init_hindsight.py || echo "[!] Notice: Initializer ran, continuing."

# 4. Start FastAPI backend (serving both API and frontend SPA)
echo "[FASTAPI] starting on 0.0.0.0:${PORT}..."
cd /app/backend
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1
