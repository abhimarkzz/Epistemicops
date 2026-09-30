# ==============================================================================
# EpistemicOps — Production Multi-Stage Dockerfile
# Optimized for $0 No-Credit-Card Hosting (Render, Hugging Face Spaces, or any Docker host)
# Default Port: 8000 (Render default)
# ==============================================================================

# ── Stage 1: Build Frontend (React + Vite + Three.js) ─────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production Python Runtime ─────────────────────────────────────────
FROM python:3.11-slim AS runtime

# Install system dependencies needed by native Hindsight, ONNX, and PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    build-essential \
    libpq-dev \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Run as non-root user (UID 1000 standard for container security)
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    LLM_PROVIDER=groq \
    HINDSIGHT_API_EMBEDDINGS_PROVIDER=onnx \
    HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID=intfloat/multilingual-e5-small \
    HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_PATH=/app/models/multilingual-e5-small/onnx/model.onnx \
    HINDSIGHT_API_EMBEDDINGS_ONNX_TOKENIZER_NAME_OR_PATH=/app/models/multilingual-e5-small \
    HINDSIGHT_API_EMBEDDINGS_ONNX_FILE=onnx/model.onnx \
    HINDSIGHT_API_EMBEDDINGS_ONNX_DIMENSIONS=384 \
    HINDSIGHT_API_EMBEDDINGS_ONNX_QUERY_PREFIX="query: " \
    HINDSIGHT_API_EMBEDDINGS_ONNX_PASSAGE_PREFIX="passage: " \
    HINDSIGHT_API_EMBEDDINGS_ONNX_BATCH_SIZE=8 \
    HINDSIGHT_API_EMBEDDINGS_ONNX_CPU_MEM_ARENA=false \
    HINDSIGHT_API_RERANKER_PROVIDER=rrf

WORKDIR /app

# Install Python dependencies (explicitly pinned Hindsight version with local-onnx)
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --default-timeout=100 --no-cache-dir -r /app/backend/requirements.txt && \
    pip install --default-timeout=100 --no-cache-dir 'hindsight-api-slim[embedded-db,local-onnx]==0.10.1' psycopg2-binary

# Pre-cache the ONNX embedding model and tokenizer during Docker build to eliminate cold-start download delays
RUN mkdir -p /app/models/multilingual-e5-small && \
    python -c "from huggingface_hub import snapshot_download; snapshot_download('intfloat/multilingual-e5-small', local_dir='/app/models/multilingual-e5-small', allow_patterns=['onnx/model.onnx', 'onnx/model.onnx_data', '*.json', '*.txt', '*.model'])"

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

# Copy application code
COPY backend/ /app/backend/
COPY data/ /app/data/
COPY scripts/ /app/scripts/
COPY start.sh /app/start.sh
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Set permissions
RUN chmod +x /app/start.sh && \
    mkdir -p /home/user/.hindsight /home/user/.cache && \
    chown -R user:user /app /home/user

USER user

EXPOSE 8000 7860

CMD ["bash", "/app/start.sh"]
