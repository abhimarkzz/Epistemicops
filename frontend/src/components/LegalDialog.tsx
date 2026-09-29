import { useEffect, useRef, useState } from "react";

export type LegalTab = "privacy" | "terms";

interface LegalDialogProps {
  initialTab?: LegalTab;
  onClose: () => void;
}

export function LegalDialog({ initialTab = "privacy", onClose }: LegalDialogProps) {
  const [tab, setTab] = useState<LegalTab>(initialTab);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus trap and Escape key listener
  useEffect(() => {
    closeBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-dialog-title"
      onClick={onClose}
    >
      <div className="dialog legal-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="dialog-head">
          <h2 id="legal-dialog-title">
            {tab === "privacy" ? "SYS_INFO // PRIVACY POLICY" : "SYS_INFO // TERMS & DISCLAIMER"}
          </h2>
          <button
            ref={closeBtnRef}
            className="btn-icon"
            onClick={onClose}
            aria-label="Close legal documents"
            title="Close (Esc)"
          >
            ✕
          </button>
        </header>

        <div className="legal-tabs" role="tablist" aria-label="Legal documents">
          <button
            role="tab"
            aria-selected={tab === "privacy"}
            aria-controls="privacy-tab-panel"
            className={`legal-tab-btn ${tab === "privacy" ? "active" : ""}`}
            onClick={() => setTab("privacy")}
          >
            [1] PRIVACY POLICY
          </button>
          <button
            role="tab"
            aria-selected={tab === "terms"}
            aria-controls="terms-tab-panel"
            className={`legal-tab-btn ${tab === "terms" ? "active" : ""}`}
            onClick={() => setTab("terms")}
          >
            [2] TERMS OF USE & DISCLAIMER
          </button>
        </div>

        <div className="legal-content">
          {tab === "privacy" ? (
            <div id="privacy-tab-panel" role="tabpanel">
              <div className="legal-summary-grid">
                <div className="legal-summary-card">
                  <div className="legal-summary-title">ZERO COOKIES</div>
                  <div className="legal-summary-desc">No HTTP cookies, session tracking, or browser storage cookies.</div>
                </div>
                <div className="legal-summary-card">
                  <div className="legal-summary-title">ZERO TRACKERS</div>
                  <div className="legal-summary-desc">No Google Analytics, PostHog, Mixpanel, or third-party ad beacons.</div>
                </div>
                <div className="legal-summary-card">
                  <div className="legal-summary-title">SYNTHETIC TELEMETRY</div>
                  <div className="legal-summary-desc">Runs entirely on deterministic mock fixtures in data/incidents/. No real user PII.</div>
                </div>
                <div className="legal-summary-card">
                  <div className="legal-summary-title">LOCAL MEMORY</div>
                  <div className="legal-summary-desc">Runbook knowledge is stored locally in self-hosted Hindsight (127.0.0.1:8888).</div>
                </div>
              </div>

              <h3>1. Data Minimization & Scope</h3>
              <p>
                EpistemicOps is an open-source, local-first SRE incident investigation assistant.
                The application does not maintain user account databases, does not collect personal names,
                email addresses, phone numbers, or credit card details, and operates locally on your machine.
              </p>

              <h3>2. Third-Party Network Boundaries</h3>
              <p>
                When running the application, network communication is limited to the following destinations:
              </p>
              <ul>
                <li>
                  <strong>Google Fonts CDN:</strong> Typography (<code>VT323</code> and <code>JetBrains Mono</code>)
                  is loaded from <code>fonts.googleapis.com</code> and <code>fonts.gstatic.com</code> to render the terminal aesthetic.
                </li>
                <li>
                  <strong>LLM Inference APIs (Live Mode Only):</strong> When you click &quot;Run Investigation&quot; in Live mode,
                  synthetic incident telemetry (pod names, error logs, and metric graphs) is sent to Google Gemini or Groq
                  using the API key configured in your backend <code>.env</code> file. In Demo Mode, pre-recorded replay events are used with zero external calls.
                </li>
                <li>
                  <strong>Hindsight Vector Memory:</strong> Postmortems are retained locally in the Hindsight service running on <code>127.0.0.1:8888</code>.
                </li>
              </ul>

              <h3>3. India DPDP Act, 2023 & Rules 2025 Statement</h3>
              <p>
                EpistemicOps is engineered in accordance with privacy-by-design and data minimization principles.
                Because the software operates locally on synthetic technical telemetry and does not collect or process
                personal data of identifiable natural persons (Data Principals), obligations regarding Consent Managers,
                Notice, and Data Principal verification under the Digital Personal Data Protection Act, 2023 do not apply
                to default evaluation deployments.
              </p>

              <h3>4. Contact & Inquiries</h3>
              <p>
                For privacy inquiries or technical clarification regarding this open-source project:
                <br />
                <code>[PROJECT MAINTAINER CONTACT — REQUIRED BEFORE PUBLICATION]</code>
              </p>
            </div>
          ) : (
            <div id="terms-tab-panel" role="tabpanel">
              <div className="legal-callout">
                <strong>NON-PRODUCTION RESEARCH PROTOTYPE:</strong> EpistemicOps is provided for educational, evaluation,
                and demonstration purposes only. Do not execute automated remediation in live production systems without human review.
              </div>

              <h3>1. Software Disclaimer (AS IS)</h3>
              <p>
                THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
                NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NONINFRINGEMENT.
                IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.
              </p>

              <h3>2. Human-In-The-Loop Requirement</h3>
              <p>
                All diagnoses, runbooks, and remediation plans generated by the LangGraph agent or LLM providers
                are heuristic recommendations. Qualified human Site Reliability Engineers must independently verify all
                recommendations before applying configuration changes or restarting services in live environments.
              </p>

              <h3>3. API Credentials & Security</h3>
              <p>
                Users are solely responsible for provisioning and safeguarding their own API keys (e.g. <code>GEMINI_API_KEY</code>,
                <code>GROQ_API_KEY</code>). API keys must remain strictly in backend environment variables and must never be committed
                to public version control.
              </p>

              <h3>4. Open Source Licensing</h3>
              <p>
                Source code and procedural 3D visual assets are distributed under permissive open-source licenses.
                All fonts, icons, and dependencies adhere to their respective SIL Open Font License, Apache 2.0, or MIT licenses.
              </p>

              <h3>5. Maintainer Notice</h3>
              <p>
                To contact the maintainers regarding these terms:
                <br />
                <code>[PROJECT MAINTAINER CONTACT — REQUIRED BEFORE PUBLICATION]</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
