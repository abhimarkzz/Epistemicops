# EpistemicOps — Asset & License Audit

**Application:** EpistemicOps  
**Audit Date:** 2026-09-29  
**Audit Scope:** Static media, 3D geometries, fonts, icons, and fixture datasets  

---

## 1. Static Media & Branding Assets

| Asset File | Description / Role | Origin / Source | License Status | Commercial Use Allowed? | Redistribution Allowed? | Attribution Required? |
|---|---|---|---|---|---|---|
| `frontend/public/logo.png` | EpistemicOps brand mark | Project original asset | Project proprietary / permissive repository license | Yes | Yes (with repository) | No |

---

## 2. 3D Graphics & Visual Assets

| Asset / Component | Implementation Type | Origin | License Status |
|---|---|---|---|
| **EpistemicGraph 3D Canvas** (`frontend/src/components/three/EpistemicGraph.tsx`) | 100% Procedural WebGL geometry | Generated dynamically via Three.js / React Three Fiber code using standard primitives (`THREE.SphereGeometry`, `THREE.CylinderGeometry`, `THREE.BoxGeometry`, procedural particle buffers). | MIT License (Three.js / React Three Fiber) |
| **External 3D Models (.gltf / .glb / .obj / .fbx)** | **NONE** | No external binary 3D model files are packaged or downloaded. | N/A |

---

## 3. Typography & Iconography

| Asset | Source | License | Attribution & Terms |
|---|---|---|---|
| **VT323 Font** | Google Fonts / Peter Hull | **SIL Open Font License, 1.1 (OFL)** | Freely usable, commercially embeddable, cannot be sold by itself. |
| **JetBrains Mono Font** | Google Fonts / JetBrains | **SIL Open Font License, 1.1 (OFL)** | Free for personal and commercial use under OFL terms. |
| **Material Symbols Outlined** | Google Fonts CDN | **Apache License 2.0** | Permissive open-source license permitting redistribution and embedding. |

---

## 4. Datasets & Incident Fixtures

| Dataset | Location | Nature of Data | License & Attribution |
|---|---|---|---|
| **Incident Fixtures (INC-001 through INC-005)** | `data/incidents/*.json` | Synthetic, hand-crafted SRE scenarios (DB pool exhaustion, memory leak, bad deployment, rollout timeout, cache stampede). | Open-source project fixture data. Contains no proprietary enterprise traces or customer data. |
| **Pre-recorded Demo Event Streams** | `data/demo_events/*.jsonl` | Deterministic recorded execution trajectories for offline demo replay. | Synthetic project fixtures. Clearly marked in runtime event stream with `demo_mode_started`. |

---

## 5. Audit Conclusion

All assets in the EpistemicOps repository are either project-original, procedurally generated via open-source libraries (MIT), or licensed under permissive open-source licenses (SIL OFL 1.1, Apache 2.0). There are no proprietary, pirated, or unverified commercial media assets.
