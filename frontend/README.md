# EpistemicOps frontend

React + TypeScript + Vite UI for the EpistemicOps incident-response agent. It talks
to the FastAPI backend over REST and streams the agent's activity over SSE.

```bash
npm install      # first time
npm run dev      # dev server at http://localhost:5173
npm run build    # type-check + production build
npm run test     # component tests (vitest)
```

The dev server proxies `/api` and `/health` to the backend (default
`http://localhost:8000`); leave `VITE_API_BASE_URL` empty for local development.
See the [root README](../README.md) for full setup, and never put `GEMINI_API_KEY`
in this directory — the key is backend-only.
