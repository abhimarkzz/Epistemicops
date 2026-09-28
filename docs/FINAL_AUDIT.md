# EpistemicOps — Final Acceptance Audit

> This document describes the **current** repository and runtime state only. All post-audit
> remediation has been folded into the status below; there are no "before/after" contradictions.

## 1. Audit date

- **Date:** 2026-09-28
- **Method:** source inspection + live runtime checks + full test execution. Gemini generation was probed exactly once (single token) to establish access status; no quota was spent on retries.

## 2. Current repository state

- Branch: `main` (1 commit; substantial uncommitted working tree from the Gemini migration + remediation).
- `.env` files (`backend/.env`, `frontend/.env`) are gitignored and untracked — no secret is in git.
- Backend tests: **137 passing**. Frontend: builds clean.
- Hindsight: running, bank `epistemic-sre`, **1** mental model, **5** memories, 2 postmortems.

## 3. Actual architecture

```
React 18 + TypeScript + Vite 5 (5173, host 0.0.0.0, strictPort)
        │  relative /api and /health → Vite dev proxy
        ▼
FastAPI (8000, uvicorn) ──SSE──► browser
        ├── FixtureService  ← data/incidents/*.json (+ _ground_truth, hidden)
        ├── LangGraph StateGraph (acyclic, recursion_limit = MAX_AGENT_STEPS):
        │      load_incident → query_memory → investigate → analyze →
        │      validate → produce_result → retain_postmortem → END
        │      (any node error → error_end → END)
        ├── Gemini API (gemini-3.8-flash) — analyze node only
        └── MemoryService → Hindsight REST (8888 API / 9999 UI)
                                   └── Gemini API (gemini-3.8-flash) for
                                       reflect / consolidation / mental model
Hindsight → embedded Postgres volume (hindsight_data)
```

No extra layers, brokers, or custom datastores. Both the agent and Hindsight use **`gemini-3.8-flash`** (single model; no lite split).

## 4. Current technology stack

| Layer | Technology | Version (installed) |
|---|---|---|
| Frontend | React + TypeScript + Vite | 18.3 / 5.5 / 5.4 |
| Backend | Python + FastAPI + Uvicorn | 0.141 / 0.54 |
| Agent | LangGraph | 1.2.12 |
| LLM binding | langchain-google-genai → google-genai | 4.4.0 → 2.25.0 |
| Model | gemini-3.8-flash | — |
| Memory | Hindsight (Docker) | 0.10.1 |
| Streaming | sse-starlette | 3.4.11 |

## 5. Requirement completion

Legend: ✅ COMPLETE · 🟡 PARTIAL · ❌ MISSING · ⛔ EXCLUDED · 🟠 RATE-LIMITED (Gemini-access-blocked)

**Tally (291 requirements):**

| Status | Count |
|---|---|
| ✅ COMPLETE | 280 |
| 🟡 PARTIAL | 2 |
| 🟠 RATE-LIMITED | 8 |
| ⛔ EXCLUDED | 1 |
| ❌ MISSING | 0 |

- **🟡 PARTIAL (2):** 226 / 287 — CORS is a single allowed origin (`http://localhost:5173`); `127.0.0.1` is served via the Vite dev proxy rather than a second CORS entry. Accepted for local-first.
- **🟠 RATE-LIMITED (8):** 90, 95, 98 (runbook-gen half), 117, 122, 124, 206, plus the live warm run — all require Gemini generation, currently access-blocked (403). Code paths exist and are unit-tested.
- **⛔ EXCLUDED (1):** 71 — Gemini native function-calling is intentionally not used; tools are orchestrated deterministically by LangGraph, with prompt-based JSON structured output.
- **❌ MISSING: none.**

Notable items now fully complete (previously flagged, since fixed):
- **39, 64** ✅ — `MAX_AGENT_STEPS` is enforced as LangGraph `recursion_limit`; exceeding it raises `GraphRecursionError` → `run_failed`. Verified by 3 tests.
- **238, 258, 259** ✅ — documentation names only `gemini-3.8-flash`; zero Ollama/Qwen/2.0-flash references remain.
- **270, 274, 275** ✅ — RunStore, baseline-HTTP, and demo-HTTP tests added.

## 6. Live runtime verification

| Check | Result |
|---|---|
| Docker daemon | ✅ v29.7.2 |
| Hindsight `/health/live` | ✅ v0.10.1, alive |
| Backend `/health` | ✅ `status: ok`, gemini ok, hindsight ok |
| `/api/incidents` | ✅ 5 incidents |
| Frontend on 5173 | ✅ (host 0.0.0.0) |
| Backend on 8000 | ✅ |
| Port 11434 | ✅ not listening (no Ollama dependency) |
| Ports 8888 / 9999 | ✅ listening (Hindsight) |
| Demo mode | ✅ LIVE (17 events, `demo_mode_started` → `run_completed`, no Gemini) |
| Hindsight recall | ✅ LIVE (returns inc-001/inc-003 memories) |
| Hindsight retain | ✅ LIVE VERIFIED (this session) |
| Hindsight consolidation | ✅ LIVE VERIFIED (this session, "2 processed") |
| Cold INC-001 run | ✅ LIVE VERIFIED earlier this session (#92632111: 69.1s, conf 0.95, eval pass, evidence 1.0, retained + searchable) |
| Gemini generation (today) | 🟠 **403 project-denied** — one probe, not retried |
| Live warm run / baseline diagnosis / runbook synthesis | 🟠 BLOCKED by Gemini access (403) |

## 7. Unit / integration test results

- **Backend: 137 passed** in ~1.1s (`pytest`), no live key required.

| File | Tests |
|---|---|
| test_fixtures.py | 34 |
| test_memory.py | 29 |
| test_agent.py | 27 (incl. 3 step-limit) |
| test_evaluator.py | 21 |
| test_runs.py | 13 (new) |
| test_endpoints.py | 8 (new: 4 baseline + 4 demo) |
| test_health.py | 5 |
| **Total** | **137** |

- **Frontend:** `tsc && vite build` succeeds (33 modules); 1 component test.
- Coverage includes: ground-truth isolation, agent ordering/termination, malformed-output handling, timeout path, step-limit enforcement, Hindsight-unavailable handling, evaluator edge cases, RunStore lifecycle/eviction/compare, baseline `memory_skipped`/`memory_used=false`, demo replay to `run_completed`.

## 8. Security audit

- No infra mutation, no shell, no kubectl, no production credentials.
- `.env` gitignored; **no secret in git, frontend source, or `dist/`** (scan clean).
- `/health` never returns the key; errors do not echo it.
- CORS restricted to a single configured origin (no wildcard).
- Ground-truth fields stripped from every agent- and client-facing response.

## 9. Gemini audit

- Provider: `langchain-google-genai==4.4.0` / `google-genai==2.25.0`; model **`gemini-3.8-flash`** in `config.py`, `.env.example`, `backend/.env`, and `docker-compose.yml` (Hindsight).
- No Ollama / Qwen / 11434 / langchain-ollama anywhere; no OpenAI / Anthropic requirement.
- Structured output via prompt + `_parse_llm_json`; 403 and 429 both handled gracefully (`run_failed`).
- **Free-tier posture retained:** the project is designed to run within Google's Gemini API free tier. Free-tier quotas apply (e.g. requests/day per project per model). **No billing, paid tier, or paid fallback is required or recommended.**
- **Current live status:** access-blocked (HTTP 403, project denied) for the supplied key; the prior key hit the daily quota (HTTP 429). This is an **environmental access/quota** condition, not a code defect.

## 10. Hindsight audit

- Running v0.10.1; bank `epistemic-sre`; provider gemini; model gemini-3.8-flash; key supplied via `${GEMINI_API_KEY}`.
- **Mental models: 1** — `mm-97a35595ac06444880b71f70fb141541` ("Microservice Resolution Runbook"), the canonical id recorded in `backend/.env`. (The 4 earlier empty duplicates from the prior id mismatch were removed; the mismatch itself was fixed and `init_hindsight.py` patched to self-heal.)
- **Memories: 5**, intact. **Postmortems: inc-001 (pending), inc-003 (approved)**, intact.
- retain / recall / consolidation LIVE VERIFIED; runbook content synthesis 🟠 (needs Gemini generation).

## 11. Cold / warm / baseline status

| Path | Status |
|---|---|
| Cold (INC-001) | ✅ LIVE VERIFIED (#92632111) |
| Warm (similar incident, `memory_used=true`) | 🟠 code path implemented + unit-tested; **live run BLOCKED by Gemini access (403)** — not claimed complete |
| Baseline (`?baseline=true`, `memory_used=false`) | ✅ code path LIVE (SSE emits `memory_skipped`); live LLM diagnosis 🟠 blocked; covered by 4 HTTP tests |
| Comparison | ✅ `/api/runs/compare` uses measured values only; UI disclaims fabricated improvement % |

No performance-improvement percentage is claimed.

## 12. Frontend audit

React 18 + TS + Vite 5. All required elements present and building: incident queue + count, live/baseline/demo modes, agent activity timeline, runbook/memory panel, diagnosis summary, tool-call count, elapsed time, memory-used, eval result, recent runs, comparison view, memory reset (confirm), approvals, gemini/hindsight health dots, no Ollama status, no key exposure. Responsive desktop layout.

## 13. Data / attribution audit

- inc-001, inc-002: hand-crafted (no external source).
- inc-003/004/005: derived from `quantranger/sre-agent-eda-bundle` (Apache-2.0), records `011-bad_deploy_errors`, `015-stuck_rollout`, `009-cache_stampede`; each fixture carries `source` + `source_record_id`.
- ATTRIBUTIONS.md clearly separates source evidence from derived `_ground_truth`, states license, and documents why an inspected second dataset was not used.

## 14. Documentation audit

- README.md, docs/DEMO.md, docs/architecture.md, ATTRIBUTIONS.md present and consistent with implementation.
- **Zero** obsolete references (gemini-2.0-flash / Ollama / Qwen / 11434 / langchain-ollama).
- Free-tier limitation documented; no claim of unlimited free usage; no fabricated performance numbers.

## 15. Dependency audit

All runtime dependencies used and current: langchain-google-genai 4.4.0, langgraph 1.2.12, langchain-core 1.6.5, fastapi 0.141, hindsight-client 0.10.1, pydantic 2.13, httpx 0.28, sse-starlette 3.4.11, uvicorn 0.54; react/react-dom 18.3, vite 5.4, typescript 5.5. `datasets` is import-script-only. No `langchain-ollama`; no OpenAI/Anthropic SDKs.

## 16. API audit

| Method | Path | Frontend | Tested |
|---|---|---|---|
| GET | /health | ✅ | ✅ |
| GET | /api/incidents | ✅ | ✅ |
| GET | /api/incidents/{id} (+ /logs /metrics /trace /pods) | via agent | ✅ |
| POST | /api/investigate/{id} `?baseline&demo` | ✅ | ✅ (live/baseline/demo) |
| GET | /api/memory/status | ✅ | ✅ (service) |
| GET | /api/memory/runbook | ✅ | ✅ (service) |
| POST | /api/memory/runbook/refresh | ✅ | — |
| GET/PUT | /api/memory/approvals[/{id}] | ✅ | ✅ (service) |
| DELETE | /api/memory/bank | ✅ | ✅ (service) |
| GET | /api/runs[/{id}] | ✅ | ✅ (store) |
| POST | /api/runs/compare | ✅ | ✅ (store) |

Frontend/backend consistent; proxy targets 8000; no stale endpoints.

## 17. Environment-variable audit (no secret values printed)

| Variable | File | Required | Secret | Present | Used by code | Used by Docker |
|---|---|---|---|---|---|---|
| GEMINI_API_KEY | backend/.env | yes | **yes** | yes | ✅ | ✅ `${...}` |
| GEMINI_MODEL | backend/.env, .env.example | yes | no | `gemini-3.8-flash` | ✅ | — |
| HINDSIGHT_BASE_URL | backend/.env | yes | no | yes | ✅ | — |
| HINDSIGHT_BANK_ID | backend/.env | yes | no | `epistemic-sre` | ✅ | — |
| HINDSIGHT_MENTAL_MODEL_ID | backend/.env | yes | no | `mm-97a35595…` | ✅ | — |
| CORS_ORIGIN | backend/.env | yes | no | `http://localhost:5173` | ✅ | — |
| BACKEND_HOST / PORT | backend/.env | yes | no | 127.0.0.1 / 8000 | ✅ | — |
| MAX_AGENT_STEPS | backend/.env | no | no | 8 | ✅ (recursion_limit) | — |
| LLM_TIMEOUT | backend/.env | yes | no | 60 | ✅ | — |
| VITE_API_BASE_URL | frontend/.env | yes | no | empty (proxy mode) | ✅ | — |
| HINDSIGHT_API_LLM_* | docker-compose.yml | yes | key via `${}` | yes | — | ✅ |

`.env.example` contains a placeholder only. No frontend secret. Model values consistent across all files.

## 18. Excluded-feature verification

All 19 correctly **NOT IMPLEMENTED**: real k8s, real remediation, code patching, Slack, multi-tenant, custom vector DB, custom embeddings, cross-encoder reranking (`enable_reranking:false`), Redis, Celery, RabbitMQ, extra microservices, OpenAI, Anthropic, Ollama runtime, Qwen runtime, complex auth, payment/billing, unnecessary cloud infra.

## 19. Remaining blockers

**Only one, and it is environmental:**
- **Gemini live generation access — HTTP 403 (project denied)** for the current key; prior key was HTTP 429 (daily free-tier quota). Blocks the live warm-memory run, live baseline LLM diagnosis, and runbook content synthesis. **Resolution is $0-compatible:** supply a Gemini API key from a non-flagged project that still has free-tier quota, then re-run cold→warm→baseline. No billing required.

No implementation blockers remain.

## 20. Final verdict

**READY WITH MINOR FIXES**

- **Implementation:** COMPLETE — zero missing requirements; all fixable audit findings resolved (docs, step-limit, tests, duplicate models).
- The only outstanding item is **LIVE VERIFICATION BLOCKED** for warm/baseline/runbook synthesis due to **Gemini access/quota (403/429)** — an environmental condition, not a code gap. The code paths are implemented and unit-tested.
- Per the acceptance rule, this is "READY WITH MINOR FIXES" (not "READY", because live warm/baseline have not succeeded; not "NOT READY", because nothing is unimplemented and the block is a free-tier access condition).

## 21. Exact startup instructions

```bash
# 1. Hindsight (Docker Desktop must be running)
cd /Users/admin/Documents/epistemicops
export $(grep -v '^#' backend/.env | grep GEMINI_API_KEY)
docker compose up -d

# 2. Backend
cd /Users/admin/Documents/epistemicops/backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000

# 3. Frontend
cd /Users/admin/Documents/epistemicops/frontend
npm run dev
# open http://localhost:5173   (http://127.0.0.1:5173 also works)
```

## 22. Exact demo instructions

1. **Cold:** Live mode → Run INC-001 → SSE timeline → diagnosis → eval → postmortem retained. *(needs Gemini quota)*
2. **Consolidate:** wait for Hindsight consolidation; click ↻ Refresh Runbook.
3. **Warm:** Live mode → run a similar incident (inc-003/inc-004, `bad_deploy`) → `memory_used=true`. *(needs Gemini quota)*
4. **Baseline:** Baseline mode → same incident → `memory_used=false`. *(diagnosis needs Gemini quota)*
5. **Compare:** Recent Runs → Compare last 2 → measured tool-calls / elapsed / eval.
6. **Demo (quota-free, works now):** Demo mode → inc-003 → deterministic replay.
7. **Reset:** Runbook/Memory → Reset Memory Bank (bank-scoped, confirm).

> Steps 1, 3, 4 require available Gemini free-tier quota/access. Step 6 requires none.
