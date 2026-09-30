# EpistemicOps — Third-Party Services Audit

**Application:** EpistemicOps  
**Audit Date:** 2026-09-29  
**Audit Scope:** External network calls, CDNs, APIs, and embedded resources  

---

## 1. Inventory of External Requests & Services

The following table documents every external network request initiated by the application:

| Provider | Purpose | Endpoint / Domain | Data Transferred | Trigger Condition | Privacy & Data Protection Impact |
|---|---|---|---|---|---|
| **Google Fonts & Material Symbols CDN** | Remote typography loading (`JetBrains Mono`, `VT323`) and UI icons (`Material Symbols Outlined`) | `https://fonts.googleapis.com`<br>`https://fonts.gstatic.com` | Standard HTTP GET headers (client IP address, User-Agent, Referrer) | Initial browser page load (`index.html`) | Google's CDN receives the operator's IP address. No cookies or personal data are transmitted. Fonts can alternatively be self-hosted if an air-gapped environment is required. |
| **Groq API** *(Primary configured LLM provider)* | Fast LLM inference for the LangGraph agent in Live mode (`openai/gpt-oss-120b`) | `https://api.groq.com/openai/v1/chat/completions` | Backend sends prompt containing incident ID, service name, logs, metrics, pod status, and past memory runbook snippets. Request is authenticated with `GROQ_API_KEY`. | Only when operator clicks `[RUN INVESTIGATION]` in **Live Mode** | Prompts are processed according to Groq's API privacy policy and data retention terms. In standard demo usage, prompts contain only synthetic fixture telemetry. If connected to real infrastructure, production logs would transit to Groq. |
| **Google Gemini API** *(Alternative configured LLM provider)* | LLM inference if configured via `GEMINI_API_KEY` (`gemini-3.8-flash`) | `https://generativelanguage.googleapis.com` | Backend sends diagnostic prompt containing incident fixture snippets and memories. Authenticated with server-side `GEMINI_API_KEY`. | Only when `GEMINI_API_KEY` is configured and operator triggers **Live Mode** | Prompts processed according to Google Cloud / AI Studio terms. Transits server-to-server; browser never connects to Gemini directly. |
| **Hindsight** *(Long-Term Procedural Memory)* | Vector indexing, memory recall, and runbook generation | `http://127.0.0.1:8888` | Incident summaries, postmortem evidence keywords, runbook instructions | Live mode queries and retention | **ZERO EXTERNAL EXPOSURE.** Hindsight runs as a local Docker container or native background process on `127.0.0.1`. No data leaves the local machine. |

---

## 2. Services Verified as NOT Present

The following external integrations were actively searched for and confirmed absent:
- No advertising networks
- No tracking pixels or web beacons
- No third-party chat widgets (Intercom, Zendesk, Drift)
- No social media embeds (Twitter/X, LinkedIn, Facebook widgets)
- No video embeds (YouTube, Loom, Vimeo)
- No calendar embeds (Calendly, Cal.com)
- No external payment gateways (Stripe, Razorpay, PayPal)
- No hosted third-party analytics dashboards

---

## 3. Air-Gapped Deployment Considerations

For high-security enterprise or air-gapped environments:
1. **Fonts:** Download font files (`.woff2`) and serve them directly from `frontend/public/` or bundle via `@fontsource`.
2. **LLM:** Point LangGraph to an on-premises or local Ollama / vLLM endpoint instead of remote cloud APIs.
3. **Demo Mode:** Fully functional offline out-of-the-box (`data/demo_events/*.jsonl`).
