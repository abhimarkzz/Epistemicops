# Content-Guide Challenge Mapping

Requirement 32 asks that the submission be "based on the required content-guide challenge/topic."
The official Content Guide document was not available (see `CONTENT_GUIDE_GAP.md`), but the
hackathon **problem statement** — which the participant supplied — defines the challenge track and
its example project categories. This document maps EpistemicOps to that challenge using concrete,
verifiable project functionality.

> Status update: the official Content Submission Guide requirements have been supplied
> (`docs/CONTENT_GUIDE.md`) and concern article/social/video **format**, not a different challenge
> definition. The challenge/track is the DevOps **Incident Response Agent**, which EpistemicOps
> implements and live-verifies. Requirement **32 is COMPLETE** (challenge fit documented + verified).
> Requirement **31 is PARTIAL** — drafts comply with the guide, but publication (article URL, Reddit,
> social, YouTube) is a remaining human action; see `OFFICIAL_CONTENT_GUIDE_MATRIX.md`.

## The challenge

- **Hackathon:** "AI Agents That Learn Using Hindsight" (Vectorize).
- **Required technology:** Hindsight (mandatory).
- **Category chosen:** Engineering & DevOps.
- **Named example idea:** *Incident Response Agent* — from the problem statement's own table:
  "Remembers past incidents, their root causes, resolution steps, and which runbooks worked.
  Learns from post-mortems to suggest faster fixes for similar issues." Business case: "When
  production is down, every minute counts. An agent that recalls exactly how similar incidents
  were resolved before is invaluable."

EpistemicOps is a direct implementation of that exact idea.

## Point-by-point mapping

| Challenge expectation | EpistemicOps implementation | Evidence |
|-----------------------|-----------------------------|----------|
| Uses Hindsight | Self-hosted Hindsight bank `epistemic-sre`; retain/recall/consolidate/runbook | `docker-compose.yml`, `backend/app/memory/service.py` |
| Remembers past incidents | Postmortems retained per incident, recalled by semantic vector search | `retain_incident`, `query_memory` (`arecall`) |
| Root causes / resolution steps / runbooks | Structured diagnosis + remediation retained; Hindsight Mental Model "Microservice Resolution Runbook" | `agent/prompts.py`, `MemoryService.get_runbook` |
| Learns from postmortems | Retain → consolidate → recalled on later incidents | live warm run recalled inc-001 (`memory_used=true`) |
| Faster/better fixes for similar issues | Warm run injects recalled prior-incident context into the diagnosis | `test_recalled_memory_enters_prompt_on_warm_run` |
| "Every minute counts" (real business case) | On-call MTTR reduction via recalled runbooks; realistic incident fixtures | `data/incidents/*.json`, `docs/ARTICLE_FINAL.md` |
| Memory central (25% judging) | Cold/warm/baseline comparison IS the product; remove Hindsight → nothing left | `docs/HINDSIGHT_EXPLANATION.md` |
| Realistic data (guide emphasis) | Deterministic fixtures with real-looking logs/metrics/traces/pods; Apache-2.0 dataset attributed | `ATTRIBUTIONS.md` |
| Tight scope (guide emphasis) | Read-only tools; no k8s mutation, no shell/kubectl | `agent/tools.py`, README "Not in scope" |
| Demo story: cold → learn → warm | Live-verified: cold retains, warm recalls, baseline skips, compare on real runs | `docs/DEMO_SCRIPT.md`, run records |

## Judging-dimension evidence (no self-score)

| Dimension (weight) | Concrete evidence |
|--------------------|-------------------|
| Innovation (30%) | Memory-as-runbook for SRE; built-in cold/warm/baseline comparison; transparent keyword evaluator |
| Hindsight memory (25%) | Central retain→recall→consolidate→runbook loop; live `memory_used=true` from real recall |
| Technical (20%) | LangGraph acyclic agent, 146 tests, ground-truth isolation, provider abstraction |
| UX (15%) | 3-column dashboard, SSE timeline, memory-used badge, compare view; no chain-of-thought exposed |
| Real-world impact (10%) | Credible on-call workflow; realistic incidents; safe read-only scope |

## Conclusion
EpistemicOps maps cleanly onto the challenge's DevOps Incident-Response track with concrete,
tested functionality. The only thing preventing a fully **VERIFIED** status on requirement 32 is
that the gated Content Guide's exact challenge wording/format was not available for confirmation.
