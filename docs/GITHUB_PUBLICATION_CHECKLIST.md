# GitHub publication checklist

The finished EpistemicOps work is **not yet on GitHub**. The remote exists
(`https://github.com/abhimarkzz/Epistemicops.git`) but currently holds only the initial commit
(`e68d9a4 Initial project setup`); ~54 files of finished work are uncommitted. **No commit or push
has been performed** — the user has explicitly required that no commit/push happen without their
approval.

## Pre-flight (already verified)
- [x] `backend/.env` and `frontend/.env` are gitignored — no key will be committed.
- [x] No secret, `__pycache__`, `.log`, `.DS_Store`, or `dist/` in the pending changes.
- [x] 146 backend tests pass; frontend builds.
- [x] No stale Ollama / Qwen / gemini-2.0-flash references in code or docs.
- [x] Remote configured: `origin → https://github.com/abhimarkzz/Epistemicops.git`; branch `main`.

## Decide before committing
- **`data/memory_state.json`** is local approval/runtime state (no secrets). Commit as example
  state, or reset first: `echo '{"postmortems": {}}' > data/memory_state.json`.
- **A LICENSE is missing.** Add one (MIT or Apache-2.0) at the repo root before publishing.

## Publish (run yourself — nothing here runs automatically)
```bash
cd /Users/admin/Documents/epistemicops
git status                      # confirm backend/.env and frontend/.env are NOT listed
git add -A
git status                      # confirm again after staging
git commit -m "EpistemicOps: SRE incident-response agent with Hindsight memory

- Groq (free-tier) / Gemini provider abstraction; agent + Hindsight on Groq
- Vector recall for warm runs; cold/warm/baseline live-verified
- 146 backend tests; frontend builds; ground-truth isolation
- Submission docs (article, social, video script, demo/checklists)"
git push origin main
```

## Post-push verification
- [ ] Open `https://github.com/abhimarkzz/Epistemicops` and confirm the code + `docs/` are present.
- [ ] Confirm `backend/.env` is **absent** on GitHub (only `.env.example` should appear).
- [ ] Confirm the README renders and its commands match the repo.
- [ ] Pin the repo on your GitHub profile (recommended).

## Security reminder
Never commit `backend/.env` (holds `GROQ_API_KEY` / `GEMINI_API_KEY`). If a key is ever committed
by accident, rotate it at the provider and rewrite history before pushing.
