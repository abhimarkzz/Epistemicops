# EpistemicOps — Judge Demo Script (~1 minute)

Goal: show that an incident-response agent with Hindsight memory beats a memoryless one.

> If a working LLM key is available (Gemini with quota, or a free Groq key — see the main
> README / audit), run the Live path below. If not, run the **Demo-mode fallback** at the
> end, which is deterministic and needs no LLM.

## Setup (before judges arrive)
- Hindsight, backend, and frontend running (see README §"Starting services").
- Browser open at `http://localhost:5173`. Header shows Gemini + Hindsight green.

## The 60-second story

**0:00 — Problem (10s).**
"When production breaks, on-call engineers waste the first minutes remembering how the last
similar outage was fixed. EpistemicOps gives the agent that memory."

**0:10 — Cold incident (15s).**
Select **INC-001 — Database connection pool exhausted**. Run in **Live** mode. Point at the
SSE timeline: it pulls logs, metrics, trace, and pod status, then produces a root cause and
remediation. Note the memory bank had nothing relevant yet — this is the agent learning for
the first time. The postmortem is retained to Hindsight (Runbook/Memory panel updates).

**0:25 — Memory forms (10s).**
Point at the Runbook/Memory column: the postmortem appears (pending → approve it), memory
count increases, and the Microservice Resolution Runbook consolidates it.

**0:35 — Warm incident (15s).**
Run a **related** incident (e.g. inc-003 / inc-004, both `bad_deploy`). This time the timeline
shows a **memory hit** — prior patterns are recalled before the tools even run, and the
diagnosis is informed by the earlier postmortem. The `Memory: Used` badge is lit.

**0:50 — Baseline contrast (10s).**
Re-run the same incident in **Baseline** mode. The timeline shows *"Memory query skipped."*
`memory_used=false`. Open **Compare last 2** — same incident, one with memory, one without,
using the actual recorded runs (tool calls, elapsed, eval).

**Close.** "Same agent, same incident. The only difference is whether it remembered. That
memory layer is Hindsight."

## Demo-mode fallback (no LLM required)
If Gemini/Groq is unavailable: switch the mode selector to **Demo** and run inc-003. It
replays a pre-recorded, clearly-labeled event stream ("Demo Mode — deterministic replay,
NOT a live model run") end-to-end, so the workflow is still shown reliably. Be explicit to
judges that this is a deterministic replay, not a live model call.

## Honesty notes for the presenter
- Do **not** claim a live warm improvement if you are running Demo mode.
- The comparison numbers are real measured values from the runs you just did — don't quote
  a fabricated "% faster."
