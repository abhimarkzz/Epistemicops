# How EpistemicOps uses Hindsight

Hindsight is the memory layer that makes EpistemicOps more than a one-shot incident
analyzer. Every part of the "learn from the last outage" story runs through it.

## The bank

All memory lives in a single Hindsight bank, `epistemic-sre` (self-hosted via Docker,
API on `:8888`, control UI on `:9999`). The bank is created idempotently on backend
startup (`MemoryService.initialize`) with a retain mission that tells Hindsight to keep
*structured incident patterns* — service, failure category, root cause, evidence keywords,
remediation — and explicitly **not** raw log lines.

## The five things we do with it

1. **Retain** — after a diagnosis, `MemoryService.retain_incident` writes a postmortem
   (`document_id = incident_id`, tagged with service/category) via `client.aretain(...)`.
   Raw logs are deliberately excluded; only synthesized findings are stored.
2. **Recall** — at the start of a run, `query_incident_patterns` calls Hindsight's
   semantic `recall` (vector search) to surface prior patterns for the current incident.
   Recall is the right primitive for "find similar past incidents": it needs no LLM call,
   so it is fast and free of provider rate limits. A query for "connection pool exhausted"
   returns the inc-001 postmortem as the top hit, and that text is injected into the
   diagnosis prompt. (This is why memory works reliably on a free LLM tier — recall never
   depends on the model.)
3. **Consolidate** — Hindsight's observation engine (`HINDSIGHT_API_ENABLE_OBSERVATIONS=true`)
   turns individual postmortems into cross-incident observations. This has been observed
   running live ("consolidation completed: 2 processed").
4. **Mental Model / runbook** — a Hindsight Mental Model, "Microservice Resolution Runbook,"
   consolidates retained postmortems into an evolving SRE runbook (`trigger: delta,
   refresh_after_consolidation`). The UI surfaces its status (generating / stale / current).
5. **Approval + reset** — a small local store (`data/memory_state.json`) tracks whether each
   retained postmortem is pending/approved/rejected, so unvetted knowledge is visibly
   distinguished from trusted knowledge. `reset_bank` wipes **only** the `epistemic-sre`
   bank and the approval store — no other Hindsight bank is touched.

## Why memory is central, not decorative

The product's core comparison is memory-on vs memory-off:

- **Baseline mode** (`?baseline=true`) sets `skip_memory=True`, so the agent never queries
  Hindsight — `memory_used=false`.
- **Live (warm) mode** queries Hindsight first; when a relevant prior postmortem is found,
  `memory_used=true` and that context is injected into the diagnosis prompt.

The Runbook/Memory column, the `memory_used` badge, and the run comparison table all exist
specifically to make the value of memory visible. Remove Hindsight and the product loses its
reason to exist — which is the point.

## Why chat history is not the memory mechanism

EpistemicOps deliberately does **not** rely on conversation/chat history. Each incident run is
independent; there is no chat transcript carried between them. Operational knowledge persists
in Hindsight as structured postmortems and consolidated observations, and is retrieved by
semantic relevance to the *current* incident — not by "what was said last." That is what lets
a warm run benefit from an incident investigated days earlier, which a chat-history window
would miss or truncate.

## LLM provider (and why memory is provider-independent)

The agent's diagnosis and Hindsight's fact-extraction/consolidation use a configurable LLM
provider — **Groq** (free tier, `openai/gpt-oss-120b`) by default when `GROQ_API_KEY` is set, or
Gemini. **Recall itself uses vector search and needs no LLM**, so surfacing prior incidents works
regardless of provider quota. On a free LLM tier, background consolidation may be rate-limited,
but recall of already-retained postmortems is unaffected.

## Runbook (Mental Model) state — honest behavior

The runbook narrative is produced by Hindsight **consolidating** retained postmortems through the
LLM. On the Groq **free** tier this consolidation batches several memories into one call and can
exceed the tokens-per-minute limit, so it is deferred/retry-blocked; the mental model then stays
at Hindsight's `"Generating content…"` placeholder. The UI reflects this **truthfully**: it shows
a *"Consolidation pending"* state with a note that it can be rate-limited on the free tier and that
**recall works without it** — it never claims the runbook is ready when it is not, and never spins
indefinitely pretending completion is imminent. `↻ Refresh Runbook` retries. Recall, retain, and
the memory-used comparison (the core loop) do not depend on the runbook narrative.

## Isolation and safety

- The bank id is fixed; reset and retain only ever touch `epistemic-sre`.
- All LLM keys (agent and Hindsight) are backend-only and never reach the browser.
- Postmortems store patterns and evidence references, not raw logs, keeping the memory
  compact and free of noise.
