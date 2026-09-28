# DRAFT — Article: "EpistemicOps: giving an SRE agent a memory with Hindsight"

> Status: DRAFT. Not published. Adjust platform/length/tags once the official Content Guide
> is available (see `docs/CONTENT_GUIDE_GAP.md`).

## The problem

When a production service falls over at 3 a.m., the slowest part is rarely the fix — it's
the remembering. "Didn't we see this connection-pool exhaustion last quarter? What did we
change?" That knowledge lives in scattered postmortems, Slack threads, and a few senior
engineers' heads. Most AI incident assistants don't help here, because they're stateless:
every incident starts from zero.

## Why stateless incident agents fall short

A stateless agent can read the current logs and metrics and produce a plausible diagnosis.
But it can't say "this looks like INC-001 from three weeks ago, and the fix was to add an
index on `products.id`." It never accumulates operational expertise. For incident response,
that missing memory is the whole game.

## EpistemicOps

EpistemicOps is a local-first SRE incident-response agent whose defining feature is a
persistent memory layer built on **Hindsight** (Vectorize's agent memory system). It runs a
bounded LangGraph agent over deterministic incident fixtures, produces a structured diagnosis,
writes a postmortem back into Hindsight, and lets Hindsight consolidate those postmortems into
an evolving runbook. The next similar incident is investigated with that prior knowledge
recalled.

## Why Hindsight is central

Memory isn't a bolt-on here — it's the product. The core demo is a direct comparison:

- **Baseline mode** skips memory entirely (`memory_used=false`).
- **Warm mode** queries Hindsight first; when a relevant past postmortem exists, it's recalled
  and injected into the diagnosis.

Hindsight handles retention, recall (vector + reflection), consolidation, and the Mental Model
runbook. A raw recall query for "connection pool exhausted" returns the earlier INC-001
postmortem as the top hit — memory works even without a live LLM.

## Architecture

```
React + TypeScript + Vite  →  FastAPI (SSE)  →  LangGraph agent
                                                   ├── read-only evidence tools (logs, metrics, trace, pods)
                                                   ├── Gemini (gemini-3.8-flash) for diagnosis
                                                   └── Hindsight (retain / recall / consolidate / runbook)
```

The agent graph is a small acyclic state machine: load incident → query memory → investigate →
analyze → validate → produce result → retain postmortem → end, with a hard step cap and a
graceful failure path.

## Cold vs warm

1. **Cold:** a new incident, no relevant memory, full investigation, postmortem retained.
2. **Consolidate:** Hindsight turns postmortems into cross-incident observations and a runbook.
3. **Warm:** a related incident recalls the prior postmortem and diagnoses with that context.

## Realistic, safe data

Incidents are deterministic JSON fixtures with believable logs, metrics, traces, and pod
status. Three are derived from the Apache-2.0 `quantranger/sre-agent-eda-bundle` dataset
(attribution in `ATTRIBUTIONS.md`); two are hand-authored. Hidden ground truth used for
scoring is strictly isolated from anything the agent can see. The tools are read-only — no
shell, no kubectl, no real infrastructure is ever touched.

## Honest limitations

- The live "warm improvement" demo needs a working free-tier LLM key. During development the
  Gemini key hit free-tier access/quota limits (HTTP 403/429); the hackathon-recommended Groq
  free tier is a drop-in alternative. Demo mode replays a deterministic run with no LLM.
- Incidents are fixtures, not a live cluster integration.
- The evaluator is transparent keyword matching, not a semantic judge.
- Run history is in-memory (resets on backend restart).

## What's next

- Optional Groq/other free-tier provider selector for reliable live demos.
- Real telemetry connectors (Prometheus/Loki) behind the same read-only tool interface.
- Richer runbook rendering as memory accumulates.

## Try it

Clone the repo, start Hindsight (Docker) + backend + frontend, and run INC-001, then a related
incident. Watch the Runbook/Memory panel fill and the memory-used badge light up on the warm
run. Full steps are in the README.
