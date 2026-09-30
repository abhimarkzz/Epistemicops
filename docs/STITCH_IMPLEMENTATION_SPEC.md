# EpistemicOps — Stitch Implementation Specification
# Project: 11763955295054994958 ("EpistemicOps Incident Command Center")

## 1. Visual Source of Truth
- **Stitch Project ID:** `11763955295054994958`
- **Screen:** `Incident Command Center` (`9b7f5176d22b4ad2b0265ad37030669f`, 2560x4440)
- **Design Theme:** Warm, editorial SRE command center with living operational memory (Hindsight).

---

## 2. Color System & Design Tokens

### Canvas & Surfaces
| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#F4F0E8` | Deep warm canvas background |
| `--surface` | `#FBF9F5` | Primary card and workbench surface |
| `--soft-surface` | `#E9E3D8` | Secondary container, pill backgrounds |
| `--surface-container-low` | `#FFF0F1` | Tinted subtle card surface |
| `--surface-container` | `#FAEAEB` | Elevated container surface |
| `--surface-container-high` | `#F4E5E5` | Hovered card state |
| `--border` | `#D4CCBF` | Subtle warm hairline boundary (1px solid) |
| `--border-strong` | `#867274` | Active and focused boundary |

### Typography & Text Colors
| Token | Hex | Role |
|---|---|---|
| `--primary-text` | `#2B2723` | High-contrast espresso body and headline text |
| `--secondary-text` | `#6E675F` | Subtitles, timestamps, metadata |
| `--muted-text` | `#91897F` | Subtle annotations and placeholders |

### Brand Accents
| Token | Hex | Role |
|---|---|---|
| `--oxblood` | `#7A3040` | Primary brand accent, titles, active tabs |
| `--terracotta` | `#C66A4A` | Primary action button ("RUN INVESTIGATION"), service nodes |
| `--copper` | `#B77A52` | Warm secondary accent |
| `--dusty-plum` | `#7B6678` | Secondary memory tag |

### Semantic Operational Status
| Token | Hex | Role |
|---|---|---|
| `--critical` | `#A83B3B` | Critical severity, pool exhaustion, failed runs |
| `--warning` | `#B56A28` | Warning alerts, degraded performance, latency spikes |
| `--success` | `#4F7557` | Healthy services, live execution ping, passing evaluation |
| `--info` | `#4F6F82` | Informational telemetry |
| `--hindsight-memory` | `#80627C` | Hindsight recalled memory, constellation nodes, vector match tags |
| `--sage` | `#6B775E` | Supporting healthy services |
| `--warm-teal` | `#4E7773` | Supporting infrastructure nodes |

---

## 3. Typography Hierarchy

- **Headline LG:** `Inter`, 32px / line-height 40px, weight 600
- **Headline MD:** `Inter`, 24px / line-height 32px, weight 600
- **Headline SM:** `Inter`, 18px / line-height 24px, weight 600
- **Body LG:** `Inter`, 16px / line-height 24px, weight 400
- **Body MD:** `Inter`, 14px / line-height 20px, weight 400
- **Body SM:** `Inter`, 12px / line-height 16px, weight 400
- **Code MD:** `JetBrains Mono`, 13px / line-height 18px, weight 400
- **Code SM:** `JetBrains Mono`, 11px / line-height 14px, weight 400
- **Label MD:** `JetBrains Mono`, 12px / line-height 16px, weight 500

---

## 4. Radii & Spacing

- **Radius:**
  - `sm`: 4px (0.25rem)
  - `DEFAULT`: 8px (0.5rem)
  - `lg`: 8px
  - `xl`: 12px (0.75rem)
  - `full`: 9999px (pills, badges)
- **Spacing:**
  - `xs`: 4px
  - `sm`: 8px
  - `md`: 16px
  - `lg`: 24px
  - `xl`: 40px
  - `gutter`: 24px

---

## 5. Component Specifications

### Header
- Fixed height: 64px (`h-16`).
- Background: `#FBF9F5` with 90% opacity and subtle backdrop blur.
- Brand: `EPISTEMICOPS` in uppercase `font-headline-sm` with letter spacing and `text-oxblood` (`#7A3040`).
- Mode switcher: Pill container in `#E9E3D8` with `LIVE`, `BASELINE`, `DEMO` buttons. Active mode uses `bg-primary text-on-primary` (`#5D1A2A` / `#7A3040`).
- Telemetry chips: Live indicator dots for `Backend` (green), `Hindsight` (green), `LLM` (green/amber).
- Avatar: 32px circle in `#5D1A2A` with `person` icon.

### Left Navigation / Incident Queue
- Fixed width: 288px (`w-72`).
- Header: `Incident Queue` with `filter_list` icon.
- Cards: Incident ID (`INC-xxx`), severity chip (`CRITICAL` in `#FFDAD6` / `#93000A`, `WARNING` in `#B56A28`), title, and active card highlighted with `bg-primary-container text-on-primary-container` (`#7A3040`).

### Incident Hero Banner
- Surface: `#FBF9F5` with rounded-xl border and subtle warm drop shadow.
- Severity row: `INC-xxx` pill, `CRITICAL` badge, and detection timestamp.
- Title: Large 32px headline in `#2B2723`.
- Actions:
  - `View History` / `Compare`: Secondary soft-surface button with `history` icon.
  - `RUN INVESTIGATION`: Terracotta `#C66A4A` primary button with `bolt` icon.

### Epistemic Graph 3D Topology
- Container: 380px height on `#F4F0E8` canvas with subtle radial dot pattern.
- Header: `hub` icon in `text-oxblood`, title `Epistemic Graph Topology`, and view switcher (`3D View`, `Matrix`, `Trace`).
- Procedural Geometries:
  - Service: Sphere in Terracotta `#C66A4A`.
  - Database: Cylinder in Critical `#A83B3B` or Sage `#6B775E`.
  - Hindsight Memory: Floating purple orbital constellation in `#80627C`.
  - Root Cause: Highlighted node in `#B56A28` / `#A83B3B`.
- Controls: Floating bottom-right controls (`add`, `remove`, `center_focus_strong`, and 3D/2D toggle).
- Legend: Four indicator swatches matching Stitch: Service (`#C66A4A`), Memory (`#80627C`), Critical (`#A83B3B`), Healthy (`#6B775E`).

### Investigation Timeline
- Header: `timeline` icon in `text-oxblood`, `Agent Investigation Timeline`, live execution badge with pulsing dot.
- Timeline Stepper: Connected vertical line in `#D4CCBF` with circular milestone icons (`check` in green, `psychology` in `#80627C`, `search` in primary).

### Evidence Tabs
- Tabs: `Logs Stream`, `Metrics`, `Traces`, `Pods` with active tab indicated by `#7A3040` text and 2px bottom border.
- Logs: Technical dark viewer (`#1A1818`) with `#E9E3D8` monospace text, colored severity tags.
- Metrics: Sparkline charts showing connection saturation and latency.
- Traces & Pods: Clean status cards with response codes and pod metrics.

### Hindsight Memory & Runbook Panel
- Fixed right width: 320px (`w-80`).
- Header: `Hindsight Memory` with `psychology` icon, `recalled count` badge in `#80627C`.
- Recalled cards: Similarity match score pill, failure pattern takeaway.
- Resolution Runbook: Ready badge in `#4F7557`, actionable steps with checkboxes and timestamps.
- Learning status: Active pipeline status badge, postmortem auto-retention bar in `#7A3040`.
