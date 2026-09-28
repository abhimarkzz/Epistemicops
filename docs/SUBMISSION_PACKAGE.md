# EpistemicOps — Submission Package Index

Single source of truth for what's ready and what still needs a human. Status values:
**READY** (done, in repo) · **DRAFT** (superseded by a FINAL) · **RECORDED** / **PUBLISHED**
(only when actually done) · **HUMAN ACTION REQUIRED**.

| Deliverable | File / location | Status | Notes |
|-------------|-----------------|--------|-------|
| **Repository** | `github.com/abhimarkzz/Epistemicops` | HUMAN ACTION REQUIRED | Remote exists but only the initial commit is pushed; 54 files of finished work are uncommitted. Code READY (146 tests, builds). Steps: `docs/GITHUB_PUBLICATION_CHECKLIST.md`. |
| **Article** | [`docs/ARTICLE_FINAL.md`](ARTICLE_FINAL.md) | READY (unpublished) | Publish per Content Guide. Draft: `ARTICLE_DRAFT.md`. |
| **Social post** | [`docs/SOCIAL_MEDIA_POST_FINAL.md`](SOCIAL_MEDIA_POST_FINAL.md) | READY (unposted) | Replace `<REPO_URL>`, confirm platform/tags. Draft: `SOCIAL_MEDIA_POST_DRAFT.md`. |
| **Demo video** | [`docs/VIDEO_SCRIPT_FINAL.md`](VIDEO_SCRIPT_FINAL.md) | HUMAN ACTION REQUIRED | Script READY; **REQUIRES HUMAN RECORDING** + upload. Checklist: `DEMO_RECORDING_CHECKLIST.md`. |
| **Video content deliverable** | [`docs/VIDEO_SCRIPT_FINAL.md`](VIDEO_SCRIPT_FINAL.md) | HUMAN ACTION REQUIRED | Same script; confirm with Content Guide whether it is separate from the Demo Video. **REQUIRES HUMAN RECORDING.** |
| **Hindsight explanation** | [`docs/HINDSIGHT_EXPLANATION.md`](HINDSIGHT_EXPLANATION.md) | READY | Matches implementation (vector recall, retain, consolidation, runbook). |
| **Demo script** | [`docs/DEMO_SCRIPT.md`](DEMO_SCRIPT.md) | READY | ~1-minute judge walkthrough. |
| **Architecture** | [`docs/architecture.md`](architecture.md) | READY | Matches code (Groq default / Gemini optional). |
| **Attributions** | [`ATTRIBUTIONS.md`](../ATTRIBUTIONS.md) | READY | Libraries + dataset (`quantranger/sre-agent-eda-bundle`, Apache-2.0). |
| **License** | — | HUMAN ACTION REQUIRED | No `LICENSE` file yet; choose one (e.g. MIT/Apache-2.0) before publishing. |
| **Setup instructions** | [`README.md`](../README.md) | READY | Prereqs, install, env, start, tests, demo, troubleshooting. |
| **Content Guide (captured)** | [`docs/CONTENT_GUIDE.md`](CONTENT_GUIDE.md) | READY | Official guide requirements as supplied. |
| **Content Guide matrix** | [`docs/OFFICIAL_CONTENT_GUIDE_MATRIX.md`](OFFICIAL_CONTENT_GUIDE_MATRIX.md) | READY | Every guide requirement + status. |
| **Content Guide compliance** | [`docs/CONTENT_GUIDE_COMPLIANCE.md`](CONTENT_GUIDE_COMPLIANCE.md) | READY | Challenge mapping (req 32 COMPLETE). |
| **Article visuals** | [`docs/ARTICLE_VISUALS_CHECKLIST.md`](ARTICLE_VISUALS_CHECKLIST.md) | HUMAN ACTION REQUIRED | Screenshots + diagram not captured. |
| **Article publication** | [`docs/ARTICLE_PUBLICATION_CHECKLIST.md`](ARTICLE_PUBLICATION_CHECKLIST.md) | HUMAN ACTION REQUIRED | Publish to Medium/Dev.to/etc. |
| **Reddit submission** | [`docs/REDDIT_SUBMISSION_CHECKLIST.md`](REDDIT_SUBMISSION_CHECKLIST.md) | HUMAN ACTION REQUIRED | Link post after article is public. |
| **Social publication** | [`docs/SOCIAL_POST_PUBLICATION_CHECKLIST.md`](SOCIAL_POST_PUBLICATION_CHECKLIST.md) | HUMAN ACTION REQUIRED | Post + first comment + Code.in tag. |
| **Video thumbnail** | [`docs/VIDEO_THUMBNAIL_BRIEF.md`](VIDEO_THUMBNAIL_BRIEF.md) | HUMAN ACTION REQUIRED | 16:9 image not created. |
| **YouTube publication** | [`docs/YOUTUBE_PUBLICATION_CHECKLIST.md`](YOUTUBE_PUBLICATION_CHECKLIST.md) | HUMAN ACTION REQUIRED | Record + upload public video. |
| **GitHub publication** | [`docs/GITHUB_PUBLICATION_CHECKLIST.md`](GITHUB_PUBLICATION_CHECKLIST.md) | HUMAN ACTION REQUIRED | Commit + push (user-gated). |
| **Team content** | [`docs/TEAM_CONTENT.md`](TEAM_CONTENT.md) | HUMAN INFORMATION REQUIRED | Confirm roster; per-member article + post. |
| **Full audit** | [`docs/HACKATHON_FINAL_AUDIT.md`](HACKATHON_FINAL_AUDIT.md) | READY | Requirement matrix + live-verification results. |

## Live-verification snapshot (reproducible)
- LLM provider: **Groq** (`openai/gpt-oss-120b`), free tier; Gemini optional.
- Warm run: `memory_used=true` (recalled inc-001); Baseline: `memory_used=false`; Cold: postmortem retained. Compare uses real run records.
- Backend: 146 tests pass. Frontend: builds + vitest passes. Ground-truth isolation verified. No secret committed.

## The only human actions left
1. Capture article screenshots + render the architecture diagram (`ARTICLE_VISUALS_CHECKLIST.md`).
2. Publish the article (public URL), then the Reddit link post.
3. Post the social post (+ first comment + Code.in tag); insert the real repo URL.
4. Record + upload the YouTube video + 16:9 thumbnail.
5. Commit + push to GitHub (you must approve) and add a LICENSE.
6. Confirm the team roster and each member's independent content (`TEAM_CONTENT.md`).
