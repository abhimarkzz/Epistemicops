# Changelog

All notable changes to EpistemicOps will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Real telemetry connectors for Prometheus and Loki behind the existing read-only tool interface.
- Multi-incident batch evaluation scripts.

---

## [0.1.0] - 2026-09-30

### Added
- **LangGraph Investigation Engine:** Bounded acyclic state machine orchestrating incident loading, memory querying, read-only evidence gathering, and root-cause synthesis.
- **Vectorize Hindsight Memory Integration:**
  - Semantic vector recall (`arecall`) delivering sub-100ms pattern retrieval without LLM token consumption.
  - Asynchronous postmortem retention (`aretain`) with automatic log scrubbing.
  - Microservice Resolution Runbook mental model consolidating cross-incident failure playbooks.
- **Local ONNX Embedding Subsystem:** In-process `intfloat/multilingual-e5-small` embeddings and reciprocal rank fusion (`rrf`) eliminating external embedding API dependencies.
- **Neon Serverless PostgreSQL Support:** Persistent cloud vector storage with `pgvector` preserving memories across container restarts.
- **3D Command Center UI:** React 18 single-page application featuring an interactive Three.js epistemic topology graph, live SSE investigation timeline, runbook viewer, and cold/warm comparison modal.
- **Governance & Baseline Testing:**
  - Human-in-the-loop postmortem approval workflow.
  - Baseline mode (`?baseline=true`) serving as a memory-off experimental control.
  - Deterministic replay Demo mode (`?demo=true`) for reliable offline presentations.
- **Testing & Verification:** Comprehensive test suite with 152 backend pytest tests and 9 frontend vitest tests.
- **Production Containerization:** Multi-stage `Dockerfile` and automated `start.sh` orchestration script supporting zero-credit-card deployment on Render.
