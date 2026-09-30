# Demo recording checklist

Run through this before and during recording. Nothing here is auto-performed — it's the
operator's checklist for a clean, honest take.

## Environment start
- [ ] Docker Desktop running.
- [ ] `export $(grep -v '^#' backend/.env | grep -E 'GROQ_API_KEY|GEMINI_API_KEY')` then `docker compose up -d` — Hindsight healthy on :8888.
- [ ] Backend up on :8000 (`uvicorn app.main:app --host 127.0.0.1 --port 8000`).
- [ ] Frontend up on :5173 (`npm run dev`).
- [ ] `curl -s localhost:8000/health` shows `llm.provider` and `hindsight` both `ok`.

## Clean browser state
- [ ] Open `http://localhost:5173` in a fresh window (no stale service worker; if an old VeriTrace page appears, DevTools → Application → Service Workers → Unregister, then hard reload).
- [ ] Header shows the LLM provider (Groq) and Hindsight dots green.

## Memory reset (optional — for a true empty-cold demo)
- [ ] Runbook/Memory → **Reset Memory Bank** → Confirm. (Wipes only the `epistemic-sre` bank.)
- [ ] Confirm memory count is 0 before the cold run. *Skip this if you want to show recall of already-learned incidents.*

## Cold incident
- [ ] Select INC-001, **Live** mode, **Run**.
- [ ] SSE timeline streams tool calls → `diagnosis_completed`.
- [ ] Diagnosis summary shows root cause + remediation + confidence + eval pass.

## Retention
- [ ] `postmortem_created: success` appears.
- [ ] Runbook/Memory panel shows the new postmortem (pending). Approve it.

## Consolidation
- [ ] Runbook status updates (generating/stale/current). On the Groq free tier this may lag or be rate-limited — that's fine; recall does not depend on it.

## Warm incident
- [ ] Select a related incident (inc-003 / inc-004, `bad_deploy`), **Live**, **Run**.
- [ ] Timeline shows "Memory: found relevant patterns"; **Memory: Used** badge lit; `memory_used=true`.

## Baseline
- [ ] Same incident, **Baseline** mode, **Run**.
- [ ] Timeline shows "Memory query skipped"; `memory_used=false`.

## Comparison
- [ ] **Compare last 2** → table shows memory_used true vs false, real tool-calls/elapsed/eval.
- [ ] Do NOT quote a fabricated "% faster." Read the real numbers.

## Error recovery
- [ ] If a live run 429s (Groq TPM), wait ~60s and re-run; never fake a result.
- [ ] If the backend/Hindsight is unreachable, restart per "Environment start."

## Backup demo mode (no LLM)
- [ ] If live LLM is unavailable, switch to **Demo** mode → inc-003. Deterministic replay,
      clearly labeled "NOT a live model run." State this explicitly on camera.
