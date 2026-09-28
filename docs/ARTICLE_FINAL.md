# Giving an SRE incident-response agent a real memory with Hindsight

*Final article draft. Not yet published. Target platform: Dev.to / Medium / Hashnode / LinkedIn
Articles. Word count target 800–1,500. Screenshots and the architecture diagram are marked where
they belong; see `docs/ARTICLE_VISUALS_CHECKLIST.md`.*

## The problem

When a production service falls over, I've noticed the slowest part of the response is rarely the
fix — it's the remembering. "Haven't we seen this connection-pool exhaustion before? What did we
change last time?" That knowledge is scattered across old postmortems, chat threads, and a few
senior engineers' heads. On-call engineers burn their first minutes reconstructing context the
organization already paid to learn once.

## Why stateless incident agents fall short

A stateless AI assistant can read the current logs, metrics, and traces and produce a plausible
diagnosis. What it can't do is say: "this matches INC-001 from three weeks ago — the root cause
was slow `SELECT * FROM products WHERE id=?` queries exhausting the pool, and the fix was an index
on `products.id`." It never accumulates operational expertise, because it has no memory that
survives past the current request. For incident response, that missing memory *is* the value.

So I built **EpistemicOps**: a local-first SRE incident-response agent whose defining feature is a
persistent memory layer built on **Hindsight**, Vectorize's agent memory system.

## Hindsight is the spine, not a RAG bolt-on

It would be easy to describe this as "RAG over postmortems," but that undersells what Hindsight
does. Everything about the "learn from the last outage" story runs through it:

- **Bank** — one self-hosted bank, `epistemic-sre`, holds all incident memory.
- **Retain** — after a diagnosis, a structured postmortem (service, category, root cause, evidence,
  remediation) is written to Hindsight. Raw log lines are deliberately excluded.
- **Recall** — at the start of a run, the agent asks Hindsight for prior incident patterns relevant
  to the *current* incident.
- **Consolidation** — Hindsight's observation engine turns individual postmortems into
  cross-incident observations.
- **Mental Model / runbook** — a Hindsight Mental Model consolidates postmortems into an evolving
  "Microservice Resolution Runbook."

Crucially, EpistemicOps does **not** use chat history as memory. Each run is independent; knowledge
persists in Hindsight and is retrieved by relevance to the incident at hand, not by "what was said
last." That's the difference between a context window and an operational memory.

## One design decision worth calling out

My first implementation used Hindsight's agentic `reflect` for recall. It works, but it's an LLM
call, and on a free LLM tier it hit token-per-minute limits. For "find similar past incidents,"
semantic vector recall is the right primitive — it needs no LLM at all. The recall path is now just
this:

```python
async def query_memory(self, query: str) -> MemoryQueryResult:
    client = _client()
    try:
        response = await client.arecall(
            bank_id=settings.hindsight_bank_id,
            query=query,
            budget="low",
            max_tokens=1024,
        )
        answer = _format_recall(getattr(response, "results", None) or [])
        found = bool(answer)
    except Exception as exc:
        logger.warning("Hindsight query_memory failed: %s", exc)
        answer, found = "", False
    finally:
        await client.aclose()
    ...
```

The recalled text is then injected into the diagnosis prompt. Because recall is provider-independent,
the memory story works reliably even when the LLM is on a strict free tier.

## The before/after that matters

The whole product is a controlled comparison of the *same* incident with memory on versus off.

**Before (baseline, memory skipped):** the agent investigates `inc-003` (a bad-deploy 5xx spike)
from scratch. `memory_used = false`. It reaches a correct diagnosis, but with no awareness that a
related failure was ever seen before.

**After (warm, memory enabled):** the agent first recalls the retained `inc-001` postmortem, injects
that prior context, then investigates. `memory_used = true`. The recalled knowledge is visible in
the timeline before the tools even finish.

I verified this live (agent and Hindsight both on the Groq free tier). Real recorded runs:

| Run | Mode | Recall | `memory_used` | Eval |
|-----|------|--------|---------------|------|
| warm | live | found the inc-001 postmortem | **true** | pass |
| baseline | baseline | skipped | **false** | pass |

Honest note: I do **not** claim the warm run is "faster" — recall adds a step, so elapsed time can
be higher. The value is the recalled prior-incident context, not speed. The comparison view shows
only the actual recorded numbers; nothing is fabricated.

## Architecture

*(Architecture diagram here — see `docs/architecture.md`.)*

```
React + TypeScript + Vite  →  FastAPI (SSE)  →  LangGraph agent
                                                   ├── read-only evidence tools (logs, metrics, trace, pods)
                                                   ├── LLM for diagnosis (Groq free tier by default; Gemini optional)
                                                   └── Hindsight (retain / recall / consolidate / runbook)
```

The agent is a small acyclic state machine — load incident → query memory → investigate → analyze →
validate → produce result → retain postmortem → end — with a hard step cap and a graceful failure
path.

## Realistic data and safety

Incidents are deterministic JSON fixtures with believable logs, metrics, distributed traces, and
pod status. Three are derived from the Apache-2.0 `quantranger/sre-agent-eda-bundle` dataset; two are
hand-authored. The agent's tools are strictly read-only — no shell, no kubectl, no real
infrastructure is ever touched. Hidden "ground truth" used only for scoring is isolated from
everything the agent can see, verified by tests and a live check. All API keys are backend-only and
never reach the browser.

## What I learned (and where it stops)

The lesson that surprised me: the memory layer is only as good as the *retrieval primitive* you pick
for it. Reaching for the agentic `reflect` felt natural, but the humble vector `recall` was both
cheaper and more appropriate — and it's what made the free-tier demo reliable.

Where it stops, honestly:

- Incidents are fixtures, not a live cluster integration.
- On the Groq *free* tier, Hindsight's background consolidation can be rate-limited; recall is
  unaffected, and already-retained postmortems stay fully recallable.
- The evaluator is transparent keyword matching, not a semantic judge.
- Run history is in-memory (resets on backend restart).
- This is a working prototype, not a production-hardened system.

## Try it and learn more

Clone the repo, start Hindsight (Docker) + backend + frontend, add a free `GROQ_API_KEY`, and run
INC-001 followed by a related incident. Watch the Runbook/Memory panel and the memory-used badge on
the warm run.

- Hindsight (GitHub): https://github.com/vectorize-io/hindsight
- Hindsight documentation: https://hindsight.vectorize.io/
- Vectorize (agent memory): https://vectorize.io/what-is-agent-memory

*#AIAgents #AgentMemory #Hindsight #SRE #DevOps #LLM*
