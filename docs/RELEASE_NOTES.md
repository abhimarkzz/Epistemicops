# Release Notes — EpistemicOps v0.1.0

> **Status:** Release candidate prepared in repository; GitHub release intentionally not published yet pending maintainer review.

---

## Overview

EpistemicOps v0.1.0 is the initial public demonstration release of an autonomous SRE incident-response agent that integrates **Vectorize Hindsight** as a persistent operational memory layer.

Unlike stateless agents that start from scratch on every alert, EpistemicOps retains structured postmortems upon incident resolution, updates an evolving **Microservice Resolution Runbook**, and semantically recalls past fixes when related failure signatures fire.

---

## Major Capabilities

1. **Bounded LangGraph State Machine:**
   - Acyclic 7-node DAG (`load_incident` → `query_memory` → `investigate` → `analyze` → `validate` → `produce_result` → `retain_postmortem` → `END`) guaranteeing deterministic termination without infinite reasoning loops.
   - Defensive recursion limit (`recursion_limit=8`) and timeout bounds on LLM calls.
2. **Vectorize Hindsight Integration:**
   - Semantic vector recall (`client.arecall`) achieving sub-100ms prior pattern retrieval without consuming upstream LLM tokens.
   - Non-blocking asynchronous retention (`client.aretain`) with automated log scrubbing.
   - Dynamic Mental Model runbook (`microservice-resolution-runbook`) with delta trigger consolidation.
3. **Local ONNX Embedding Engine:**
   - In-process `intfloat/multilingual-e5-small` embeddings (384 dimensions) and Reciprocal Rank Fusion (`rrf`) reranking, eliminating external embedding API dependencies and costs.
4. **Neon PostgreSQL Cloud Persistence:**
   - Native integration with serverless Neon PostgreSQL (`pgvector`) allowing vector memories and runbooks to survive container restarts and platform re-deployments.
5. **Interactive 3D Command Center:**
   - React 18 single-page application with Three.js / React Three Fiber epistemic graph visualization.
   - Real-time Server-Sent Events (SSE) investigation tracing.
   - Memory governance approval interface and side-by-side cold/warm comparison viewer.
6. **Scientific Baseline Mode:**
   - Experimental control mode (`?baseline=true`) that bypasses Hindsight to enable objective side-by-side comparisons of memory-assisted vs. unassisted performance on the exact same incident.
7. **Comprehensive Automated Verification:**
   - 152 backend pytest tests and 9 frontend vitest tests covering graph transitions, fixture sanitization, memory service wrappers, and UI state synchronization.

---

## Known Limitations

- **Simulated Fixture Telemetry:** Incident evidence is provided by deterministic Kubernetes JSON fixtures (`data/incidents/`) rather than live cluster streaming pipelines.
- **Evaluator Heuristics:** Ground-truth scoring uses deterministic substring and keyword matching rather than an opaque semantic AI judge.
- **Free-Tier Consolidation Quotas:** Under high-volume memory retention on the free Groq LLM tier, background consolidation can encounter tokens-per-minute delays; vector recall operates independently and is unaffected.
- **Experimental Status:** This project is an engineering prototype demonstrating agent memory architectures. It is not intended for unsupervised, direct-execution production infrastructure management.

---

## Deployment Notes

- **Containerized Deployment:** Packaged via multi-stage `Dockerfile` and automated `start.sh` entrypoint.
- **Supported Zero-Cost Hosts:** Fully tested on Render Free Web Service with Neon Serverless PostgreSQL ($0 recurring cost, zero credit card required).
- **Public Demo Endpoint:** [https://epistemicops.onrender.com](https://epistemicops.onrender.com)
