# Security Policy

The EpistemicOps maintainers take security and data privacy seriously. This document outlines reporting practices, credentials isolation, and security boundaries.

---

## 1. Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |
| < 0.1.0 | No |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability or credential leak within EpistemicOps:

1. **Do NOT open a public GitHub issue.** Public issues disclose vulnerabilities before mitigations can be deployed.
2. Please report security concerns privately using **GitHub Security Advisories**:
   - Navigate to the repository's **Security** tab.
   - Click **Report a vulnerability**.
3. Include detailed steps to reproduce the issue, sample logs, and the potential impact.
4. Maintainers will review the report, issue a fix, and coordinate responsible disclosure.

---

## 3. Credential & Secret Management

- **API Keys:** LLM keys (`GROQ_API_KEY`, `GEMINI_API_KEY`) and database credentials (`HINDSIGHT_API_DATABASE_URL`) must remain strictly in server environment variables or untracked `backend/.env` files.
- **Frontend Safety:** The frontend client bundle is compiled into static JavaScript. Never reference secret environment variables or server tokens in `frontend/src`.
- **Git Commit Audits:** Always verify `git status` before committing. If you suspect an API key was accidentally committed, immediately revoke and rotate it in the upstream provider console.

---

## 4. Production Infrastructure Boundaries

EpistemicOps is an experimental prototype designed for simulated and staged SRE environments:
- **Simulated Fixtures:** Default investigations operate exclusively against sanitized JSON fixtures in `data/incidents/`.
- **Read-Only Tools:** The application does not permit mutating operations, command-line shell access, or write access to production clusters.
- **Human Authorization:** Do not connect this agent to live production infrastructure or mutating execution pipelines without rigorous human-in-the-loop oversight and automated approval barriers.
