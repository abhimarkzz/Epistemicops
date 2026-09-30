# GitHub Social Preview Image Specification

This document specifies the exact visual design parameters for the GitHub social preview card (`Open Graph` banner) displayed when sharing the repository link across social platforms and messaging apps.

---

## 1. Canvas Dimensions & Specifications

- **Dimensions:** 1280 × 640 pixels (exact 2:1 aspect ratio required by GitHub).
- **Target File Path:** `docs/assets/github-social-preview.png`
- **File Format:** PNG (optimized, under 1 MB).
- **Color Space:** sRGB.

---

## 2. Visual Style & Palette

- **Background:** Deep obsidian slate (`#0B0F17`) with a subtle radial gradient emanating from the center right.
- **Accent Glows:**
  - Technical terminal emerald (`#10B981` / `#059669`) representing operational health and telemetry.
  - SRE incident crimson (`#EF4444`) highlighting an active outage node.
  - Memory ultraviolet (`#8B5CF6` / `#A855F7`) representing Vectorize Hindsight recall paths.
- **Texture / Grid:** Faint 32px isometric grid or terminal scanline texture at 5% opacity.
- **Design Philosophy:** Avoid generic sci-fi glowing brain icons. Emphasize actual telemetry infrastructure: graph nodes, memory vectors, microservice clusters, and clean monospace typography.

---

## 3. Typography & Copy Layout

### Left Column (Copy Hierarchy)
- **Top Badge (Small / Monospace):**
  - Text: `SRE INCIDENT-RESPONSE AGENT`
  - Font: JetBrains Mono / Inter, 16px, uppercase, tracking +2px, color `#94A3B8`.
- **Main Project Title:**
  - Text: `EpistemOps`
  - Font: Inter / Outfit Display, 64px, bold, color `#F8FAFC`.
- **Subtitle / Value Proposition:**
  - Text: `Persistent Operational Memory with Hindsight`
  - Font: Inter, 24px, medium, color `#38BDF8`.
- **Partnership / Tech Stack Callout:**
  - Text: `Vectorize Hindsight  ×  LangGraph  ×  FastAPI`
  - Font: JetBrains Mono, 18px, color `#A855F7`.

### Right Column (Visual Element)
- Isometric wireframe rendering of the 3D Epistemic Topology Graph:
  - Central incident node pulsing in crimson (`#EF4444`).
  - Surrounding microservice pods in healthy teal (`#10B981`).
  - Glowing bidirectional vector arcs in violet (`#8B5CF6`) connecting to a persistent memory bank icon.

---

## 4. Immediate Fallback Option

If an updated graphic is not yet rendered by a designer, GitHub repository settings can use `docs/assets/article-dashboard.png` (which captures the real 3D Command Center UI) directly as the social preview image.
