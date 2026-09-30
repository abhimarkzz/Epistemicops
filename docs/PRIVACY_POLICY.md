# EpistemicOps — Privacy Policy

**Effective Date:** September 29, 2026  
**Document Version:** 1.0 (Engineering Architecture Disclosure)  

---

## 1. What EpistemicOps Is

EpistemicOps is an open-source, local-first Site Reliability Engineering (SRE) incident investigation assistant and operational command center. It assists software engineers and operators by analyzing system telemetry (logs, metrics, traces, and pod health), synthesizing root-cause diagnoses, and maintaining persistent procedural operational memory (using Hindsight) to speed up resolution of recurring microservice incidents.

This Privacy Policy describes the actual data flows, technical storage boundaries, and external communications of the EpistemicOps software in its standard operating configuration.

---

## 2. Information We Process

EpistemicOps operates on the principle of **strict data minimization**. The software does not require user registration and does not collect personal contact information.

The application processes only the following categories of technical data:

1. **Incident Telemetry Data:** Synthetic microservice identifiers, error logs, resource utilization metrics, and distributed trace spans loaded from local deterministic fixtures (`data/incidents/*.json`).
2. **Procedural Memory State:** Postmortem summaries, recommended remediation actions, and procedural runbook steps indexed locally via Hindsight (`data/memory_state.json`).
3. **Execution Diagnostics:** Timestamps, tool invocation counts, elapsed run durations, and automated test evaluation scores generated during investigation runs.
4. **Third-Party API Credentials:** Upstream LLM provider credentials (`GROQ_API_KEY` or `GEMINI_API_KEY`) configured locally by the operator on the server side.

---

## 3. What We Do NOT Collect

To maintain a minimal privacy footprint:
- **No Personal Identifiers:** We do not collect names, email addresses, phone numbers, physical addresses, or job titles.
- **No Account Profiles:** There are no user accounts, passwords, or authentication profiles.
- **No Financial Data:** We do not process payments, credit cards, or billing records.
- **No Behavioral Analytics:** We do not track user clicks, scroll events, session replays, or browser fingerprints.
- **No Tracking Cookies:** The application does not set or read any HTTP cookies or web beacons.

---

## 4. Local Fixtures vs. Production Telemetry

The standard distribution of EpistemicOps uses **synthetic, hand-crafted incident fixtures** located on your local disk. 

> [!IMPORTANT]
> **Notice to Enterprise Operators:** If you choose to configure EpistemicOps against live production Kubernetes clusters or live log aggregators, any diagnostic logs and traces retrieved by the agent will be processed according to your own internal infrastructure security policies and transmitted to your selected LLM provider as described in Section 5 below.

---

## 5. Third-Party Data Flows & External Services

EpistemicOps operates primarily on your local machine (`127.0.0.1`). However, certain external network communications occur depending on the selected operating mode:

### A. Large Language Model (LLM) Inference (Live Mode Only)
- **Providers:** Groq API (`api.groq.com`) or Google Gemini API (`generativelanguage.googleapis.com`).
- **Data Transmitted:** In Live Mode, the LangGraph backend agent sends prompt payloads containing the incident title, affected service name, selected tool log/metric excerpts, and relevant recalled memory snippets.
- **Credential Storage:** API keys are stored strictly in the local server `.env` file and transmitted directly from the backend to the provider over HTTPS. They are never sent to the browser.
- **Exemption:** In **Demo Mode**, all events are replayed from local files (`data/demo_events/*.jsonl`), and **zero data is sent to any external LLM provider**.

### B. Typography & Icon Assets
- **Provider:** Google Fonts CDN (`fonts.googleapis.com`, `fonts.gstatic.com`).
- **Data Transmitted:** Standard browser HTTP request metadata (client IP address, User-Agent header) when downloading font binaries (`VT323`, `JetBrains Mono`) and icon glyphs.

### C. Persistent Memory Subsystem (Hindsight)
- **Architecture:** Hindsight executes as a self-hosted local service (via Docker or local process at `http://127.0.0.1:8888`).
- **Data Transmitted:** Incident postmortem embeddings and runbook text are stored strictly on the local machine. **No memory data is transmitted to an external Hindsight cloud service.**

---

## 6. Browser Storage & Cookies

- **Cookies:** EpistemicOps sets and reads **ZERO first-party or third-party cookies**.
- **Web Storage:** The client application does not store personal data in `localStorage`, `sessionStorage`, or `IndexedDB`.
- **Cache:** Standard browser HTTP caching applies to static frontend JavaScript and CSS bundles.

---

## 7. Data Retention & Deletion

- **Run Records:** Ephemeral investigation histories in `backend/app/runs.py` are stored in memory and purged automatically whenever the backend server process terminates.
- **Memory Bank:** Procedural postmortems and runbooks in `data/memory_state.json` persist locally until the operator explicitly clicks the **[RESET MEMORY BANK]** button in the UI or clears the file.

---

## 8. Security & Engineering Safeguards

1. **Server-Side Secret Isolation:** All API tokens remain isolated on the host machine and are never exposed to browser clients.
2. **Ground Truth Confidentiality:** Incident evaluation ground-truth data is isolated within `FixtureService` and is never leaked into prompt contexts during live runs.
3. **Read-Only Evidence Collection:** Built-in agent evidence tools perform read-only queries against diagnostic fixtures; they cannot execute destructive state changes.

---

## 9. India Digital Personal Data Protection (DPDP) Disclosure

This section provides factual information regarding the application's architecture in reference to Indian data protection laws, specifically the **Digital Personal Data Protection Act, 2023 (DPDP Act)** and the **Digital Personal Data Protection Rules, 2025** published by the Ministry of Electronics and Information Technology (MeitY), Government of India ([https://www.meity.gov.in/](https://www.meity.gov.in/)):

- **Privacy-Minimal Design:** EpistemicOps is architected as an engineering tool that does not intentionally solicit, collect, process, or store digital personal data of natural persons.
- **No User Profiling:** The software performs no behavioral profiling, targeted advertising, or algorithmic tracking.
- **Synthetic Data Baseline:** Demonstration environments operate solely on synthetic infrastructure telemetry devoid of personally identifiable information (PII).
- **Phased Commencement Notice:** In accordance with official notifications issued under the DPDP Act 2023, statutory provisions come into effect in phases as officially notified by MeitY. 
- **Legal Disclaimer:** *This disclosure is an engineering product architecture statement and does not constitute formal legal counsel.*

---

## 10. Policy Updates

Any modifications to the data processing practices of this software will be reflected in an updated version of this document within the project repository.

---

## 11. Project Maintainer Contact

For technical questions or security disclosures regarding this open-source prototype:

`[PROJECT MAINTAINER CONTACT — REQUIRED BEFORE PUBLICATION]`  
*(Maintainers: update this placeholder with your public project email or GitHub repository discussions link prior to public deployment).*
