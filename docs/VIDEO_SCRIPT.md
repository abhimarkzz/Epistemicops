# DRAFT — Video script

> Status: SCRIPT PREPARED. **No video has been recorded.** Recording is a human action.
> Confirm length/format against the official Content Guide (`docs/CONTENT_GUIDE_GAP.md`).
> Target length: ~2 minutes (adjust to the guide).

## Shot list

**1. Hook / problem (0:00–0:15)**
Screen: EpistemicOps dashboard.
VO: "When production breaks, the slowest part is remembering how the last similar outage was
fixed. EpistemicOps gives an incident-response agent that memory, using Hindsight."

**2. Product intro (0:15–0:30)**
Screen: point out the three columns — Incident Queue, Agent Activity, Runbook/Memory.
VO: "Local-first SRE agent: React + FastAPI + LangGraph, Gemini for diagnosis, and Hindsight
as the persistent memory layer."

**3. Cold incident (0:30–0:55)**
Screen: run INC-001 in Live mode; SSE timeline streams tool calls → diagnosis.
VO: "A new incident. The agent investigates logs, metrics, traces, pods, and diagnoses a
connection-pool exhaustion. No prior memory yet — it's learning this for the first time."

**4. Hindsight retention (0:55–1:15)**
Screen: Runbook/Memory panel — postmortem appears, approve it; memory count rises; runbook
consolidates.
VO: "The postmortem is retained to Hindsight and consolidated into an evolving runbook."

**5. Warm incident (1:15–1:35)**
Screen: run a related bad_deploy incident; timeline shows a memory hit; memory-used badge lit.
VO: "A related outage. This time prior knowledge is recalled before investigation even
starts — the agent is informed by what it learned."

**6. Baseline comparison (1:35–1:50)**
Screen: same incident in Baseline mode ("Memory query skipped"); open Compare last 2.
VO: "Turn memory off and the agent is generic again. Same incident, measured side by side."

**7. Close (1:50–2:00)**
Screen: architecture diagram.
VO: "Same agent, same incident — the only difference is memory. That's Hindsight."

## Recording notes
- If no live LLM key is available, record the Live cold run only if it works; otherwise use
  **Demo mode** and state on-screen that it is a deterministic replay. Never present a replay
  as a live model run.
- Do not overlay fabricated metrics ("40% faster"). Show the real Compare view numbers.
