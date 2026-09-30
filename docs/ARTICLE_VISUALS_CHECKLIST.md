# Article visuals checklist

Assets to produce for the article (`docs/ARTICLE_FINAL.md`). **None are produced yet** — these are
capture instructions. Do not claim a screenshot exists until the image file exists.

- [ ] **Project UI screenshot** — the 3-column dashboard with Groq + Hindsight green in the header.
      Capture at 1280px+ wide. File: `docs/assets/article-dashboard.png`.
- [ ] **Warm-run memory evidence** — the Agent Activity timeline showing "Memory: found relevant
      patterns" and the **Memory: Used** badge on a live warm run. File: `docs/assets/article-warm-memory.png`.
- [ ] **Hindsight retain/recall evidence** — either the Runbook/Memory panel with a retained
      postmortem, or a terminal capture of `curl .../memories/recall` returning the inc-001 hit.
      File: `docs/assets/article-hindsight-recall.png`.
- [ ] **Comparison view** — warm vs baseline, memory_used true vs false, real recorded numbers.
      File: `docs/assets/article-compare.png`.
- [ ] **Architecture diagram** — from `docs/architecture.md` (render the ASCII diagram as an image
      or redraw it cleanly). File: `docs/assets/article-architecture.png`.
- [ ] **Code snippet image (optional)** — the `query_memory` vector-recall snippet already appears
      as text in the article; a syntax-highlighted screenshot is optional.

Notes:
- Use real runs; never stage a screenshot of a run that didn't happen.
- Redact nothing sensitive appears on screen (no API keys in terminals).
