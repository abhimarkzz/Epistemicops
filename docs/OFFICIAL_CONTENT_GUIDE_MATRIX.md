# Official Content Guide — Requirement Matrix

Every requirement from the official Content Submission Guide (as supplied in `docs/CONTENT_GUIDE.md`).
Status: ✅ COMPLETE · 🟡 PARTIAL · ❌ MISSING · ⚠️ UNVERIFIED · ➖ N/A.
For submission actions: **READY** (drafted/asset ready) vs **PUBLISHED/RECORDED** vs **HUMAN ACTION**.

## Article
| ID | Requirement | Mand. | Evidence / file | Status | Human action? |
|----|-------------|-------|-----------------|--------|----------------|
| A1 | 800–1,500 words | Yes | `ARTICLE_FINAL.md` (~1,050 words) | ✅ READY | — |
| A2 | English | Yes | article | ✅ | — |
| A3 | Public + linkable after publication | Yes | not published | 🟡 READY | **YES** (publish) |
| A4 | Title focused on idea/result | Yes | "Giving an SRE incident-response agent a real memory with Hindsight" | ✅ | — |
| A5 | No "hackathon" in article or hashtags | Yes | grep: 0 occurrences | ✅ | — |
| A6 | First-person engineering voice | Yes | article uses "I built…", "I noticed…" | ✅ | — |
| A7 | Concrete technical story | Yes | recall/retain/warm-vs-baseline | ✅ | — |
| A8 | Hindsight a major theme | Yes | dedicated section + throughout | ✅ | — |
| A9 | ≥1 real code snippet from repo | Yes | `query_memory` vector-recall snippet | ✅ | — |
| A10 | Concrete before/after example | Yes | baseline vs warm section | ✅ | — |
| A11 | Honest lesson/limitation/dead-end | Yes | reflect→recall lesson + limits section | ✅ | — |
| A12 | Screenshots/images | Yes | `ARTICLE_VISUALS_CHECKLIST.md` (not captured) | 🟡 | **YES** (capture) |
| A13 | Architecture diagram | Yes | `architecture.md`; image not rendered | 🟡 | **YES** (render/embed) |
| A14 | Hindsight GitHub link | Yes | in article | ✅ | — |
| A15 | Hindsight docs link | Yes | in article | ✅ | — |
| A16 | Vectorize agent-memory link | Yes | in article | ✅ | — |
| A17 | Publish on Medium/Dev.to/Hashnode/Substack/LinkedIn (not Drive-only) | Yes | `ARTICLE_PUBLICATION_CHECKLIST.md` | ❌ | **YES** (publish) |

## Reddit
| ID | Requirement | Mand. | Evidence / file | Status | Human action? |
|----|-------------|-------|-----------------|--------|----------------|
| R1 | Share article as **Link post** on r/llmdevs, r/sideproject, r/aiagents, or r/aimemory | Yes | `REDDIT_SUBMISSION_CHECKLIST.md` | ❌ | **YES** (post) |

## Social post
| ID | Requirement | Mand. | Evidence / file | Status | Human action? |
|----|-------------|-------|-----------------|--------|----------------|
| S1 | English | Yes | `SOCIAL_MEDIA_POST_FINAL.md` | ✅ | — |
| S2 | No "hackathon" / #Hackathon / student tags | Yes | grep: 0 | ✅ | — |
| S3 | Strong first two lines | Yes | opener | ✅ | — |
| S4 | Project-focused, concrete Hindsight behavior, before/after | Yes | post body | ✅ | — |
| S5 | Positively mention Hindsight agent memory | Yes | post + first comment | ✅ | — |
| S6 | Under 800 characters | Yes | main body ~730 chars (re-count after URL) | ✅ READY | — |
| S7 | Hashtags on final line only | Yes | `#AIAgents #AgentMemory #Hindsight #AIMemory #LLM` | ✅ | — |
| S8 | Project GitHub link in MAIN post | Yes | `<REPO_URL>` placeholder | 🟡 | **YES** (insert real URL) |
| S9 | First comment links Hindsight GitHub | Yes | specified | ✅ READY | **YES** (post the comment) |
| S10 | Tag Code.in on LinkedIn + Articles | Yes | noted in checklists | 🟡 | **YES** (tag; confirm handle) |
| S11 | Actually posted (public URL) | Yes | `SOCIAL_POST_PUBLICATION_CHECKLIST.md` | ❌ | **YES** (post) |

## Video
| ID | Requirement | Mand. | Evidence / file | Status | Human action? |
|----|-------------|-------|-----------------|--------|----------------|
| V1 | One team video, 2–5 min, 1080p+ | Yes | `VIDEO_SCRIPT_FINAL.md` | 🟡 READY | **YES** (record) |
| V2 | Screen recording + voiceover | Yes | script | 🟡 | **YES** |
| V3 | Shows: no-memory, real interaction, retain, recall, before/after, takeaway | Yes | script segment 3 | 🟡 | **YES** |
| V4 | 5 YouTube titles | Yes | `VIDEO_SCRIPT_FINAL.md` | ✅ | — |
| V5 | 16:9 thumbnail | Yes | `VIDEO_THUMBNAIL_BRIEF.md` (not created) | ❌ | **YES** (create) |
| V6 | Public YouTube upload (not Drive-only) | Yes | `YOUTUBE_PUBLICATION_CHECKLIST.md` | ❌ | **YES** (upload) |

## Per-team-member content
| ID | Requirement | Mand. | Evidence / file | Status | Human action? |
|----|-------------|-------|-----------------|--------|----------------|
| T1 | Each team member submits their own article + social post | Yes | `TEAM_CONTENT.md`; git shows 1 author (Ruchee/abhimarkzz) | ⚠️ | **HUMAN INFORMATION REQUIRED** (confirm team size) |

## Summary
- **Ready (drafted):** article text, social text, video script + titles, all checklists/briefs,
  content-guide capture, matrix.
- **Human actions:** capture screenshots + render diagram; publish article; Reddit link post; post
  social + first comment + Code.in tag; record + upload YouTube video + thumbnail; confirm team roster
  and each member's independent content.
