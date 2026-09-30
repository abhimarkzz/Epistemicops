# EpistemicOps Video Script & Recording Guide

> **Target Duration:** 3 minutes 30 seconds (within 2–5 minute requirement).  
> **Resolution:** 1080p (1920x1080) minimum, 60fps.  
> **Format:** Screen recording with clear spoken voiceover (webcam/talking head optional).  
> **Prerequisites:** Stack running locally or open at [https://epistemicops.onrender.com](https://epistemicops.onrender.com); header indicators green.

---

## Scene 1: Introduction (00:00 – 00:30)

**ON SCREEN:**
EpistemicOps 3D Command Center dashboard (`http://localhost:5173`). The three columns (Incident Queue, Agent Activity, and Runbook / Memory) are clearly visible with the 3D topology graph active.

**ACTION:**
Hover cursor smoothly over the Incident Queue on the left, then over the 3D topology, and finally over the green health pills in the header showing Groq and Hindsight active.

**SAY:**
"This is EpistemicOps — an autonomous SRE incident-response agent whose defining feature is a persistent operational memory layer, built on Vectorize Hindsight. In production operations, agents can't just be one-shot reasoning engines. They need to remember past outages, consolidate lessons into living runbooks, and recall verified fixes when related alerts fire. Let's look at why that matters."

---

## Scene 2: The Problem (00:30 – 01:00)

**ON SCREEN:**
Close-up of the Incident Queue highlighting incident `inc-001` (db pool exhaustion) and `inc-003` (bad deploy).

**ACTION:**
Click on `inc-003` to show its alert metadata (orders service, 5xx errors, P1 severity).

**SAY:**
"When a production service falls over, the slowest part of on-call response is rarely typing the command to fix it — it's the remembering. 'Didn't we see this exact connection pool exhaustion last month? Which deployment caused it, and how did we roll it back?' Stateless AI assistants start from scratch on every single outage. They re-read raw logs, re-test the same hypotheses, and forget everything the moment the run ends. Passing previous chat logs into prompts quickly blows past token budgets and creates prompt noise. EpistemicOps solves this with dedicated vector memory."

---

## Scene 3: Demo — Cold Run & Retention (01:00 – 01:45)

**ON SCREEN:**
Agent Activity timeline for `inc-003` running in Live mode.

**ACTION:**
1. Click **Run Investigation** on `inc-003`.
2. As the timeline scrolls, point to the event `memory_result` showing `found: false`.
3. Highlight the sequential tool calls (`get_logs`, `get_metrics`, `get_trace`, `get_pod_status`).
4. Watch `diagnosis_completed` output the root cause and rollback recommendation.
5. In the right panel under *Recent Retained Postmortems*, click **Approve** on the new `inc-003` card.

**SAY:**
"First, a cold run. The agent investigates `inc-003` — a bad deployment on the orders service. Notice in the timeline: Hindsight query returns `found: false`. There is no prior memory, so the agent investigates from first principles using read-only telemetry tools. Once it diagnoses the root cause, EpistemicOps automatically retains a structured postmortem in Hindsight. Over in the memory panel, we approve it as verified operational knowledge. Hindsight's observation engine immediately consolidates this into our living Microservice Resolution Runbook."

---

## Scene 4: Demo — Warm Run with Hindsight Recall (01:45 – 02:30)

**ON SCREEN:**
Incident Queue selecting `inc-004` (shipping service, bad deploy), followed by the live Agent Activity timeline.

**ACTION:**
1. Select `inc-004` in the Incident Queue.
2. Ensure mode is **Live** and click **Run Investigation**.
3. Point out the `memory_result` event flashing: **`found: true`**, with the recalled postmortem summary.
4. Point to the status chip showing **`Memory: Used`**.

**SAY:**
"Now, let's run a related incident: `inc-004` — a rollout failure on the shipping service. Watch the timeline closely. Before the agent even starts calling telemetry tools, `memory_result` returns `found: true` in under 80 milliseconds. Hindsight recalled the verified postmortem and rollback playbook from `inc-003`. Because vector recall runs without an LLM call, it's instant and consumes zero tokens. The agent now diagnoses the outage informed by past institutional knowledge."

---

## Scene 5: Demo — Baseline Control & Comparison (02:30 – 03:00)

**ON SCREEN:**
Baseline toggle selected for `inc-004`, followed by clicking **Compare last 2** in the bottom bar.

**ACTION:**
1. Switch mode to **Baseline** and run `inc-004` (shows `memory_skipped`).
2. Click **Compare last 2** in the bottom Recent Runs bar to open the comparison modal.
3. Highlight the side-by-side table showing `memory_used` (false vs true), elapsed time, tool calls, and ground-truth pass status.

**SAY:**
"To prove the difference scientifically, we switch to Baseline mode. Baseline bypasses memory completely, serving as an experimental control on the exact same incident. In the Compare view, we see the runs side by side: real measured execution latency, tool counts, and evaluator scores — without any fake benchmarks or exaggerated claims."

---

## Scene 6: Takeaway & Architecture (03:00 – 03:30)

**ON SCREEN:**
Clean architecture diagram from `docs/architecture.md` (or the public GitHub repo page).

**ACTION:**
Scroll through the repository README, highlighting the quick start guide and open-source documentation.

**SAY:**
"EpistemicOps demonstrates that for AI agents in critical infrastructure, memory isn't just a decorative feature — it's the entire product. LangGraph provides bounded, deterministic state orchestration, while Vectorize Hindsight provides persistent postmortem retention and runbook consolidation. The code, test suite of 152 verified tests, and live demo are open source on GitHub. Thank you for watching!"

---

## Recording Guidelines for Maintainer

- **Audio Quality:** Use a dedicated USB/XLR microphone with noise suppression enabled.
- **Display Setup:** Set browser zoom to 110% or 125% for clean legibility at 1080p.
- **Pacing:** Allow 2 seconds of silence between actions to facilitate video editing.
- **YouTube Upload Metadata:**
  - **Title:** `I gave an SRE incident-response agent a real memory with Hindsight`
  - **Category:** Science & Technology
  - **Thumbnail:** 16:9 thumbnail from `docs/assets/article-dashboard.png` with bold title text.
