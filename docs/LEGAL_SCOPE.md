# EpistemicOps — Legal Scope & Applicability Manifesto

**Application:** EpistemicOps  
**Audit Date:** 2026-09-29  
**Nature of Application:** Local-first, open-source engineering demonstration and diagnostic prototype  

---

## 1. Scope Determination Matrix

| Legal / Governance Topic | Applicability Status | Technical / Product Justification | Action Required |
|---|---|---|---|
| **Privacy Policy** | **APPLICABLE** | Discloses actual data flow (local fixtures, Hindsight vector storage, and external LLM API transit). | Provide factual, engineering-grounded Privacy Policy page and documentation. |
| **Terms of Use** | **APPLICABLE** | Defines acceptable software usage, clarifies prototype/demo status, and establishes disclaimers regarding automated SRE remediation. | Provide appropriately scoped Terms of Use page and documentation. |
| **Cookie Policy** | **NOT APPLICABLE** | The application stores zero first-party or third-party cookies. | State clearly in audit that no cookies are used; do not publish a fake policy. |
| **Cookie Consent Banner** | **NOT APPLICABLE** | No cookies or client-side terminal tracking technologies are used. | **Do NOT build a consent banner.** Adding one would be misleading. |
| **Refund Policy** | **NOT APPLICABLE** | The application does not charge fees, sell licenses, collect payments, or offer subscriptions. | Document non-applicability here; do not fabricate refund terms. |
| **Form Consent Checkbox** | **NOT APPLICABLE** | The application contains no personal-data collection forms, newsletter signups, or contact forms. | Document non-applicability; no checkbox required. |
| **User Account Agreement** | **NOT APPLICABLE** | No account creation, login, or authentication system exists. | Maintain local-first, login-free operation. |
| **India DPDP Disclosure** | **APPLICABLE (FACTUAL)** | Explains data minimization practices in light of the Digital Personal Data Protection Act 2023 & Rules 2025. | Include factual, engineering-grounded DPDP notice without legal claims. |

---

## 2. Core Operational Principle

```
ACTUAL PRODUCT BEHAVIOR
        ↓
ACTUAL DATA COLLECTED
        ↓
ACTUAL THIRD PARTIES USED
        ↓
ACTUAL LEGAL/PRIVACY NEED
        ↓
MINIMAL APPROPRIATE IMPLEMENTATION
```

EpistemicOps avoids "legal hygiene theater." We do not add generic enterprise compliance checkboxes or fake popups that do not match the real software architecture.
