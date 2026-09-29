# ==============================================================================
# EpistemicOps — Production Multi-Stage Dockerfile
# Optimized for $0 No-Credit-Card Hosting (Hugging Face Spaces, Render, or any Docker host)
# Default Port: 7860 (Hugging Face Spaces standard)
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

# Hugging Face Spaces requires running as user with UID 1000
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    HINDSIGHT_API_EMBEDDINGS_PROVIDER=onnx \
    HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID=intfloat/multilingual-e5-small \
    HINDSIGHT_API_EMBEDDINGS_ONNX_FILE=onnx/model.onnx \
    HINDSIGHT_API_EMBEDDINGS_ONNX_DIMENSIONS=384 \
    HINDSIGHT_API_EMBEDDINGS_ONNX_QUERY_PREFIX="query: " \
    HINDSIGHT_API_EMBEDDINGS_ONNX_PASSAGE_PREFIX="passage: " \
    HINDSIGHT_API_EMBEDDINGS_ONNX_BATCH_SIZE=8 \
    HINDSIGHT_API_EMBEDDINGS_ONNX_CPU_MEM_ARENA=false \
    HINDSIGHT_API_RERANKER_PROVIDER=rrf

WORKDIR /app

# Install Python dependencies as user (explicitly pinned Hindsight version with local-onnx)
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/backend/requirements.txt && \
    pip install --no-cache-dir 'hindsight-api-slim[embedded-db,local-onnx]==0.10.1' psycopg2-binary

# Copy application code
COPY backend/ /app/backend/
COPY data/ /app/data/
COPY scripts/ /app/scripts/
COPY start.sh /app/start.sh
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Set permissions
RUN chmod +x /app/start.sh && \
    mkdir -p /home/user/.hindsight && \
    chown -R user:user /app /home/user

USER user

EXPOSE 7860

CMD ["bash", "/app/start.sh"]
