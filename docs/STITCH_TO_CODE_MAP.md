# EpistemicOps — Stitch to Code Architecture Map
# Project: 11763955295054994958

This document maps every visual section and component from the Stitch Incident Command Center (`9b7f5176d22b4ad2b0265ad37030669f`) to the real EpistemicOps frontend implementation and backend API contracts.

---

## Architecture Mapping

| Stitch Section | Stitch Visual Element | Production Component | API / Backend Contract | Application State |
|---|---|---|---|---|
| **Top Navigation** | `header` fixed bar, `EPISTEMICOPS` in oxblood | `<TopBar />` in `App.tsx` | `/health` (probes for backend, Hindsight, LLM) | `health`, `runMode`, `view` |
| **Mode Switcher** | `LIVE`, `BASELINE`, `DEMO` pill switcher | `ModeSelector` in `TopBar` | `?baseline=true`, `?demo=true` on `/api/investigate/{id}` | `runMode: "live" \| "baseline" \| "demo"` |
| **Incident Queue** | Left navigation sidebar (`w-72`), `INC-xxx`, severity | `<IncidentList />` in `App.tsx` | `GET /api/incidents` | `incidents: Incident[]`, `selectedId` |
| **Incident Hero** | Top hero banner, severity chips, detection time | `Workbench` Header in `App.tsx` | `GET /api/incidents/{id}` | `selectedIncident: Incident` |
| **Action: Run** | Terracotta button ("RUN INVESTIGATION", `bolt` icon) | Primary Run Button in `Workbench` | `POST /api/investigate/{id}` (SSE stream) | `runPhase`, `handleRun()` |
| **Action: History** | Soft-surface button ("View History" / "Compare") | Compare Button in `Workbench` | `POST /api/runs/compare` | `showCompare`, `comparison` |
| **3D Topology** | `Epistemic Graph Topology`, 3D/Matrix switcher | `<EpistemicGraph />` in `components/three/` | `incident.topology`, `pod_status`, `traces.spans` | `deriveTopology()` state |
| **Service Node** | Terracotta node (`#C66A4A`) with `dns` icon | `ServiceNode` procedural mesh / 2D node | Incident service metadata | `selectedIncident.service` |
| **Memory Node** | Purple orbital constellation (`#80627C`) | `MemoryNode` procedural mesh / 2D node | Hindsight recalled memory count & items | `memoryRecalled`, `memoryCount` |
| **Root Cause Node** | Amber/Critical highlighted node with pulse | `RootCauseNode` procedural mesh | `diagnosis_completed` SSE payload | `diagnosis.root_cause` |
| **Graph Controls** | Overlay buttons (`add`, `remove`, `center_focus_strong`) | Graph toolbar in `EpistemicGraph.tsx` | Camera matrix interpolation | Camera perspective state |
| **Timeline** | Connected vertical stepper with milestone icons | `<Timeline />` in `App.tsx` | Server-Sent Events stream (`AgentEvent`) | `items: TimelineItem[]` |
| **Evidence: Logs** | Dark terminal (`#1A1818`), monospace, tags | Logs view in `Workbench` | `GET /api/incidents/{id}/logs` | `evidence.logs` |
| **Evidence: Metrics**| Sparkline connection pool saturation chart | Metrics view in `Workbench` | `GET /api/incidents/{id}/metrics` | `evidence.metrics` |
| **Evidence: Traces** | Structured span cards with status code badges | Traces view in `Workbench` | `GET /api/incidents/{id}/trace` | `evidence.trace` |
| **Evidence: Pods** | 2-column cards with restarts, CPU, Mem | Pods view in `Workbench` | `GET /api/incidents/{id}/pods` | `evidence.pods` |
| **Hindsight Memory**| Right sidebar (`w-80`), `psychology` icon, count | `<MemoryPanel />` in `App.tsx` | `GET /api/memory/status` | `memStatus: MemoryBankStatus` |
| **Recalled Memory** | Vector match percentage, takeaway narrative | Memory items in `MemoryPanel` | `memory_result` SSE event & recalled list | `items` memory events |
| **Runbook** | Resolution Runbook checklist with status badge | Runbook section in `MemoryPanel` | `GET /api/memory/runbook` | `runbook: Runbook` |
| **Learning Pipeline**| Status (`ACTIVE`), progress bar in `#7A3040` | Retention section in `MemoryPanel` | `POST /api/memory/postmortems/{id}/approve` | `memStatus.approved_count` |
