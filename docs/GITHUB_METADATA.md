# GitHub Repository Metadata & Configuration Guide

This document contains the recommended public-facing metadata, topics, and settings for the GitHub repository:  
**https://github.com/abhimarkzz/Epistemops**

---

## 1. Repository Details

- **Repository Description (135 characters, limit ~160):**
  ```text
  Autonomous SRE incident-response agent with persistent operational memory and evolving runbooks using Vectorize Hindsight & LangGraph.
  ```

- **Repository Website URL:**
  ```text
  https://epistemicops.onrender.com
  ```

---

## 2. Recommended Topics (12 Topics)

Add these exact topics in the **About** section (gear icon on the main repo page):

1. `sre`
2. `incident-response`
3. `ai-agents`
4. `agent-memory`
5. `hindsight`
6. `langgraph`
7. `fastapi`
8. `react`
9. `typescript`
10. `observability`
11. `devops`
12. `llm`

*(Note: In accordance with professional open-source standards, avoid non-technical tags like "hackathon" or "student-project".)*

---

## 3. Social Preview Image

- **Recommended File:** `docs/assets/article-dashboard.png` (or a branded 1280x640 banner matching `docs/GITHUB_SOCIAL_PREVIEW_SPEC.md`).
- **How to Set:**
  1. Go to repository **Settings** → **General**.
  2. Scroll down to **Social preview**.
  3. Click **Edit** → **Upload an image**.
  4. Select `docs/assets/article-dashboard.png` and save.

---

## 4. Recommended Repository Settings

- **Features:**
  - [x] **Issues:** Enabled (Issue templates configured in `.github/ISSUE_TEMPLATE/`)
  - [x] **Discussions:** Optional / Disabled
  - [x] **Projects:** Disabled (reduces clutter)
  - [x] **Wikis:** Disabled (documentation lives in Git under `docs/` and `README.md`)
- **Pull Requests:**
  - [x] Allow merge commits
  - [x] Allow squash merging
  - [x] Automatically delete head branches upon merge
- **Security:**
  - [x] Dependency graph enabled
  - [x] Dependabot alerts enabled
  - [x] Secret scanning enabled
