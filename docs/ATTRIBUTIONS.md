# Third-Party Attributions & Open-Source Licenses

This document acknowledges all third-party software, models, datasets, and libraries utilized by EpistemicOps. All licenses and terms are verified from repository dependencies.

---

## Software Libraries & Dependencies

| Source | URL | License | How used | Modification/derivation |
|---|---|---|---|---|
| **LangGraph** | https://github.com/langchain-ai/langgraph | MIT | Core state machine agent engine | Unmodified library dependency (`langgraph>=0.2.60`) |
| **LangChain Core** | https://github.com/langchain-ai/langchain | MIT | Prompt templates, message schemas, and base abstractions | Unmodified library dependency (`langchain-core>=0.3.0`) |
| **langchain-groq** | https://github.com/langchain-ai/langchain-groq | MIT | Groq API chat model wrapper for LLM diagnosis | Unmodified library dependency (`langchain-groq>=0.2.0`) |
| **Hindsight Client** | https://github.com/vectorize-io/hindsight | Apache-2.0 | Async client SDK for vector recall and retention | Unmodified library dependency (`hindsight-client`) |
| **Hindsight API Slim** | https://github.com/vectorize-io/hindsight | Apache-2.0 | Native Hindsight daemon engine with embedded db | Unmodified package (`hindsight-api-slim[embedded-db,local-onnx]==0.10.1`) |
| **FastAPI** | https://github.com/tiangolo/fastapi | MIT | Backend HTTP REST and SSE streaming framework | Unmodified framework dependency (`fastapi>=0.115.0`) |
| **Uvicorn** | https://github.com/encode/uvicorn | BSD-3-Clause | ASGI server running FastAPI application | Unmodified server dependency (`uvicorn[standard]>=0.30.0`) |
| **Pydantic** | https://github.com/pydantic/pydantic | MIT | Data validation and schema serialization | Unmodified dependency (`pydantic>=2.8.0`, `pydantic-settings>=2.4.0`) |
| **HTTPX** | https://github.com/encode/httpx | BSD-3-Clause | Async HTTP client for Hindsight and external probes | Unmodified dependency (`httpx>=0.27.0`) |
| **sse-starlette** | https://github.com/sysid/sse-starlette | BSD-3-Clause | Server-Sent Events generator for real-time trace streaming | Unmodified dependency (`sse-starlette>=2.1.3`) |
| **pytest & pytest-asyncio** | https://github.com/pytest-dev/pytest | MIT | Backend test suite execution | Unmodified testing framework (`pytest>=8.3.0`) |
| **React & React DOM** | https://github.com/facebook/react | MIT | Frontend declarative UI framework | Unmodified web framework (`react@^18.3.1`) |
| **TypeScript** | https://github.com/microsoft/TypeScript | Apache-2.0 | Static typing for frontend codebase | Unmodified compiler dependency (`typescript@~5.5.3`) |
| **Vite** | https://github.com/vitejs/vite | MIT | Frontend development server and production bundler | Unmodified bundler (`vite@^5.4.2`) |
| **Three.js** | https://github.com/mrdoob/three.js | MIT | 3D WebGL rendering engine for epistemic topology graph | Unmodified 3D library (`three@^0.170.0`) |
| **@react-three/fiber** | https://github.com/pmndrs/react-three-fiber | MIT | React reconciler for Three.js scenes | Unmodified component library (`@react-three/fiber@^8.17.10`) |
| **@react-three/drei** | https://github.com/pmndrs/drei | MIT | Three.js helpers and camera controls | Unmodified helper library (`@react-three/drei@^9.117.0`) |
| **Motion** | https://github.com/motiondivision/motion | MIT | Motion and micro-interaction animations | Unmodified library (`motion@^11.11.17`) |
| **Vitest** | https://github.com/vitest-dev/vitest | MIT | Frontend unit testing framework | Unmodified test framework (`vitest@^2.1.8`) |

---

## Pre-trained Models

| Source | URL | License | How used | Modification/derivation |
|---|---|---|---|---|
| **multilingual-e5-small (ONNX)** | https://huggingface.co/intfloat/multilingual-e5-small | MIT | Local in-process embedding vector generation (384 dimensions) | Downloaded official ONNX weights and tokenizer; no architectural alterations |
| **openai/gpt-oss-120b (via Groq)** | https://console.groq.com | Terms of Service / Model License | Free-tier LLM inference for SRE diagnosis | Remote API inference |
| **gemini-3.8-flash (via Google)** | https://ai.google.dev | Google Cloud Terms of Service | Optional LLM provider for diagnostic reasoning | Remote API inference |

---

## Datasets & Telemetry Fixtures

| Source | URL | License | How used | Modification/derivation |
|---|---|---|---|---|
| **quantranger/sre-agent-eda-bundle** | https://huggingface.co/datasets/quantranger/sre-agent-eda-bundle | Apache-2.0 | Baseline incident telemetry for `inc-003`, `inc-004`, and `inc-005` | Extracted Kubernetes telemetry evidence (logs, metrics, trace spans, pod states). Ground truth scoring blocks (`_ground_truth`) were author-created and synthesized from problem descriptions. |
