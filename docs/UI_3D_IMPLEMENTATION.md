# EpistemicOps — 3D & UI Implementation Specification

## 1. Overview
This document specifies the technical implementation of the EpistemicOps 3D Observability Command Center, bridging the visual design from Stitch (`15177239832718407707`) with the real EpistemicOps backend execution model.

---

## 2. 3D WebGL Architecture (`EpistemicGraph.tsx`)

### Core Technologies
- **Three.js** `^0.169.0`: Core WebGL 3D rendering engine.
- **@react-three/fiber** `^8.18.0`: Declarative React renderer for Three.js.
- **@react-three/drei** `^9.120.0`: Helper library providing `OrbitControls`, `Billboard`, `Text`, `Line`, and camera controllers.
- **Motion for React** `^12.4.1`: Fluid interface transitions and animations.

### Code Splitting & Performance
- The 3D component is code-split using `React.lazy(() => import("./components/three/EpistemicGraph"))` wrapped in a `<Suspense>` fallback.
- **Device Pixel Ratio Cap**: Dynamically throttled according to quality level selected in the TopBar:
  - `High`: `Math.min(window.devicePixelRatio, 2.0)` with antialiasing enabled.
  - `Balanced`: `1.5` with antialiasing.
  - `Low`: `1.0` without antialiasing.
- **Frameloop Optimization**: R3F renders on demand or with requestAnimationFrame smoothly tied to active investigation state.
- **Resource Disposal**: Geometries and materials are reused procedurally; event listeners are cleanly cleaned up on component unmount.

### Procedural Geometry & Node Semantics
Nodes represent real architectural infrastructure:
| Infrastructure Component | 3D Geometry | Default Color | Active/Root-Cause Color |
|---|---|---|---|
| **Central Service** | `SphereGeometry(0.44)` | `#6366F1` (Indigo) | `#FF6B35` (Root Cause) / `#22D3EE` (Investigating) |
| **Relational Database** | `CylinderGeometry(0.38, 0.38, 0.55)` | `#38BDF8` (Cyan) | State-derived |
| **Cache Store** | `OctahedronGeometry(0.42)` | `#F59E0B` (Amber) | State-derived |
| **Message Queue / Broker** | `BoxGeometry(0.65, 0.32, 0.32)` | `#EC4899` (Pink) | State-derived |
| **Kubernetes Pod** | `SphereGeometry(0.22)` | `#22C55E` / `#EF4444` | Based on Pod Status |
| **Recalled Memory Node** | `SphereGeometry(0.18)` | `#A78BFA` (Purple) | Constellation above service |

---

## 3. Real Application State Synchronization

The 3D scene reacts exclusively to real application and SSE events via `deriveTopology()`:

```
SSE: run_started           --> Scene initializes, camera frames cluster
SSE: tool_started (logs)   --> Central service activates cyan pulse ring
SSE: tool_started (traces) --> Dependency edges highlight with cyan glow
SSE: memory_recalled       --> Memory constellation nodes & purple links appear
SSE: diagnosis_completed   --> Root-cause node turns orange with pulsing ring
SSE: run_completed         --> Status badge updates, camera gently settles
SSE: run_failed            --> Affected node turns crimson with warning badge
```

---

## 4. Camera Controls & Toolbar Interactions

The 3D canvas includes a dedicated overlay toolbar matching the Stitch Command Center:
- **RESET**: Resets the camera to default vantage point `[0, 3, 8]` facing origin `[0, 0, 0]`.
- **FOCUS ROOT**: Finds the active root-cause or investigating node in real-time and animates camera focus directly to that node's coordinates.
- **FIT GRAPH**: Computes the 3D bounding box (`THREE.Box3`) of all current nodes and dynamically adjusts camera zoom to frame all elements.
- **3D / 2D TOGGLE**: Allows switching seamlessly between 3D WebGL mode and the accessible 2D SVG topology view.

---

## 5. Accessible 2D Fallback (`EpistemicGraph2D`)

When WebGL is unavailable, disabled, or if the user prefers reduced motion / 2D view:
- A pure SVG-based interactive topology graph renders instantly.
- Maintains 100% feature parity: node selection, status colors, memory links, dependency paths, and node details drawer.
- Zero WebGL context required; fully compatible with screen readers and low-power devices.

---

## 6. Motion & Accessibility

- **Prefers-Reduced-Motion**: Respects user OS preference by suppressing camera fly animations and continuous orbit rotations.
- **ARIA & Keyboard Navigation**:
  - Interactive nodes and buttons feature descriptive `aria-label`s.
  - Visible focus rings (`--ring: #5DE6FF`) on keyboard navigation.
  - 3D is purely supplemental: all incident diagnostics, root-cause findings, logs, metrics, traces, and runbook steps are presented in semantic, accessible HTML.

---

## 7. Responsive Breakpoints

- **Desktop (>= 1280px)**: 3-column command center layout (Sidebar + Workbench + Memory Panel).
- **Tablet (768px - 1024px)**: 2-column layout (Collapsible Sidebar, stacked Workbench and Memory Panel).
- **Mobile (< 768px)**: Single column with scrollable tabs for Graph, Timeline, Evidence, and Hindsight Memory.
