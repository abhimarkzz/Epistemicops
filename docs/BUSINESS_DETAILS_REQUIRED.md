# EpistemicOps — Maintainer & Publisher Information Requirements

**Document Purpose:** Specifies the exact factual details required from the project maintainers prior to public production deployment, public hosting, or commercialization.  
**Guiding Principle:** **Never invent fake corporate entities, fake addresses, fake phone numbers, or fake Data Protection Officers (DPO).** All placeholders are marked explicitly as `[REQUIRED BEFORE PUBLICATION]`.

---

## 1. Current Project Status

EpistemicOps is currently an **open-source research prototype and local evaluation tool** for Site Reliability Engineering (SRE).
- **Hosting Model:** Localhost execution (`localhost:5173` frontend, `127.0.0.1:8000` backend).
- **Accounts & Billing:** None. Zero financial transactions, zero subscriptions, zero user account databases.
- **Data Ingestion:** Synthetic incident fixtures stored locally in `data/incidents/`. Zero production user databases attached.

Because EpistemicOps is not operated as a commercial SaaS or publicly hosted service at this stage, corporate registration entities are not fabricated in the code or documentation.

---

## 2. Details Required Prior to Public Release / Hosting

If EpistemicOps is published as a hosted service, packaged as an enterprise product, or published on behalf of a legal entity, the repository maintainer must replace the placeholder tokens with authenticated information:

| Placeholder Token | Description | Applicable Legal / Regulatory Context |
|---|---|---|
| `[PROJECT MAINTAINER CONTACT — REQUIRED BEFORE PUBLICATION]` | Contact email address of the maintainer or organization responsible for the repository | General inquiries, open-source support, licensing notices |
| `[LEGAL ENTITY NAME — IF APPLICABLE]` | Full registered company name, non-profit name, or open-source foundation name | Contractual terms, software copyright owner |
| `[MAINTAINER / COMPANY MAILING ADDRESS]` | Physical address or registered business office | Legal service of process, jurisdictional disclosures |
| `[GRIEVANCE OFFICER CONTACT — DPDP ACT]` | Name and electronic contact of the designated Grievance Redressal Officer | India Digital Personal Data Protection Act, 2023 (Section 13) *(only if processing Indian data principals' personal data)* |
| `[SECURITY DISCLOSURE EMAIL]` | Dedicated security inbox or PGP key for responsible vulnerability reports | Application security, RFC 9116 `security.txt` |
| `[PUBLIC HOSTED DOMAIN / URL]` | Canonical production web domain | Privacy policy scope, CORS configuration, SSL/TLS certificates |

---

## 3. Strict Prohibitions During Hardening

When hardening or releasing this project:
1. **DO NOT invent fake company names** (e.g., "EpistemicOps Technologies Inc.").
2. **DO NOT invent fake corporate identification numbers** (e.g., CIN, EIN, VAT, GSTIN).
3. **DO NOT invent fake physical street addresses or phone numbers.**
4. **DO NOT invent fake executive personas or fake Data Protection Officers.**
5. **DO NOT display placeholder text as if it were real legally verified contact information.**

All public disclosures must be grounded in reality and provided by the actual human maintainer or entity publishing the software.
