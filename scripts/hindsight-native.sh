#!/usr/bin/env bash
#
# Start Hindsight natively (no Docker) for EpistemicOps.
#
# macOS / Linux note: the project uses the slim build with the in-process ONNX embedding
# backend and reciprocal rank fusion (RRF) reranking (no torch / sentence-transformers / external rerankers):
#   python3.11+ -m venv .venv-hindsight
#   .venv-hindsight/bin/pip install 'hindsight-api-slim[local-onnx,embedded-db]'
# See docs/DEPLOYMENT.md.
#
# Data lives in the embedded PostgreSQL (pg0) under ~/.hindsight/data and persists
# across restarts (or Neon PostgreSQL if HINDSIGHT_API_DATABASE_URL is set).
# The LLM key is read from backend/.env and never hardcoded.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv-hindsight"
PORT="${HINDSIGHT_PORT:-8888}"

if [ ! -x "$VENV/bin/hindsight-api" ]; then
  echo "hindsight-api not found in $VENV. Install it first:"
  echo "  python3.11+ -m venv .venv-hindsight"
  echo "  .venv-hindsight/bin/pip install 'hindsight-api-slim[local-onnx,embedded-db]'"
  exit 1
fi

# Load only the LLM keys from backend/.env (never printed).
if [ -f "$ROOT/backend/.env" ]; then
  GROQ_API_KEY="$(grep -E '^GROQ_API_KEY=' "$ROOT/backend/.env" | head -1 | cut -d= -f2-)"
  GEMINI_API_KEY="$(grep -E '^GEMINI_API_KEY=' "$ROOT/backend/.env" | head -1 | cut -d= -f2-)"
  export GROQ_API_KEY GEMINI_API_KEY
fi

# ── LLM (same provider as before; Groq free tier by default) ──────────────────
export HINDSIGHT_API_LLM_PROVIDER="${HINDSIGHT_LLM_PROVIDER:-groq}"
export HINDSIGHT_API_LLM_MODEL="${HINDSIGHT_LLM_MODEL:-openai/gpt-oss-120b}"
export HINDSIGHT_API_LLM_API_KEY="${HINDSIGHT_LLM_API_KEY:-${GROQ_API_KEY:-}}"
export HINDSIGHT_API_LLM_MAX_CONCURRENT="1"
export HINDSIGHT_API_ENABLE_OBSERVATIONS="true"
# Groq free tier rejects service_tier=auto; on_demand is the free-compatible tier.
export HINDSIGHT_API_LLM_GROQ_SERVICE_TIER="${HINDSIGHT_LLM_GROQ_SERVICE_TIER:-on_demand}"

# ── Local, torch-free embedding + reranker (Intel-Mac compatible) ─────────────
export HINDSIGHT_API_EMBEDDINGS_PROVIDER="onnx"
export HINDSIGHT_API_RERANKER_PROVIDER="rrf"
# First run downloads a small ONNX embedding model; allow time for it.
export HINDSIGHT_API_MODEL_INIT_TIMEOUT="${HINDSIGHT_API_MODEL_INIT_TIMEOUT:-1200}"

echo "Starting native Hindsight on http://localhost:$PORT (provider=$HINDSIGHT_API_LLM_PROVIDER, embeddings=onnx, reranker=rrf, data in ~/.hindsight/data)"
exec "$VENV/bin/hindsight-api" --port "$PORT"
