# EpistemicOps — Cookie Audit

**Application:** EpistemicOps  
**Audit Date:** 2026-09-29  
**Audit Scope:** Full client-side and server-side code inspection  

---

## 1. Audit Findings

| Category | Finding | Evidence |
|---|---|---|
| **First-Party Cookies** | **NONE** | Grep search for `document.cookie`, `set-cookie`, `cookie` in frontend code returned zero occurrences. |
| **Third-Party Cookies** | **NONE** | No third-party scripts, advertising iframes, or tracking tags are integrated. |
| **Authentication Cookies** | **NONE** | The application has no user accounts, authentication session, or login mechanism. |
| **Non-Essential / Analytics Cookies** | **NONE** | No Google Analytics, PostHog, Mixpanel, Hotjar, or similar libraries are present. |
| **LocalStorage / SessionStorage** | **NONE** | Grep search for `localStorage` and `sessionStorage` in application code returned zero occurrences. |
| **IndexedDB / ServiceWorkers** | **NONE** | No service workers, offline caches, or IndexedDB storage active in code. |

*(Note: `tough-cookie` exists only inside `node_modules/` as an internal transitive dependency of the `vitest` / `jsdom` testing harness for unit tests; it is never bundled, loaded, or executed in client browsers).*

---

## 2. Cookie Consent Requirement Determination

- **Current Application Behavior:** The application sets zero cookies and reads zero cookies.
- **Legal & Regulatory Need:** Under the EU ePrivacy Directive (Directive 2002/58/EC), GDPR, India DPDP Act 2023 / Rules 2025, and standard international privacy frameworks, cookie consent notices are only required when an application stores or accesses information on a user's terminal equipment for non-strictly necessary purposes.
- **Conclusion:** **NO COOKIE BANNER OR CONSENT MODAL IS REQUIRED.** Adding an artificial cookie banner to an application that does not use cookies would be misleading and contrary to honest privacy engineering.

---

## 3. Maintenance Policy

If future releases introduce state persistence via cookies or web storage, a technical assessment will be conducted prior to deployment, and appropriate disclosures will be added if and only if necessary.
