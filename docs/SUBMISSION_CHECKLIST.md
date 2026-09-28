# Submission Checklist

Legend: [x] done & verified · [~] prepared, needs human action · [ ] not done · [?] blocked/unverified

## Mandatory deliverables
- [~] **GitHub repository** — code clean, documented, 137 tests, docs present. **Human: create repo + push.** (not yet published)
- [ ] **Demo video** — script ready (`docs/VIDEO_SCRIPT.md`). **Human: record + upload.**
- [~] **Live project demo** — app runs; demo mode is live and deterministic. Live *warm* LLM run is blocked (see LLM item).
- [~] **Article** — draft ready (`docs/ARTICLE_DRAFT.md`). **Human: finalize per Content Guide + publish.**
- [~] **Social media post** — draft ready (`docs/SOCIAL_MEDIA_POST_DRAFT.md`). **Human: post.**
- [~] **Video content deliverable** — script ready (`docs/VIDEO_SCRIPT.md`). Confirm if same as Demo Video per Content Guide.
- [x] **Explanation of Hindsight usage** — `docs/HINDSIGHT_EXPLANATION.md`.

## Technical (verified this audit)
- [x] Hindsight used + running (v0.10.1, bank `epistemic-sre`, 5 memories)
- [x] Backend health ok; `/api/incidents` returns 5
- [x] 137 backend tests pass; frontend builds
- [x] Demo mode live (17 events); recall live (score 1.1); consolidation live
- [x] Ground-truth isolation verified; no secret in frontend/dist; `.env` gitignored
- [x] Read-only tools; no shell/kubectl/infra mutation
- [?] **Live warm run / baseline live diagnosis** — blocked by Gemini 403 (free-tier access). Fix: Groq free key (see below).

## Content Guide
- [?] **Official Content Guide not supplied** — `docs/CONTENT_GUIDE_GAP.md`. Requirements 31/32 unverifiable until provided.

## LLM for the live demo ($0)
- [?] Gemini: current key returns **403 (project denied)**; a prior key hit **429 (daily free-tier)**.
- [x] **Groq provider implemented** (optional). `LLM_PROVIDER=groq` or setting `GROQ_API_KEY`
  makes the agent use Groq (`openai/gpt-oss-120b`); Gemini stays the default. Wired in
  `config.py` / `agent/graph.py` / `/health`; covered by `tests/test_llm_provider.py`.
- [ ] **Only remaining step:** add a free `GROQ_API_KEY` to `backend/.env`
  ([console.groq.com](https://console.groq.com)), then run `./scripts/demo.sh` (or the UI)
  for the live cold → warm → baseline sequence. **Human: obtain the free key.**

## Before you submit (human)
1. Get a working free LLM key (Groq recommended) → run cold + warm + baseline live once.
2. Record the demo video.
3. Publish the article and social post per the Content Guide.
4. Push the repo to GitHub (private→public per rules).
5. Obtain the official Content Guide and re-confirm 31/32/34/36/37/38.
