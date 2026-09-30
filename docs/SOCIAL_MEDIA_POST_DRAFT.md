# DRAFT — Social media post

> Status: DRAFT. Not posted. Confirm platform, tags, and mentions against the official
> Content Guide (`docs/CONTENT_GUIDE_GAP.md`) before posting. No engagement numbers or user
> feedback are invented.

## LinkedIn / X version (long)

Most AI incident assistants forget everything the moment an outage ends. That's the wrong
design for on-call work, where the slowest step is *remembering how the last similar failure
was fixed*.

So I built **EpistemicOps** for the "AI Agents That Learn Using Hindsight" hackathon — an SRE
incident-response agent whose whole point is memory.

🔹 Cold incident: agent investigates logs/metrics/traces/pods, diagnoses, writes a postmortem.
🔹 Hindsight retains + consolidates that postmortem into an evolving runbook.
🔹 Warm incident: a related outage recalls the prior knowledge before investigation.
🔹 Baseline mode turns memory off, so you can see the difference directly.

Stack: React + TypeScript + Vite · FastAPI · LangGraph · Gemini · **Hindsight** (the memory
layer) · deterministic incident fixtures · SSE streaming. Read-only and safe — no real
infrastructure is ever touched.

Memory isn't a feature here; it's the product.

#Hindsight #AIagents #SRE #DevOps #IncidentResponse #LangGraph

## Short version (X / 280 chars)

EpistemicOps: an SRE incident agent that actually remembers. Cold outage → postmortem →
Hindsight consolidates a runbook → the next similar outage recalls it. Baseline mode shows the
memory-off vs memory-on difference. Built with LangGraph + Hindsight. #Hindsight #AIagents #SRE

## Notes
- Attach a screenshot or the demo video once recorded.
- Replace links/handles per the Content Guide.
