# EpistemicOps — Analytics & Tracking Audit

**Application:** EpistemicOps  
**Audit Date:** 2026-09-29  
**Audit Scope:** Client scripts, dependencies, network calls, server middleware  

---

## 1. Audit Findings

**Status:** No analytics or behavioral tracking detected.

A comprehensive codebase scan of `frontend/package.json`, `frontend/index.html`, `frontend/src/`, and `backend/` was performed for all standard tracking, analytics, and telemetry SDKs:

- **Google Analytics (GA4 / gtag / GTM):** NOT PRESENT
- **PostHog:** NOT PRESENT
- **Mixpanel:** NOT PRESENT
- **Amplitude:** NOT PRESENT
- **Segment:** NOT PRESENT
- **Plausible / Fathom:** NOT PRESENT
- **Hotjar / Microsoft Clarity:** NOT PRESENT
- **LogRocket / FullStory:** NOT PRESENT
- **Sentry SDK / Bugsnag:** NOT PRESENT
- **Custom Tracking Beacons / navigator.sendBeacon:** NOT PRESENT

---

## 2. Distinction: Product Analytics vs. Technical Application Telemetry

It is essential to distinguish between **marketing/behavioral analytics** and **local operational telemetry**:

1. **Behavioral Product Analytics (NOT PRESENT):**
   - User tracking, clickstreams, mouse movements, session replays, conversion funnels, fingerprinting.
   - *Verdict:* EpistemicOps contains zero behavioral tracking code.

2. **Application Operational Telemetry (INTERNAL & LOCAL):**
   - The application displays diagnostic statistics about the simulated incidents being investigated:
     - Elapsed investigation seconds
     - Count of evidence tool calls executed by the LangGraph agent
     - LLM confidence score produced by the model
     - Automated evaluation pass/fail scores against ground truth fixtures
   - *Verdict:* These metrics pertain exclusively to the synthetic microservices under investigation. They do not monitor, measure, or profile the human user sitting at the keyboard.

---

## 3. Policy Recommendation

Keep the project completely tracker-free. Do not introduce analytics SDKs.
