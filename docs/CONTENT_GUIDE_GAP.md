# Content Guide Gap

> **UPDATE (final completion pass):** the official Content Submission Guide requirements were
> subsequently **supplied by the participant** and are captured in
> [`docs/CONTENT_GUIDE.md`](CONTENT_GUIDE.md), with a full requirement matrix in
> [`docs/OFFICIAL_CONTENT_GUIDE_MATRIX.md`](OFFICIAL_CONTENT_GUIDE_MATRIX.md). The article, social
> post, and video script have been made compliant with those rules. What remains is **publication**
> (public article URL, Reddit link post, social post, YouTube upload) — all human actions. The
> history below documents the earlier state when the guide was not yet available.

---


The hackathon problem statement ("AI Agents That Learn Using Hindsight", Vectorize) states:

> All teams must ALSO share their project based on challenges from the official content guide.
> Content Guide: **Hackathon Content Guide (see official link)**

It is referenced by name only; the actual document/link was never supplied.

## Search results (both authoritative and local)

**Repository search — not present.** Searching the repo for "content guide", "challenge",
"submission format", "hashtag", "video length", "word count", etc. returned only third-party
library files (e.g. `httpx/_content.py`, `groq/.../chat_completion_content_part_param.py`) and
our own docs that merely note the guide is needed. No official guide file exists in the repo.

**Official web search — not publicly accessible.** Searching official Vectorize/Hindsight
sources (`vectorize.io`, `hindsight.vectorize.io`, `github.com/vectorize-io`) surfaced only:
- Hindsight product docs, integration guides, and blog posts (no submission Content Guide).
- The hackathon track name **"AI Agents That Learn Using Hindsight (Engineering & DevOps)"** and
  the promo code **MEMHACK99**, consistent with the problem statement.
- Third-party participant repos and DEV.to write-ups (not authoritative).

A direct fetch of `https://hindsight.vectorize.io/guides` confirmed it contains **integration**
guides only — no article/social/video format rules and no challenge-classification schema.

Conclusion: the official Content Guide is almost certainly a **participant-gated document**
(hackathon platform / Notion / Google Doc) that is not in this repo and not public. Its concrete
format rules therefore cannot be verified here.

## What is known (from the problem statement)
- Deliverables required: GitHub repo, demo video, live demo, **article + social post + video**
  "as described in the content guide", and an explanation of Hindsight usage.
- Challenge/track: **AI Agents That Learn Using Hindsight**, Engineering & DevOps category, whose
  named example is an **Incident Response Agent** — exactly what EpistemicOps is (mapping in
  `docs/CONTENT_GUIDE_COMPLIANCE.md`).
- Judging weights: Innovation 30% · Hindsight Memory 25% · Technical 20% · UX 15% · Impact 10%.

## What cannot be verified without the guide
| Unknown | Needed to confirm |
|---------|-------------------|
| Article platform (Dev.to / Medium / Hashnode?), min length, required sections, tags | req 36 / 31 |
| Social platform (LinkedIn / X?), required @mentions/#tags, link/screenshot rules | req 37 / 31 |
| Video length limit, format, and whether "Demo Video" (34) and "Video" (38) are one or two deliverables | req 34 / 38 / 31 |
| Submission portal, deadline, and any required submission metadata fields | req 31 / 32 |

## Action required (human)
1. Obtain the official **Hackathon Content Guide** from the organizer / hackathon platform.
2. Save it to `docs/CONTENT_GUIDE.md` (or paste its contents).
3. Re-run this audit; then `docs/OFFICIAL_CONTENT_GUIDE_MATRIX.md` can be generated and the FINAL
   article/social/video drafts adjusted to its exact format rules.

Until then, **requirement 31 is UNVERIFIED** and **requirement 32 is SUPPORTED-BUT-UNVERIFIED**
(the project clearly matches the DevOps Incident-Response track, but the guide's own wording is
unconfirmed). The article/social/video drafts follow the main problem statement only.
