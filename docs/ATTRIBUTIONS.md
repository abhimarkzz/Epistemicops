# EpistemicOps — Attributions

This project uses the following open-source libraries, tools, and datasets.

## Backend Dependencies

| Package | Licence | URL |
|---|---|---|
| FastAPI | MIT | https://github.com/tiangolo/fastapi |
| Uvicorn | BSD-3-Clause | https://github.com/encode/uvicorn |
| LangGraph | MIT | https://github.com/langchain-ai/langgraph |
| langchain-google-genai | MIT | https://github.com/langchain-ai/langchain-google |
| langchain-groq | MIT | https://github.com/langchain-ai/langchain |
| langchain-core | MIT | https://github.com/langchain-ai/langchain |
| sse-starlette | BSD-3-Clause | https://github.com/sysid/sse-starlette |
| httpx | BSD-3-Clause | https://github.com/encode/httpx |
| pydantic | MIT | https://github.com/pydantic/pydantic |
| pydantic-settings | MIT | https://github.com/pydantic/pydantic-settings |
| python-dotenv | BSD-3-Clause | https://github.com/theskumar/python-dotenv |
| hindsight-client | See below | https://github.com/vectorize-io/hindsight |

## Frontend Dependencies

| Package | Licence | URL |
|---|---|---|
| React | MIT | https://github.com/facebook/react |
| Vite | MIT | https://github.com/vitejs/vite |
| TypeScript | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Three.js | MIT | https://github.com/mrdoob/three.js |
| @react-three/fiber | MIT | https://github.com/pmndrs/react-three-fiber |
| @react-three/drei | MIT | https://github.com/pmndrs/drei |
| Motion | MIT | https://github.com/motiondivision/motion |

## AI Inference

| Tool | Terms | URL |
|---|---|---|
| Google Gemini API | Google Terms of Service | https://ai.google.dev |
| Groq API | Groq Terms of Service | https://console.groq.com |

## Memory

| Tool | Terms | URL |
|---|---|---|
| Hindsight | See [Hindsight repository](https://github.com/vectorize-io/hindsight) | https://hindsight.vectorize.io/ |
| Vectorize | See [Vectorize](https://vectorize.io) | https://vectorize.io/what-is-agent-memory |

## Incident Fixture Datasets

The incident fixtures in `data/incidents/` are derived from the following sources.

### inc-001 and inc-002

Hand-crafted synthetic incidents (database pool exhaustion, memory leak) written by the EpistemicOps authors. No external dataset used.

### inc-003, inc-004, inc-005

Derived from the **quantranger/sre-agent-eda-bundle** dataset.

| Field | Value |
|---|---|
| Dataset URL | https://huggingface.co/datasets/quantranger/sre-agent-eda-bundle |
| License | Apache-2.0 |
| Config used | `corpus` |
| Records used | `011-bad_deploy_errors`, `015-stuck_rollout`, `009-cache_stampede` |
| Fixture files | `inc-003-bad-deploy-orders.json`, `inc-004-stuck-rollout-shipping.json`, `inc-005-cache-stampede-catalog.json` |

**What was taken:** Structured evidence blobs (pod status, events, logs, metrics, alerts, and distributed traces) from three synthetic Kubernetes incident scenarios. Alert titles, log lines, and metric values are reproduced from the source.

**What was derived:** The `_ground_truth` blocks (root cause summary, resolution steps, expected evidence keywords) were written by the EpistemicOps authors based on the source record's `answer` and `remediation` fields but are not a verbatim copy.

**Why these records:** All three are synthetic, use a consistent Kubernetes evidence schema, and two share the same failure category (`bad_deploy`), which is needed to demonstrate memory-assisted reuse between cold and warm incident investigations.

### Snaseem2026/devops-incident-response

| Field | Value |
|---|---|
| Dataset URL | https://huggingface.co/datasets/Snaseem2026/devops-incident-response |
| License | Not declared |
| Records used | None |

This dataset was inspected to understand its schema. No records were normalized into EpistemicOps fixtures because evidence is prose-only (no structured evidence) and no explicit license is declared.

---

All licences are reproduced in their entirety in the respective package distributions.
