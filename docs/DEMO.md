# EpistemicOps Learning Loop Demo

This guide walks through the cold → warm learning loop: running an investigation
without memory, letting Hindsight consolidate, approving the postmortem, then
running a related incident and observing that prior context was used.

---

## Prerequisites

All services must be running before you begin.

**1. Start Hindsight**
```bash
docker compose up -d hindsight
```
Wait until `http://localhost:8888/health/live` returns `{"status":"ok"}`.

**2. Set your Gemini API key in `backend/.env`**
```bash
# backend/.env
GEMINI_API_KEY=your-gemini-api-key-here
```
Get a free key at https://aistudio.google.com/app/apikey

**3. Start the backend**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --port 8000 --reload
```

**4. Start the frontend**
```bash
cd frontend
npm run dev
```
Then open `http://localhost:5173`.

---

## Phase A — Cold Run (no prior memory)

1. In the **Incident Queue**, make sure **Live** mode is selected (not Baseline or Demo).
2. Click **Run Incident** on `inc-003` (orders service, bad_deploy, P1).
3. Watch the **Agent Activity** timeline:
   - `memory_query_started` → `memory_result: found=false` — no prior patterns exist.
   - Four tool calls: get_logs, get_metrics, get_trace, get_pod_status.
   - `diagnosis_completed` — the LLM analyses from scratch.
   - `postmortem_created: success=true` — postmortem retained to Hindsight.
4. Note the elapsed time shown in the **Summary Bar** at the bottom.
5. Note `memory_used: No` in the stats.

> **Typical cold-run time:** 3–8 minutes (LLM thinking time dominates).
> Your actual time will differ. Do not compare against any claimed baseline.

---

## Phase B — Wait for Consolidation

Hindsight consolidates retained memories into the Mental Model on a schedule
(typically a few minutes after retention, if configured with `refresh_after_consolidation: true`).

1. In the **Runbook / Memory** panel, click **↻ Refresh Runbook**.
2. The status should transition from `consolidation_pending` → `current`.
3. If it remains stale, wait 2–3 minutes and refresh again.
4. Once status is `current`, the runbook content will show extracted SRE patterns.

Optionally, approve the inc-003 postmortem in the **Postmortems** section:
- Click **Approve** on the inc-003 row.
- Approved postmortems receive higher trust weighting in future queries.

---

## Phase C — Warm Run (memory available)

1. Click **Run Incident** on `inc-004` (shipping service, bad_deploy, P1).
   inc-004 is a related incident — same category (`bad_deploy`), same cluster.
2. Watch the timeline:
   - `memory_result: found=true` — prior bad_deploy pattern retrieved from Hindsight.
   - The `summary` field in the memory_result event shows the extracted context.
   - Four tool calls still run (the agent always gathers fresh data).
   - `diagnosis_completed` with `memory_used: true`.
3. Compare elapsed time to Phase A.

> **Important:** The warm run may be faster, slower, or similar. LLM thinking time
> varies with model load, hardware, and prompt complexity. Do not treat any
> single run-pair as proof of improvement. Run multiple pairs and check whether
> `memory_used: true` correlates with correct root-cause categorisation across runs.

---

## Phase D — Compare Runs

The **Recent Runs** bar at the bottom of the UI shows the last 8 runs.

1. After completing both inc-003 and inc-004, click **Compare last 2** in the runs bar.
2. The comparison table shows:
   - `memory_used` for each run (should be `No` for cold, `Yes` for warm).
   - `elapsed_ms` for each run — measured wall-clock time.
   - `eval_pass` — whether the diagnosis passes the keyword evaluator.
   - `evidence_score` — fraction of ground-truth evidence keywords found.

All values are measurements taken during the actual runs. There are no invented
improvements in this display.

---

## Baseline Mode (controlled comparison)

To isolate the effect of memory, use **Baseline** mode:

1. Select **Baseline** in the mode selector above the incident list.
2. Run any incident — the memory query step is skipped entirely.
3. Compare against a Live run of the same incident.

This gives a controlled cold/warm comparison on the same incident, eliminating
the confound of different incidents having different complexity.

---

## Demo Mode (fast replay)

If the live LLM (quota/access) or Hindsight are unavailable, use **Demo** mode to replay pre-recorded events:

1. Select **Demo** in the mode selector.
2. Run a **demo-supported incident** — currently **`inc-003`** and **`inc-004`**.
3. The timeline plays back stored events with compressed delays; the header shows
   **"Demo replay · inc-XXX"** for the selected incident.
4. The first event is always `demo_mode_started` with the label
   **"Demo Mode — deterministic replay"** — this cannot be missed.

**Supported vs unsupported incidents.** Demo replay exists only for incidents that have a
`data/demo_events/{incident_id}.json` file. The UI queries `GET /api/demo/incidents` and, for an
unsupported incident (e.g. `inc-001`, `inc-002`, `inc-005`), **disables the Run demo button** and
shows *"Demo replay is not available for inc-XXX — run a Live investigation instead."* The
selected incident is never silently swapped for another incident's replay.

> **Demo mode never runs a live model.** Events are loaded from
> `data/demo_events/{incident_id}.json` for the **selected** incident. The diagnosis shown is the
> one recorded at demo-fixture creation time and does not reflect a current model run.
> Eval results computed from demo events are evaluated against real ground truth,
> but they reflect the recorded diagnosis, not a fresh one.

---

## Safe Memory Reset

To wipe all memories and start fresh:

1. In the **Memory Bank** section of the right panel, click **⚠ Reset Memory Bank**.
2. Confirm the action.
3. Only the EpistemicOps Hindsight bank (`epistemicops-sre`) is deleted.
   Other Hindsight banks on the same server are not affected.
4. The approval store (`data/memory_state.json`) is also cleared.

> This is irreversible. Run a full cold → warm cycle again from scratch after resetting.

---

## Evaluator

After each completed run (live or demo), the backend runs a keyword-based evaluator
against the ground truth stored in `data/incidents/*.json`.

The evaluator checks:
- **Category match**: does the diagnosis text mention the expected failure category?
- **Evidence coverage**: what fraction of expected evidence keywords appear in the diagnosis?
- **Remediation**: do canonical fix keywords appear in the recommended remediation?
- **Forbidden categories**: does the root cause incorrectly name a forbidden category?

The evaluator uses substring matching only — no AI judge, no opaque scoring.
A `pass` means all four criteria are satisfied. Evidence score ≥ 40% is required.

Scores are shown in the run chips in the Recent Runs bar and in the comparison table.

---

## Limitations

- **Single-run comparisons are not statistically significant.** LLM output varies
  by run even with `temperature=0`. Run multiple cold/warm pairs before drawing
  conclusions.
- **Elapsed time includes Gemini API latency.** Cold-run elapsed time includes the
  network round-trip to the Gemini API, which varies between runs. Account for this
  when comparing elapsed times; it is not a property of memory use.
- **The evaluator is keyword-based, not semantic.** A diagnosis that uses synonyms
  for the expected evidence may score lower than a semantically correct one that
  happens to share vocabulary with the fixture.
- **Demo mode events were recorded at a specific point in time.** The recorded
  diagnosis reflects the model's output on that specific run. It may not match
  what the current model version would produce.
- **Hindsight consolidation timing is non-deterministic.** The warm run may not
  benefit from memory if consolidation has not completed before Phase C begins.
