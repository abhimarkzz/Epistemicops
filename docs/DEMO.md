# EpistemicOps Demonstration Walkthrough

This guide provides a structured, judge-friendly walkthrough of the EpistemicOps learning loop: running an investigation without memory (cold), retaining the postmortem in Vectorize Hindsight, consolidating operational knowledge, recalling past patterns during a related outage (warm), and executing a memory-off control (baseline) for side-by-side verification.

---

## Before You Start

Ensure the EpistemicOps stack is running:
1. **Hindsight Memory Engine:** Running locally on port 8888 (`bash scripts/hindsight-native.sh` or Docker) or verified via the live deployment at [https://epistemicops.onrender.com](https://epistemicops.onrender.com).
2. **FastAPI Backend:** Running on port 8000 with a valid `GROQ_API_KEY` (or Gemini key) in `backend/.env`.
3. **Frontend Application:** Open in browser at `http://localhost:5173` (or the live URL).
4. **Header Health Indicators:** Confirm both **Groq** and **Hindsight** status pills in the top right display green (`ok`).

---

## 1. Cold Incident

### ACTION
1. In the left **Incident Queue**, locate and click **`inc-003`** (`orders` service, `bad_deploy` category, P1 severity).
2. Ensure the mode selector at the top of the queue is set to **Live**.
3. Click the primary button: **Run Investigation**.

### EXPECTED RESULT
- The central **Agent Activity** timeline begins streaming real-time events via Server-Sent Events (SSE).
- The timeline shows:
  - `incident_started` (orders, bad_deploy, P1).
  - `memory_query_started` → `memory_result`: `found: false` (*"No prior patterns found"*).
  - Sequential read-only tool calls: `get_logs`, `get_metrics`, `get_trace`, `get_pod_status`.
  - `diagnosis_started` → `diagnosis_completed`.
  - The diagnosis card displays the detected root cause (misconfigured deployment causing 5xx errors), evidence citations, and rollback remediation.
  - The final status badge displays `memory_used: false`.

### WHY IT MATTERS
This establishes the unassisted baseline behavior of an SRE agent encountering an unfamiliar failure mode for the first time. The agent investigates strictly from first principles using telemetry.

---

## 2. Retain

### ACTION
1. Observe the right-hand **Runbook / Memory** panel immediately after the diagnosis finishes.
2. Under **Recent Retained Postmortems**, locate the newly created entry for `inc-003`.
3. Click the **Approve** button on the `inc-003` postmortem card.

### EXPECTED RESULT
- The timeline displays `memory_retention_started` followed by `postmortem_created: success=true`.
- In the right-hand panel, the approval status for `inc-003` updates from `pending` to `approved`.
- The total memory counter increments in the Memory Bank summary header.

### WHY IT MATTERS
Operational memory requires human governance. EpistemicOps persists structured postmortems (omitting noisy raw logs) to Hindsight, and allows engineers to review and vet knowledge before assigning higher trust to it.

---

## 3. Consolidation

### ACTION
1. In the **Runbook / Memory** panel, navigate to the **Microservice Resolution Runbook** section.
2. Click the **↻ Refresh Runbook** button.

### EXPECTED RESULT
- The backend triggers `POST /api/memory/runbook/refresh` against Hindsight's mental model API.
- The runbook status badge shifts to `current` (or `consolidation_pending` if the background engine is queueing delta synthesis).
- The evolving runbook markdown reflects the newly synthesized bad deployment recovery playbook.

### WHY IT MATTERS
Hindsight is not merely a static vector archive. Its Mental Model observation engine consolidates discrete postmortems into higher-level, evolving operational runbooks across microservices.

---

## 4. Warm Incident

### ACTION
1. In the **Incident Queue**, select **`inc-004`** (`shipping` service, `bad_deploy` category, P1 severity).
2. Keep the mode set to **Live**.
3. Click **Run Investigation**.

### EXPECTED RESULT
- The timeline streams events:
  - `memory_query_started` with query `service=shipping category=bad_deploy alert: ...`
  - `memory_result` immediately displays **`found: true`**, showing the recalled postmortem from `inc-003`!
  - The timeline highlights an active memory recall banner.
  - The agent proceeds with evidence collection, but the LLM diagnostic prompt now includes the recalled postmortem context.
  - When diagnosis completes, the summary chip explicitly displays **`Memory: Used`** (`memory_used: true`).

### WHY IT MATTERS
This is the core value of persistent memory. Instead of re-learning how to diagnose a bad deployment from scratch, the agent is primed by Hindsight with the proven failure signature and remediation strategy learned in `inc-003`.

---

## 5. Baseline

### ACTION
1. Select **`inc-004`** again in the Incident Queue.
2. Switch the mode toggle from Live to **Baseline**.
3. Click **Run (baseline)**.

### EXPECTED RESULT
- The timeline shows:
  - `run_started` with `mode: baseline`.
  - `memory_skipped` with reason `"baseline mode"`.
  - Zero calls are made to Hindsight.
  - The agent completes the investigation from raw telemetry alone.
  - The run chip registers with `memory_used: false`.

### WHY IT MATTERS
Baseline mode acts as the experimental control. It eliminates the variable of incident complexity by allowing judges to run the exact same incident with memory intentionally turned off.

---

## 6. Compare

### ACTION
1. Look at the bottom **Recent Runs** bar, which displays run chips for the completed investigations.
2. Click the **Compare last 2** button (or select any two run chips to compare).

### EXPECTED RESULT
- A side-by-side comparison modal opens displaying:
  - **Run Mode:** `baseline` vs `live` (warm).
  - **Memory Recalled:** `No` vs `Yes`.
  - **Elapsed Time:** Measured wall-clock latency in milliseconds.
  - **Tool Invocations:** Tool counts across both runs.
  - **Diagnostic Confidence:** Agent certainty score.
  - **Evaluator Overlap:** Ground-truth evidence keyword coverage and category match pass/fail.
- A prominent disclaimer states: *"These are measured values. Differences reflect actual run conditions, not claimed improvements."*

### WHY IT MATTERS
We present real, measured engineering results rather than synthetic marketing benchmarks. Judges can directly inspect the operational impact of memory under identical test conditions.

---

## 7. What to Look For

- **Vector Recall without LLM Lag:** Notice how quickly `memory_result` returns (`< 100ms`). Hindsight vector recall does not require an LLM invocation, so memory works even when cloud LLMs are slow.
- **Strict Telemetry Sanitization:** The agent never mentions hidden fields or ground truth; it only cites facts discovered via `get_logs`, `get_metrics`, `get_trace`, and `get_pod_status`.
- **Deterministic Replay Guard:** When switching to **Demo Mode**, the timeline displays an orange `DEMO` badge with an explicit disclaimer indicating that events are pre-recorded for offline demonstration.

---

## Troubleshooting

| Issue | Cause | Resolution |
|---|---|---|
| **Timeline does not update after clicking Run** | Backend not reachable or SSE stream blocked | Verify backend is running (`curl http://127.0.0.1:8000/health`). Check browser console for network connection errors. |
| **Header shows LLM `unreachable`** | `GROQ_API_KEY` missing in `backend/.env` | Add a valid key from [console.groq.com](https://console.groq.com) and restart uvicorn. |
| **Header shows Hindsight `unreachable`** | Native daemon or Docker container stopped | Run `bash scripts/hindsight-native.sh` or check `docker compose ps`. |
| **Warm run reports `found: false`** | `inc-003` was not retained or bank was reset | Run `inc-003` first in Live mode, ensure `postmortem_created: success` is logged, then run `inc-004`. |
| **Runbook status stays `generating`** | Free-tier LLM rate limits during consolidation | Vector recall functions regardless of runbook state. Click **↻ Refresh Runbook** to trigger an update. |
