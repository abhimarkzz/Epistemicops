# Demo Evidence Checklist

Screenshots / recordings to capture for the submission. Nothing here is captured yet —
this is the list of evidence a human still needs to produce.

## Screenshots to capture
- [ ] Dashboard with Gemini + Hindsight status dots green.
- [ ] INC-001 cold run: SSE timeline mid-investigation (tool calls visible).
- [ ] Diagnosis summary (root cause, remediation, confidence, eval pass).
- [ ] Runbook/Memory panel: postmortem retained, pending → approved.
- [ ] Warm run: timeline showing a memory hit + "Memory: Used" badge.
- [ ] Baseline run: "Memory query skipped" + `memory_used=false`.
- [ ] Compare view: two runs side by side with measured tool-calls/elapsed/eval.

## Live evidence already observed during audit (reproducible, not screenshots)
- Backend `/health`: `gemini: ok`, `hindsight: ok`.
- `/api/incidents`: 5 incidents (inc-001…inc-005).
- Hindsight `/memories/recall` "connection pool exhausted" → top hit inc-001, score ~1.1.
- Memory status: 5 memories; postmortems inc-001 (pending), inc-003 (approved).
- Demo mode: 17 events, `demo_mode_started` → `run_completed`.
- Cold INC-001 full live run earlier this project: #92632111, eval pass, evidence 1.0
  (requires a working LLM key to reproduce today).

## Do NOT fabricate
- No invented "% faster" numbers — use the Compare view's real values.
- No claim of a live warm run unless one actually completes with a working LLM key.
- No screenshots of a run that didn't happen.
