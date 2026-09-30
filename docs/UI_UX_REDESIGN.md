# EpistemicOps — UI/UX redesign

A frontend redesign of EpistemicOps into a calm, information-dense **incident investigation
workbench** for SREs. No backend, agent, Hindsight, ML, or data logic was changed — the UI
consumes the existing REST/SSE APIs.

## Design philosophy

The product is an engineering control room, not an AI dashboard. The interface optimizes for
clarity, information hierarchy, operational usefulness, and — above all — making the **Hindsight
memory loop** visible. It is restrained: borders and spacing over shadows and gradients; dense
rows over big cards; muted semantic color over neon. There is no generic "AI" visual language
(no sparkles, orbs, brains, or gradient "intelligence" cards).

## Inspiration (patterns synthesized, not copied)

- **Linear** — calm navigation, compact density, strong scanability.
- **Sentry / Datadog** — a timeline-centered investigation and progressive disclosure.
- **Opsgenie** — incident list + investigation split view.
- **Vercel / Grafana** — status surfaced first, clear operational semantics.
- **Primer / Atlassian** — consistent tokens, predictable interaction states, accessibility.

None of these products' visual identities are reproduced; the patterns are adapted specifically
for incident response.

## Design tokens (`src/index.css`)

A single `:root` token system drives everything: surfaces (`--canvas #f7f8fa`, `--surface`),
borders, text scale, an accent (`--accent #4f5bd5`), semantic colors (info/success/warning/danger)
and severity colors, an 8px spacing scale (`--s1..--s9`), restrained radii (6/8/999px), two
elevation levels used only for dialogs/drawers, an Inter UI + `ui-monospace` type stack, and a
`140ms` motion token. Color is never the sole status signal — text and iconography accompany it.

## Layout

- **Application shell:** a 220px left sidebar (brand, primary nav — Incidents / Runs / Memory —
  and pinned system health) + a 56px top bar (incident context + mode segmented control) + the
  main area.
- **Incident workbench (default view):** three columns — incident list (300px) · investigation
  (flex) · Hindsight memory (356px).
- **Runs / Memory views:** focused full-width pages reusing the same components.

## Component hierarchy (`src/App.tsx`)

`App` (state, SSE, handlers — preserved) → `Sidebar`, `TopBar` (inline), `ModeSelector`,
`IncidentList` / incident rows, `Workbench` (`incident header`, `Timeline`, `EvidencePanel`,
`DiagnosisSummary`), `MemoryPanel` (memory state, bank stats, runbook, learning, postmortems,
reset), `RunsView`, `MemoryView`, `CompareDialog`, and primitives (`Dot`, `SeverityBadge`,
`StateBadge`, `Stat`, `EmptyState`, `ErrorBlock`). Components are domain-named and kept in one
cohesive module rather than fragmented into trivial files.

## The investigation timeline

The center panel is a chronological, client-timestamped stream of **safe operational events**
only — incident loaded, memory recalled, evidence inspected, analysis, diagnosis, postmortem
retained. No chain-of-thought or private reasoning is ever shown. A vertical connector conveys
chronology; a live pulsing node marks in-progress runs.

## Evidence

A tabbed evidence area renders **real fixture data** from the existing
`/api/incidents/{id}/{logs,metrics,trace,pods}` endpoints. Tabs appear only when the modality
exists. Metrics are point values, so they render as a compact metric grid — **no fabricated
charts or time-series**. Traces and pods render as dense tables.

## Hindsight memory (the differentiator)

The right rail is titled **Hindsight memory** (SRE language, not "AI Memory"). It surfaces the
memory state (skipped / recalling / recalled), bank reachability + counts, the Microservice
Resolution Runbook with its consolidation status, a learning checklist (postmortem retained /
consolidation / mental model), and per-incident postmortems with approve/reject and a guarded
bank reset. Every value comes from the live backend; nothing is fabricated.

## Memory state semantics

Neutral (off) · info (recalling) · memory-accent (recalled) · warning (consolidating) ·
danger (failed). Each state carries text + a status dot, never color alone.

## Responsive behavior

- **≥1200px:** full three-column workbench.
- **768–1199px:** two columns; the memory panel becomes a right-side **drawer** via a "Memory"
  toggle in the incident header.
- **<900px:** the sidebar collapses; **<768px:** single column — incident list, then
  investigation, evidence, diagnosis, and the memory drawer.

## Accessibility

Visible `:focus-visible` outlines; semantic buttons and `role`/`aria` on nav, tabs, the mode
`tablist`, the timeline (`role="log"`, `aria-live`), and the comparison dialog (`role="dialog"`,
`aria-modal`); status conveyed by text + shape, not color alone; `prefers-reduced-motion`
disables animation; touch-sized controls on mobile.

## Why this fits SRE incident response

An on-call engineer scans the incident inbox, opens one incident, watches the investigation
stream, reads the evidence that justifies the diagnosis, and — the point of the product — sees
whether prior incident knowledge was recalled from Hindsight and how it changed the result. The
cold → investigate → retain → recall → memory-informed loop is the spine of the layout, not a
side panel.
