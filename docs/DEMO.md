# EpistemicOps — Demo Walkthrough

> This document is the official demo guide for judges and evaluators.
> It walks through the complete cold → retain → consolidate → warm → baseline → compare learning loop.

---

## Prerequisites

Before starting the demo, ensure all three services are running:

1. **Hindsight** (from project root): `docker compose up -d`
2. **Backend** (from `backend/`): `source .venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
3. **Frontend** (from `frontend/`): `npm run dev`
4. **Open** http://localhost:5173 in a browser

Verify the backend is healthy: `curl http://localhost:8000/health` should report `"status": "ok"`.

---

## Phase 1 — Problem

**What to notice:** The incident queue in the sidebar lists 5 synthetic infrastructure incidents (database pool exhaustion, memory leak, bad deployment, stuck rollout, cache stampede). Each represents a real SRE failure pattern. The agent has no prior knowledge of any of these incidents.

**Key point for judges:** This is the starting state — a stateless agent with zero operational memory.

---

## Phase 2 — Cold Investigation (Baseline)

**What I click:**
1. Select **inc-003** ("Bad Deploy — Orders API") from the incident queue
2. Click the **Baseline** mode toggle
3. Click **Run (baseline)**

**What the agent does:**
- Skips memory query (emits `memory_skipped: baseline mode`)
- Calls 4 evidence tools: `get_logs`, `get_metrics`, `get_trace`, `get_pod_status`
- Sends all evidence to the LLM for analysis
- Produces a root-cause diagnosis and remediation recommendation

**What the judge should notice:**
- The timeline shows `memory_skipped` — the agent has no prior context
- All 4 tools are called (the agent gathers evidence from scratch)
- A diagnosis appears with a confidence score
- The elapsed time and tool call count are recorded in the Recent Runs bar

**Expected screen evidence:**
- Timeline events: `memory_skipped → tool_started (×4) → diagnosis_completed`
- Recent Runs bar shows one completed run with mode "baseline"

---

## Phase 3 — Retain

**What I click:**
1. After the cold run completes, the agent automatically retains a postmortem in Hindsight
2. The timeline shows `memory_retention_started` and `postmortem_created`

**What the agent does:**
- Builds a structured postmortem (service, root cause, evidence, remediation)
- Calls `client.aretain()` to store it in the `epistemic-sre` Hindsight bank
- Saves a `PostmortemRecord` with `approval_status: pending`

**What the judge should notice:**
- The postmortem appears in the Runbook/Approval panel with "Pending" status
- Hindsight is now processing the postmortem in the background

---

## Phase 4 — Consolidation

**What I click:**
1. In the Runbook panel, click **Approve** on the pending postmortem
2. Optionally trigger a manual refresh: `curl -X POST http://localhost:8000/api/memory/runbook/refresh`
3. Wait 1–3 minutes for Hindsight to consolidate

**What the agent does (Hindsight internally):**
- Extracts facts from the approved postmortem
- Synthesizes them into the "Microservice Resolution Runbook" mental model
- The runbook now contains patterns from the resolved incident

**What the judge should notice:**
- The Runbook panel status changes from "stale" or "generating" to "current"
- The runbook content (visible in the panel) includes synthesized patterns about deployment failures

---

## Phase 5 — Warm Investigation (Memory-Enabled)

**What I click:**
1. Select **inc-004** ("Stuck Rollout — Shipping Service") — a similar deployment-category incident
2. Ensure **Live** mode is selected (not Baseline)
3. Click **Run Investigation**

**What the agent does:**
- Queries Hindsight memory: builds a semantic query from `service=shipping-service category=stuck_rollout alert: ...`
- Receives recalled patterns from the inc-003 postmortem
- Calls all 4 evidence tools (evidence gathering is not skipped)
- Sends evidence + prior patterns to the LLM
- Produces a diagnosis informed by prior knowledge

**What the judge should notice:**
- The timeline shows `memory_query_started` → `memory_result: found: true`
- The memory result summary shows prior incident patterns
- The diagnosis may reference prior knowledge
- `diagnosis_completed` shows `memory_used: true`

**Expected screen evidence:**
- `memory_result` event with `found: true` and a summary of prior patterns
- The diagnosis acknowledges prior experience

---

## Phase 6 — Baseline (for Comparison)

**What I click:**
1. Keep **inc-004** selected
2. Switch to **Baseline** mode
3. Click **Run (baseline)**

**What the agent does:**
- Skips memory query entirely
- Investigates inc-004 from scratch, without any prior knowledge

**What the judge should notice:**
- `memory_skipped: baseline mode` appears in the timeline
- The diagnosis is produced without memory context
- This provides the comparison point

---

## Phase 7 — Compare

**What I click:**
1. Click **Compare last 2** in the Recent Runs bar

**What the agent does:**
- The backend compares the two most recent runs side-by-side

**What the judge should notice:**
- A comparison table shows:
  - **Elapsed time** for both runs
  - **Tool calls** (same count — memory does not skip evidence gathering)
  - **Confidence** scores
  - **Evaluator pass/fail** and evidence score
  - **Memory used**: true vs false
- The disclaimer: *"These are measured values. Differences reflect actual run conditions, not claimed improvements."*

---

## Phase 8 — Takeaway

**Key points to highlight:**

1. **Memory is central, not incidental.** The entire investigation flow is built around retain → consolidate → recall.
2. **Graceful degradation.** When memory is empty (cold) or disabled (baseline), the agent still works — it just starts from zero.
3. **Human-in-the-loop.** Postmortems require human approval before influencing the runbook.
4. **Honest comparison.** The comparison shows measured values, not claimed improvements.
5. **Read-only safety.** The agent never executes remediation or mutates infrastructure.

---

## Demo Mode (Offline)

If Hindsight or the LLM is unavailable:

1. Select **inc-003** or **inc-004**
2. Click **Demo** mode
3. Click **Run (demo)**
4. Pre-recorded events stream from `data/demo_events/`. An orange "DEMO" badge appears.
5. The first event identifies itself: `"Demo Mode — deterministic replay"`

Demo mode does not call Hindsight or any LLM. It replays recorded events for UI demonstration purposes.

---

## Memory Reset (if needed)

To start fresh:
1. In the Runbook panel, click **⚠ Reset Memory Bank**
2. Confirm the reset
3. Only the `epistemic-sre` bank is affected. Other Hindsight banks are untouched.
4. The approval store (`data/memory_state.json`) is also cleared.
