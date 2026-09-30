# EpistemicOps — 3D Observability UI Design Architecture

A functional 3D WebGL and motion redesign of EpistemicOps into a dark, spatial, technical incident-response command center. The system introduces the **Epistemic Graph** — an interactive 3D topology and memory constellation powered by React Three Fiber and procedural Three.js geometry, directly synchronized with backend incident state and Hindsight memory events.

---

## 1. Visual Concept & Design Philosophy

EpistemicOps is designed as an **engineering command center**, not a generic AI dashboard. 

### Core Principles
- **Spatial & Data-Driven:** Every 3D node and edge represents a real architectural component (microservice, database, cache, message queue, dependency, or Kubernetes pod) or an actual dependency relationship from incident fixtures or trace spans.
- **Calm, High-Contrast Restraint:** Dark obsidian surfaces (`#070A0F`, `#0D1118`, `#111722`) with razor-sharp borders (`#1E2733`) and purposeful semantic lighting. Color is reserved strictly for operational state (green for healthy, amber for warnings, red for critical/failed, cyan for active investigation, orange for root cause, and purple for Hindsight memory).
- **Zero Decorative Gimmicks:** No floating brains, glowing orbs, decorative robots, crystals, or meaningless particles. Every visual motion is tied to real application state.

---

## 2. Color System & Design Tokens

Centralized tokens defined in `frontend/src/index.css` and utilized across standard 2D components and the 3D WebGL scene:

### Surfaces
- `--bg: #070A0F` — Deep void canvas background
- `--surface: #0D1118` — Primary panel & workbench surface
- `--surface-2: #111722` — Elevated cards, secondary navigation, and graph base
- `--surface-3: #161D2A` — Active segmented control, hovered rows
- `--border: #1E2733` — Default hairline boundary (1px solid)
- `--border-strong: #2A3545` — Active and focused border states

### Operational & Semantic Colors
- `--success: #22C55E` — Healthy services and passing evaluations
- `--warning: #F59E0B` — Warning thresholds, pending pods, degraded performance
- `--critical: #EF4444` — Critical severity, crash loops, failed investigations
- `--investigating: #22D3EE` — Active agent inspection pulses and trace highlights
- `--root-cause: #FF6B35` — Diagnosed incident root cause node
- `--memory: #A78BFA` — Hindsight recalled memories and memory constellation nodes
- `--indigo: #6366F1` — Primary action and selection indicators

---

## 3. Typography

- **UI & Navigation:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto` (weights: 400, 500, 600, 700). High legibility at compact sizes (11px–14px).
- **Technical Telemetry:** `JetBrains Mono`, `ui-monospace`, `SF Mono`, `Menlo` (weights: 400, 500, 600). Applied to incident IDs, pod names, timestamps, log streams, SQL/metrics, and trace spans.

---

## 4. 3D Architecture (`EpistemicGraph.tsx`)

Built on **React Three Fiber (v8)**, **@react-three/drei (v9)**, and **Three.js (r169)**. Code-split with `React.lazy()` and `Suspense` to preserve instant initial page load.

### Scene Composition
- **Canvas:** Alpha transparency, antialiasing controlled by quality level, device pixel ratio clamped (`Math.min(window.devicePixelRatio, 2)` for High, `1.5` for Balanced, `1.0` for Low).
- **Lighting:**
  - `ambientLight` (intensity 0.35) for base scene illumination
  - `directionalLight` (intensity 0.65, `#B8C4D4`) for directional depth
  - `pointLight` (intensity 0.35, `#6366F1`) for brand rim lighting
  - `pointLight` (intensity 0.20, `#22D3EE`) for inspection contrast
- **Procedural Geometries:**
  - **Services / Nodes:** Sphere (`SphereGeometry(0.44)`)
  - **Databases:** Cylinder (`CylinderGeometry(0.38, 0.38, 0.55)`)
  - **Caches:** Octahedron (`OctahedronGeometry(0.42)`)
  - **Message Queues:** Box (`BoxGeometry(0.65, 0.32, 0.32)`)
  - **Kubernetes Pods:** Small Sphere (`SphereGeometry(0.22)`)
- **Materials:** Standard PBR materials (`MeshStandardMaterial`) with roughness (0.65) and metalness (0.35) combined with emissive intensity tuned to active state (0.45 for investigating, 0.5 for root-cause).

---

## 5. Topology Semantics & State Derivation

The topology is dynamically derived from real backend data:
1. **Legacy Fixtures (`inc-001`, `inc-002`):** Directly maps `incident.topology` dependencies (e.g. `postgresql-orders`, `redis-sessions`, `inventory-service`) orbiting the central service.
2. **Kubernetes & Microservice Fixtures (`inc-003` to `inc-005`):** Derives pods from `pod_status` and external service dependencies from OpenTelemetry `traces.spans`.
3. **State Mapping:**
   - **Healthy:** Green emissive tint.
   - **Investigating:** Cyan animated pulse ring when tools (`get_logs`, `get_metrics`, `get_pod_status`) are executed.
   - **Trace Active:** Dependency edges highlight with cyan glow and increased line width.
   - **Root Cause:** Orange/red highlight with outer glow ring when diagnosis is confirmed.
   - **Failed:** Red state when an investigation fails.

---

## 6. Hindsight Memory Visualization

When Hindsight recalls prior incident knowledge:
- A subtle **Memory Constellation** of purple nodes orbits directly above the primary service.
- Subtle purple connection lines link each recalled memory to the service node.
- A floating Billboard label displays the exact recalled count: `"{count} memories recalled"`.
- If zero memories are found, the UI displays an explicit `"No memory recalled"` indicator in the footer, with **zero fake 3D nodes**.

---

## 7. Interactive Controls & Camera Management

- **Orbit Controls:** Smooth pan, zoom, and rotate with damping factor (`0.06`).
- **Node Selection:** Clicking any node highlights it with an indigo/cyan selection ring and opens the **Service Details Panel**.
- **Double-Click Focus:** Double-clicking any 3D node automatically animates the camera to frame that specific node.
- **Toolbar Actions:**
  - **Fit View:** Dynamically computes the bounding box (`THREE.Box3`) of all topology nodes and smoothly positions the camera to frame the entire system.
  - **Reset:** Instantly resets camera to default perspective `[0, 3, 8]` centered at `[0, 0, 0]`.
  - **3D / 2D Toggle:** Switches seamlessly between the 3D WebGL scene and the 2D SVG topology fallback.

---

## 8. Accessible 2D Topology Fallback

When WebGL is unavailable or when the user toggles 2D Mode:
- Renders an interactive SVG-based topology graph (`<EpistemicGraph2D>`).
- Renders identical node statuses, type glyphs (`SVC`, `DB`, `MEM`, `Q`, `POD`), labels, and edges.
- Animated dash arrays for active dependency edges (`stroke-dasharray="4 3"`).
- Memory arc across the top displaying recalled memory counts.
- Full keyboard accessibility: each node is keyboard-focusable (`tabIndex={0}`, `role="button"`), with Enter and Space key handlers to trigger service inspection.

---

## 9. Performance Strategy

- **Dynamic DPR Capping:** Capped based on user quality setting (`High` = 2.0, `Balanced` = 1.5, `Low` = 1.0).
- **Lazy Code-Splitting:** Dynamic `import('./components/three/EpistemicGraph')` ensures the Three.js runtime is only loaded when viewing the incident workbench.
- **Polygon Optimization:** Quality settings reduce sphere and cylinder radial segments on low-power devices.
- **Resource Cleanup:** Materials and geometries are managed and cleaned up by React Three Fiber on unmount.

---

## 10. Motion System & Accessibility

- **Standard UI Transitions:** 120ms–140ms ease-out transitions for buttons, tabs, drawers, and status indicators.
- **Respects `prefers-reduced-motion`:**
  - Detects `(prefers-reduced-motion: reduce)`.
  - Disables OrbitControls `autoRotate`.
  - Disables floating oscillation jitter on 3D meshes.
  - Switches camera transitions from smooth lerp interpolation to instantaneous framing.

---

## 11. External Dependencies & Asset Attributions

All 3D shapes are **100% procedurally generated** Three.js geometries. No external runtime 3D models (GLTF/GLB/OBJ) or third-party asset CDNs are required.

- `three` (v0.169.0) — MIT License
- `@react-three/fiber` (v8.18.0) — MIT License
- `@react-three/drei` (v9.120.0) — MIT License
- `motion` (v12.x) — MIT License
