# Final video script (team video)

> Status: SCRIPT READY. **No video recorded — REQUIRES HUMAN RECORDING.**
> Guide requirements: one team video, **2–5 minutes, 1080p minimum**, screen recording with
> voiceover (talking head optional), public **YouTube** upload with a 16:9 thumbnail (not a
> Google-Drive-only file). Prereqs: stack running, a free `GROQ_API_KEY` in `backend/.env`, browser
> at `http://localhost:5173`, header showing **Groq** + **Hindsight** green.

## Structure (target ~3–4 min)

### 1. Intro — ~0:00–0:30
- On screen: EpistemicOps dashboard (3 columns).
- Narration: "This is EpistemicOps — an SRE incident-response agent whose defining feature is
  memory, built on Hindsight. Stack is React, FastAPI, and a LangGraph agent, with Hindsight as the
  persistent memory layer."
- Action: hover the Incident Queue, Agent Activity, and Runbook/Memory columns.
- Hindsight evidence: Hindsight status dot green.

### 2. Problem — ~0:30–1:00
- On screen: incident list.
- Narration: "When production breaks, the slowest part is remembering how the last similar outage
  was fixed. A stateless agent starts from zero every time. EpistemicOps doesn't."
- Action: point at inc-001 (db pool exhaustion) and inc-003 (bad deploy).

### 3. Live demo — ~1:00–3:30
- **Cold (memory disabled effect first):** switch to **Baseline**, run inc-003. Narration: "With
  memory off, the agent investigates from scratch — memory_used is false." Show `memory_skipped` in
  the timeline and `memory_used=false`.
- **Learn:** switch to **Live**, run inc-001. Narration: "A real investigation — logs, metrics,
  trace, pods — then a diagnosis, and the postmortem is retained to Hindsight." Show the SSE timeline
  and `postmortem_created: success`; approve the postmortem in the Runbook/Memory panel.
- **Warm (before/after moment):** run the related inc-003 in **Live**. Narration: "Now the same kind
  of incident, memory on. Hindsight recalls the prior postmortem before the tools even finish."
  Show "Memory: found relevant patterns" and the **Memory: Used** badge; `memory_used=true`.
- **Compare:** click **Compare last 2**. Narration: "Same incident, measured side by side — one with
  memory, one without, using the actual recorded runs." Show the real numbers; do not claim a
  percentage.
- Hindsight evidence throughout: recall event, memory-used badge, Runbook/Memory panel.

### 4. Wrap-up — ~3:30–4:00
- On screen: architecture diagram (`docs/architecture.md`).
- Narration: "Same agent, same incident — the only difference is whether it remembered. That memory
  layer is Hindsight. Recall needs no LLM, so the whole thing runs on a free tier."
- One key takeaway: "Memory isn't a feature here; it's the product."

## Recording rules
- If Groq recall is momentarily rate-limited, wait ~60s and re-run — do not fake a result.
- If no LLM key is available, record in **Demo mode** and state on-screen it is a deterministic
  replay, not a live model run.
- No invented metrics ("40% faster"). Show the real Compare numbers only.

## 5 candidate YouTube titles (based on the actual project)
1. "I gave an SRE incident agent a real memory with Hindsight"
2. "Memory-on vs memory-off: an incident-response agent that recalls past outages"
3. "Building an SRE agent that remembers postmortems (LangGraph + Hindsight)"
4. "Stop re-solving the same outage: agent memory for incident response"
5. "Hindsight in practice: recall, retain, and an evolving runbook for SRE"

> Titles must not imply production scale, benchmark results, customer adoption, or guaranteed
> performance gains — none are true.

## Recording/upload checklist
See `docs/DEMO_RECORDING_CHECKLIST.md` (what to click) and `docs/YOUTUBE_PUBLICATION_CHECKLIST.md`
(how to publish).
