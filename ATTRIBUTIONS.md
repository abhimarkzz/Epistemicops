# Attributions

This project uses the following open-source libraries and tools.

## Backend

| Package | Licence | URL |
|---|---|---|
| FastAPI | MIT | https://github.com/tiangolo/fastapi |
| Uvicorn | BSD-3-Clause | https://github.com/encode/uvicorn |
| LangGraph | MIT | https://github.com/langchain-ai/langgraph |
| langchain-ollama | MIT | https://github.com/langchain-ai/langchain |
| langchain-core | MIT | https://github.com/langchain-ai/langchain |
| sse-starlette | BSD-3-Clause | https://github.com/sysid/sse-starlette |
| httpx | BSD-3-Clause | https://github.com/encode/httpx |
| pydantic | MIT | https://github.com/pydantic/pydantic |
| python-dotenv | BSD-3-Clause | https://github.com/theskumar/python-dotenv |

## Frontend

| Package | Licence | URL |
|---|---|---|
| React | MIT | https://github.com/facebook/react |
| Vite | MIT | https://github.com/vitejs/vite |
| TypeScript | Apache-2.0 | https://github.com/microsoft/TypeScript |

## AI inference

| Tool | Licence | URL |
|---|---|---|
| Ollama | MIT | https://github.com/ollama/ollama |
| Qwen3 8B | Qwen Research Licence | https://huggingface.co/Qwen/Qwen3-8B |

## Memory

| Tool | Licence | URL |
|---|---|---|
| Hindsight | Commercial / Community — see https://hindsight.dev | |

## Incident fixture datasets

The incident fixtures in `data/incidents/inc-003` through `inc-005` are derived
from the following dataset.

### quantranger/sre-agent-eda-bundle

| Field | Value |
|---|---|
| Dataset URL | https://huggingface.co/datasets/quantranger/sre-agent-eda-bundle |
| License | Apache-2.0 |
| Config used | `corpus` |
| Records used | `011-bad_deploy_errors`, `015-stuck_rollout`, `009-cache_stampede` |
| Fixture files | `inc-003-bad-deploy-orders.json`, `inc-004-stuck-rollout-shipping.json`, `inc-005-cache-stampede-catalog.json` |

**What was taken:** Structured evidence blobs (pod status, events, logs, metrics,
alerts, and — for `009-cache_stampede` — distributed traces) from three synthetic
Kubernetes incident scenarios.  Alert titles, log lines, and metric values are
reproduced from the source; adversarial signal annotations and model trajectories
are not included.

**What was derived:** The `_ground_truth` blocks (root cause summary, resolution
steps, expected evidence keywords) were written by the EpistemicOps authors
based on the source record's `answer` and `remediation` fields but are not a
verbatim copy.

**Why these records:** All three are synthetic, use a consistent Kubernetes
evidence schema (pods, events, logs, metrics, alerts), and two share the same
failure category (`bad_deploy`), which is needed to demonstrate memory-assisted
reuse between a cold and a warm incident investigation.

### Snaseem2026/devops-incident-response

| Field | Value |
|---|---|
| Dataset URL | https://huggingface.co/datasets/Snaseem2026/devops-incident-response |
| License | Not declared |
| Records used | None |

This dataset was inspected to understand its schema.  No records were normalized
into EpistemicOps fixtures because:
- Evidence is prose only (no structured pod status, metrics dict, or trace objects).
- No explicit license is declared on HuggingFace.

---

All licences are reproduced in their entirety in the respective package distributions.
