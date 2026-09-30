# Getting Support for EpistemicOps

Thank you for exploring EpistemicOps. If you run into issues or have questions about running investigations, memory retention, or deployment, please follow the steps below:

---

## 1. Check the Documentation First

Most setup and configuration questions are answered in our primary guides:
- **[README.md](README.md):** Quick start, environment variable definitions, and architecture overview.
- **[docs/DEMO.md](docs/DEMO.md):** Step-by-step demonstration walkthrough for cold, warm, baseline, and demo modes.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md):** Production Docker container, Render, and Neon PostgreSQL setup guide.
- **[docs/HINDSIGHT_EXPLANATION.md](docs/HINDSIGHT_EXPLANATION.md):** Detailed explanation of Hindsight retention, semantic vector recall, and runbook mental models.

---

## 2. Review Troubleshooting

Common issues and their resolutions:
- **LLM shows "unreachable" on `/health`:** Verify that `GROQ_API_KEY` is present in `backend/.env` and valid.
- **Hindsight shows "unreachable" on `/health`:** Ensure the native daemon is running (`bash scripts/hindsight-native.sh`) and listening on port 8888.
- **SSE timeline stream does not update:** Verify that your browser or reverse proxy allows unbuffered streaming (`proxy_buffering off;`).

---

## 3. GitHub Issue Tracker

If your problem is not covered in the documentation:
1. Search existing [GitHub Issues](https://github.com/abhimarkzz/Epistemops/issues) to see if the topic has been discussed.
2. If the issue is new, open a new issue using our structured templates:
   - Use the **Bug Report** template for unexpected errors or failures.
   - Use the **Feature Request** template for architecture suggestions or telemetry connector requests.
