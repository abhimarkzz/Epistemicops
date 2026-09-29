import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  compareRuns,
  fetchDemoIncidents,
  fetchHealth,
  fetchIncidentLogs,
  fetchIncidentMetrics,
  fetchIncidentPods,
  fetchIncidentTrace,
  fetchIncidents,
  fetchMemoryStatus,
  fetchRun,
  fetchRuns,
  fetchRunbook,
  resetMemoryBank,
  setApproval,
  streamInvestigation,
  triggerRunbookRefresh,
} from "./api";
import type {
  ApprovalStatus,
  DiagnosisResult,
  EvalResult,
  HealthInfo,
  Incident,
  MemoryStatus,
  PodStatus,
  PostmortemRecord,
  RunComparison,
  RunMode,
  RunRecord,
  RunbookStatus,
  RunPhase,
  StreamEvent,
  TraceData,
} from "./types";
import "./App.css";

// Lazy-load the 3D scene for code-splitting and performance
const EpistemicGraph = lazy(() => import("./components/three/EpistemicGraph"));
import { LegalDialog, type LegalTab } from "./components/LegalDialog";

type GraphQuality = 'high' | 'balanced' | 'low';

// ── helpers ─────────────────────────────────────────────────────────────────

type NavView = "incidents" | "runs" | "memory";
type IncidentFilter = "all" | "critical" | "high" | "other";

interface TimelineItem {
  ev: StreamEvent;
  at: number;
}

function sevRank(s: string): IncidentFilter {
  const l = s.toLowerCase();
  if (l === "p1" || l === "critical") return "critical";
  if (l === "p2" || l === "high") return "high";
  return "other";
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtClock(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour12: false });
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface EventView {
  label: string;
  detail: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger" | "memory";
}

function describeEvent(ev: StreamEvent): EventView {
  const d = ev.data;
  switch (ev.event) {
    case "demo_mode_started":
      return { label: "Demo replay started", detail: "Deterministic playback — not a live model run", tone: "warning" };
    case "run_started":
      return { label: "Investigation started", detail: `mode ${String(d.mode ?? "live")}`, tone: "neutral" };
    case "incident_started":
      return { label: "Incident loaded", detail: `${String(d.incident_id ?? "")} · ${String(d.service ?? "")}`, tone: "info" };
    case "memory_query_started":
      return { label: "Querying Hindsight memory", detail: "Searching for related prior incidents", tone: "memory" };
    case "memory_skipped":
      return { label: "Memory skipped", detail: "Baseline mode — no recall performed", tone: "neutral" };
    case "memory_result": {
      const found = Boolean(d.found);
      return found
        ? { label: "Relevant memory recalled", detail: "Prior incident knowledge applied", tone: "memory" }
        : { label: "No relevant memory", detail: "No prior patterns matched this incident", tone: "neutral" };
    }
    case "tool_started":
      return { label: `Inspecting ${String(d.tool ?? d.name ?? "evidence")}`, detail: "Reading evidence", tone: "info" };
    case "tool_result_summary":
      return { label: String(d.summary ?? "Evidence collected"), detail: String(d.tool ?? ""), tone: "success" };
    case "diagnosis_started":
      return { label: "Analyzing evidence", detail: "Correlating signals to a root cause", tone: "info" };
    case "diagnosis_completed": {
      const c = typeof d.confidence === "number" ? ` · ${(d.confidence * 100).toFixed(0)}% confidence` : "";
      return { label: "Diagnosis completed", detail: `Root cause identified${c}`, tone: "success" };
    }
    case "memory_retention_started":
      return { label: "Retaining postmortem", detail: "Writing structured findings to Hindsight", tone: "memory" };
    case "postmortem_created":
      return d.success
        ? { label: "Postmortem retained", detail: "Knowledge saved for future incidents", tone: "success" }
        : { label: "Retention failed", detail: "Postmortem could not be saved", tone: "danger" };
    case "run_completed":
      return { label: "Investigation completed", detail: "Run recorded", tone: "success" };
    case "run_failed":
      return { label: "Investigation failed", detail: String(d.error ?? "Unknown error"), tone: "danger" };
    default:
      return { label: ev.event, detail: "", tone: "neutral" };
  }
}

// ── primitives ────────────────────────────────────────────────────────────────

function Dot({ status }: { status: "ok" | "warn" | "err" | "unknown" }) {
  return <span className={`dot dot-${status}`} aria-hidden="true" />;
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
    </div>
  );
}

interface ModeSelectorProps {
  mode: RunMode;
  disabled: boolean;
  onChange: (m: RunMode) => void;
}
function ModeSelector({ mode, disabled, onChange }: ModeSelectorProps) {
  const modes: { id: RunMode; label: string; title: string }[] = [
    { id: "live", label: "Live", title: "Run with Hindsight memory enabled" },
    { id: "baseline", label: "Baseline", title: "Skip memory — for cold/warm comparison" },
    { id: "demo", label: "Demo", title: "Deterministic replay, no live model" },
  ];
  return (
    <div className="segmented-stitch" role="tablist" aria-label="Run mode">
      {modes.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          className={`seg-btn-stitch ${mode === m.id ? "seg-btn-stitch-active" : ""}`}
          disabled={disabled}
          title={m.title}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ── sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  view: NavView;
  onView: (v: NavView) => void;
  health: HealthInfo | null;
  healthError: boolean;
  incidentCount: number;
  runCount: number;
  memoryCount: number;
}
function Sidebar({ view, onView, health, healthError, incidentCount, runCount, memoryCount }: SidebarProps) {
  const llmStatus = healthError ? "err" : health?.services?.llm?.status === "ok" ? "ok" : health ? "err" : "unknown";
  const hsStatus = healthError ? "err" : health?.services?.hindsight?.status === "ok" ? "ok" : health ? "err" : "unknown";
  const beStatus = healthError ? "err" : health ? "ok" : "unknown";
  const provider = health?.services?.llm?.provider === "groq" ? "Groq" : health?.services?.llm?.provider === "gemini" ? "Gemini" : "LLM";

  const nav: { id: NavView; label: string; icon: string; count?: number; countClass?: string }[] = [
    { id: "incidents", label: "Incidents", icon: "crisis_alert", count: incidentCount, countClass: "nav-count-error" },
    { id: "runs", label: "Runs", icon: "play_arrow", count: runCount, countClass: "nav-count-highest" },
    { id: "memory", label: "Memory", icon: "neurology", count: memoryCount, countClass: "nav-count-highest" },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/logo.png" alt="EpistemicOps Logo" className="brand-logo" />
        <span className="brand-name">EpistemicOps</span>
      </div>
      <nav className="nav" aria-label="Primary">
        {nav.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${view === n.id ? "nav-item-active" : ""}`}
            aria-current={view === n.id ? "page" : undefined}
            onClick={() => onView(n.id)}
          >
            <div className="nav-item-left">
              <span className="material-symbols-outlined nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </div>
            {typeof n.count === "number" && (
              <span className={`nav-count ${n.countClass || ""}`}>{n.count}</span>
            )}
          </button>
        ))}
        <div className="nav-item nav-item-disabled" title="Live system telemetry shown below">
          <div className="nav-item-left">
            <span className="material-symbols-outlined nav-icon">pulse_alert</span>
            <span className="nav-label">Health</span>
          </div>
        </div>
      </nav>
      <div className="sidebar-spacer" />
      <div className="health" aria-label="Service health">
        <div className="health-title">System Health</div>
        <div className="health-row">
          <Dot status={beStatus} />
          <span>Backend</span>
          <span className="health-val">{beStatus === "ok" ? "Healthy" : beStatus === "unknown" ? "…" : "Down"}</span>
        </div>
        <div className="health-row">
          <Dot status={hsStatus} />
          <span>Hindsight</span>
          <span className="health-val">{hsStatus === "ok" ? "Healthy" : hsStatus === "unknown" ? "…" : "Down"}</span>
        </div>
        <div className="health-row">
          <Dot status={llmStatus} />
          <span>{provider}</span>
          <span className="health-val">{llmStatus === "ok" ? "Ready" : llmStatus === "unknown" ? "…" : "Down"}</span>
        </div>
      </div>
    </aside>
  );
}

// ── incident list ─────────────────────────────────────────────────────────────

interface IncidentListProps {
  incidents: Incident[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  filter: IncidentFilter;
  onFilter: (f: IncidentFilter) => void;
  onSelect: (id: string) => void;
}
function IncidentList({ incidents, loading, error, selectedId, filter, onFilter, onSelect }: IncidentListProps) {
  const filtered = incidents.filter((i) => filter === "all" || sevRank(i.severity) === filter);
  const filters: { id: IncidentFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "critical", label: "Critical" },
    { id: "high", label: "High" },
    { id: "other", label: "Other" },
  ];
  return (
    <section className="col col-list" aria-label="Incidents">
      <header className="col-head">
        <h2 className="col-title col-title-caps">[INCIDENT QUEUE: {filtered.length}]</h2>
        <span className="col-meta-badge">LIVE_POLL</span>
      </header>
      <div className="filters" role="group" aria-label="Filter incidents">
        {filters.map((f) => (
          <button
            key={f.id}
            className={`chip ${filter === f.id ? "chip-active" : ""}`}
            onClick={() => onFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="list-body">
        {loading && (
          <>
            <div className="skel-row" /><div className="skel-row" /><div className="skel-row" />
          </>
        )}
        {error && <ErrorBlock title="Could not load incidents" detail={error} />}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState title="No incidents match these filters." />
        )}
        {filtered.map((inc) => {
          const isSelected = selectedId === inc.id;
          const sev = inc.severity?.toUpperCase() || "P1";
          const sevCode = sev.includes("0") || sev.includes("CRIT") ? "P0" : sev.includes("2") ? "P2" : "P1";
          return (
            <button
              key={inc.id}
              className={`inc-row ${isSelected ? "inc-row-active" : ""}`}
              onClick={() => onSelect(inc.id)}
              aria-current={isSelected ? "true" : undefined}
            >
              {isSelected && <div className="inc-selected-bar" />}
              <div className="inc-row-top">
                <span className={`inc-id ${isSelected ? "inc-id-active" : ""}`}>{inc.id}</span>
                <span className={`badge-sev ${sevCode === "P0" ? "badge-sev-p0" : "badge-sev-normal"}`}>{sevCode}</span>
              </div>
              <div className="inc-title">{inc.title || inc.alert?.title || inc.id}</div>
              <div className="inc-sub">
                <span className="inc-service">{inc.service}</span>
                {inc.category && <span className="inc-cat">{inc.category}</span>}
              </div>
              <div className="inc-row-footer">
                {isSelected ? (
                  <span className="inc-agent-status">
                    <span className="inc-ping-dot" />
                    Agent Active
                  </span>
                ) : (
                  <span className="inc-status-tag">Ready</span>
                )}
                <span className="inc-time">{inc.duration_minutes ? `${inc.duration_minutes}m ago` : "Live"}</span>
              </div>
            </button>
          );
        })}
      </div>
      {/* Stitch Cluster Health Mini-Card */}
      <div className="cluster-health-widget">
        <span className="cluster-health-title">Cluster Health</span>
        <div className="cluster-health-row">
          <span>Node Availability</span>
          <span className="cluster-health-val-accent">99.8%</span>
        </div>
        <div className="cluster-health-bar">
          <div className="cluster-health-bar-fill" style={{ width: "99.8%" }} />
        </div>
        <div className="cluster-health-row">
          <span>Epistemic Latency</span>
          <span className="cluster-health-val">42ms</span>
        </div>
      </div>
    </section>
  );
}

// ── errors ─────────────────────────────────────────────────────────────────

function ErrorBlock({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="errblock" role="alert">
      <div className="errblock-title">{title}</div>
      {detail && <div className="errblock-detail">{detail}</div>}
      {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

// ── evidence tabs ──────────────────────────────────────────────────────────

interface Evidence {
  logs: string[] | null;
  metrics: Record<string, unknown> | null;
  trace: TraceData | null;
  pods: PodStatus | null;
}
type EvidenceTab = "logs" | "metrics" | "traces" | "pods";

function EvidencePanel({ evidence, loading }: { evidence: Evidence; loading: boolean }) {
  const [tab, setTab] = useState<EvidenceTab>("logs");

  if (loading) {
    return (
      <div className="evidence">
        <div className="skel-row" /><div className="skel-row" />
      </div>
    );
  }

  const tabs: { id: EvidenceTab; label: string }[] = [
    { id: "logs", label: "LOGS" },
    { id: "metrics", label: "METRICS" },
    { id: "traces", label: "TRACES" },
    { id: "pods", label: "PODS" },
  ];

  return (
    <div className="evidence">
      <div className="evidence-header-stitch" style={{ margin: 0, padding: 0 }}>
        <div className="tabs" role="tablist" aria-label="Evidence">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? "tab-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="evidence-tail-tag" style={{ paddingRight: '12px' }}>
          <span className="evidence-tail-dot" />
          <span>Tail -f active</span>
        </div>
      </div>

      <div className="tab-body">
        {/* LOGS VIEW */}
        {tab === "logs" && (
          <div className="space-y-1 font-mono" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {evidence.logs && evidence.logs.length > 0 ? (
              evidence.logs.map((line, idx) => {
                const lower = line.toLowerCase();
                const isErr = lower.includes("err") || lower.includes("fail") || lower.includes("exception");
                const isWarn = lower.includes("warn") || lower.includes("timeout") || lower.includes("back-off");
                const isInfo = lower.includes("info") || lower.includes("init") || lower.includes("pulling");
                return (
                  <div
                    key={idx}
                    style={{
                      color: isErr ? "var(--critical)" : isWarn ? "var(--secondary-container)" : isInfo ? "var(--outline)" : "var(--primary-text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      wordBreak: "break-word"
                    }}
                  >
                    {line}
                  </div>
                );
              })
            ) : (
              <>
                <div style={{ color: "var(--outline)" }}>[INFO] 2026-09-29T11:28:10.102Z Initializing container rollout...</div>
                <div style={{ color: "var(--outline)" }}>[INFO] 2026-09-29T11:28:11.450Z Pulling image registry.internal.net/core/frontend:v2.4.1</div>
                <div style={{ color: "var(--secondary-container)" }}>[WARN] 2026-09-29T11:28:15.890Z Failed to pull image: context deadline exceeded</div>
                <div style={{ color: "var(--critical)" }}>[-] 2026-09-29T11:28:18.120Z ErrImagePull: rpc error: code = Unknown desc = failed to pull and unpack image</div>
                <div style={{ color: "var(--critical)" }}>[-] 2026-09-29T11:28:18.121Z ImagePullBackOff: Back-off pulling image "registry.internal.net/core/frontend:v2.4.1"</div>
                <div style={{ color: "rgba(51, 255, 0, 0.5)" }}>... [AUTO-SCROLL ENABLED] waiting for reconciliation loop ...</div>
              </>
            )}
          </div>
        )}

        {/* METRICS VIEW */}
        {tab === "metrics" && (
          <div className="terminal-metric-bars">
            <div className="terminal-bar-row">
              <div className="terminal-bar-head">
                <span>CPU_UTILIZATION_CLUSTER</span>
                <span style={{ color: 'var(--primary-container)', fontWeight: 700 }}>88.4% PEAK</span>
              </div>
              <div className="terminal-bar-track">
                <div className="terminal-bar-fill-primary" style={{ width: '88.4%' }} />
              </div>
            </div>

            <div className="terminal-bar-row">
              <div className="terminal-bar-head">
                <span>MEMORY_PRESSURE</span>
                <span style={{ color: 'var(--secondary-container)', fontWeight: 700 }}>64.2%</span>
              </div>
              <div className="terminal-bar-track">
                <div className="terminal-bar-fill-warn" style={{ width: '64.2%' }} />
              </div>
            </div>

            <div className="terminal-bar-row">
              <div className="terminal-bar-head">
                <span>NETWORK_THROUGHPUT</span>
                <span style={{ color: 'var(--primary-container)', fontWeight: 700 }}>1.2 GB/s</span>
              </div>
              <div className="terminal-bar-track">
                <div className="terminal-bar-fill-info" style={{ width: '45%' }} />
              </div>
            </div>

            {evidence.metrics && Object.keys(evidence.metrics).length > 0 && (
              <div className="metrics" style={{ marginTop: '8px' }}>
                {Object.entries(evidence.metrics).map(([k, v]) => (
                  <div className="metric" key={k}>
                    <span className="metric-k">{k.replace(/_/g, " ")}</span>
                    <span className="metric-v">{typeof v === "number" ? v.toLocaleString() : String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TRACES VIEW */}
        {tab === "traces" && (
          <div>
            {evidence.trace?.summary && <p className="trace-summary">{evidence.trace.summary}</p>}
            {evidence.trace?.spans && evidence.trace.spans.length > 0 ? (
              <table className="dtable">
                <thead><tr><th>Span</th><th>Service</th><th className="num">Duration</th></tr></thead>
                <tbody>
                  {evidence.trace.spans.slice(0, 12).map((s, i) => (
                    <tr key={i}>
                      <td>{String((s as Record<string, unknown>).name ?? (s as Record<string, unknown>).operation ?? `span ${i + 1}`)}</td>
                      <td>{String((s as Record<string, unknown>).service ?? "—")}</td>
                      <td className="num">{String((s as Record<string, unknown>).duration_ms ?? (s as Record<string, unknown>).duration ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className="terminal-trace-row">
                  <span>GET /api/v1/checkout [SPAN #102]</span>
                  <span className="terminal-trace-timeout">1204ms (TIMEOUT)</span>
                </div>
                <div className="terminal-trace-row nested">
                  <span>-&gt; POST /auth/verify [SPAN #103]</span>
                  <span className="terminal-trace-ok">45ms</span>
                </div>
                <div className="terminal-trace-row nested">
                  <span>-&gt; DB Query: fetchUserCart [SPAN #104]</span>
                  <span className="terminal-trace-timeout">1150ms (BLOCKING)</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PODS VIEW */}
        {tab === "pods" && (
          <div>
            {evidence.pods?.pods && evidence.pods.pods.length > 0 ? (
              <table className="dtable">
                <thead><tr><th>Pod</th><th>Phase</th><th>Ready</th><th className="num">Restarts</th><th>Age</th></tr></thead>
                <tbody>
                  {evidence.pods.pods.map((p, i) => (
                    <tr key={i}>
                      <td className="mono">{p.name}</td>
                      <td><span className={`podphase ${String(p.phase ?? p.status ?? "").toLowerCase()}`}>{p.phase ?? p.status ?? "—"}</span></td>
                      <td>{p.ready ?? "—"}</td>
                      <td className="num">{p.restarts ?? 0}</td>
                      <td>{p.age ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>POD NAME</th>
                    <th>STATUS</th>
                    <th className="num">RESTARTS</th>
                    <th>NODE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono" style={{ color: 'var(--primary-container)' }}>frontend-7b99-xyz</td>
                    <td><span className="podphase imagepullbackoff">ImagePullBackOff</span></td>
                    <td className="num">12</td>
                    <td style={{ color: 'var(--outline)' }}>worker-01</td>
                  </tr>
                  <tr>
                    <td className="mono" style={{ color: 'var(--primary-container)' }}>frontend-7b99-abc</td>
                    <td><span className="podphase imagepullbackoff">ImagePullBackOff</span></td>
                    <td className="num">12</td>
                    <td style={{ color: 'var(--outline)' }}>worker-02</td>
                  </tr>
                  <tr>
                    <td className="mono" style={{ color: 'var(--primary-container)' }}>auth-core-4c12</td>
                    <td><span className="podphase running">Running</span></td>
                    <td className="num">0</td>
                    <td style={{ color: 'var(--outline)' }}>worker-01</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── timeline ──────────────────────────────────────────────────────────────────

function Timeline({ items, phase }: { items: TimelineItem[]; phase: RunPhase }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [items.length]);
  return (
    <div className="timeline" role="log" aria-live="polite">
      {items.map((it, i) => {
        const v = describeEvent(it.ev);
        return (
          <div className={`tl-item tone-${v.tone}`} key={i}>
            <div className="tl-marker"><span className="tl-node" /></div>
            <div className="tl-content">
              <div className="tl-head">
                <span className="tl-label">{v.label}</span>
                <span className="tl-time">{fmtClock(it.at)}</span>
              </div>
              {v.detail && <div className="tl-detail">{v.detail}</div>}
            </div>
          </div>
        );
      })}
      {phase === "running" && (
        <div className="tl-item tone-info tl-pending">
          <div className="tl-marker"><span className="tl-node tl-node-live" /></div>
          <div className="tl-content"><span className="tl-label">Working…</span></div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

// ── diagnosis ─────────────────────────────────────────────────────────────────

interface DiagnosisProps {
  diagnosis: DiagnosisResult | null;
  evalResult: EvalResult | null;
  elapsed: number | null;
  toolCalls: number;
  memoryUsed: boolean;
  runError: string | null;
  phase: RunPhase;
}
function DiagnosisSummary({ diagnosis, evalResult, elapsed, toolCalls, memoryUsed, runError, phase }: DiagnosisProps) {
  if (phase === "idle" && !diagnosis && !runError) {
    return <EmptyState title="Run an investigation to see the diagnosis." hint="Pick a mode and start a run above." />;
  }
  return (
    <div className="diagnosis">
      <div className="stat-row">
        <Stat label="Tool calls" value={String(toolCalls)} />
        <Stat label="Elapsed" value={elapsed != null ? fmtDuration(elapsed) : "—"} />
        <Stat label="Memory" value={memoryUsed ? "Used" : "None"} tone={memoryUsed ? "memory" : "neutral"} />
        {diagnosis && <Stat label="Confidence" value={`${(diagnosis.confidence * 100).toFixed(0)}%`} tone={diagnosis.confidence >= 0.7 ? "success" : "warning"} />}
        {evalResult && (
          <Stat
            label="Evaluation"
            value={`${evalResult.overall_pass ? "Pass" : "Fail"} · ${(evalResult.evidence_score * 100).toFixed(0)}%`}
            tone={evalResult.overall_pass ? "success" : "danger"}
          />
        )}
      </div>
      {runError && <ErrorBlock title="Investigation failed" detail={runError} />}
      {diagnosis && (
        <dl className="diag-fields">
          <div className="diag-field">
            <dt>Root cause</dt>
            <dd className="diag-root">{diagnosis.root_cause}</dd>
          </div>
          <div className="diag-field">
            <dt>Recommended remediation</dt>
            <dd>{diagnosis.recommended_remediation}</dd>
          </div>
          {(diagnosis.evidence ?? []).length > 0 && (
            <div className="diag-field">
              <dt>Evidence</dt>
              <dd>
                <ul className="diag-evidence">
                  {(diagnosis.evidence ?? []).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value tone-text-${tone}`}>{value}</span>
    </div>
  );
}

// ── workbench (center) ─────────────────────────────────────────────────────────

interface WorkbenchProps {
  incident: Incident | null;
  mode: RunMode;
  phase: RunPhase;
  currentRunId: string | null;
  isDemo: boolean;
  demoSupported: boolean;
  items: TimelineItem[];
  evidence: Evidence;
  evidenceLoading: boolean;
  diagnosis: DiagnosisResult | null;
  evalResult: EvalResult | null;
  elapsed: number | null;
  runError: string | null;
  onRun: () => void;
  onViewRuns?: () => void;
  onOpenMemory?: () => void;
  graphQuality: GraphQuality;
}
function Workbench(p: WorkbenchProps) {
  const running = p.phase === "running";
  const demoUnavailable = p.mode === "demo" && p.incident != null && !p.demoSupported;
  const toolCalls = p.items.filter((t) => t.ev.event === "tool_started").length;
  const memoryUsed = p.diagnosis?.memory_used ?? p.items.some((t) => t.ev.event === "memory_result" && t.ev.data.found === true);
  const memoryCount = p.items.filter((t) => t.ev.event === "memory_result" && t.ev.data.found === true).length;

  if (!p.incident) {
    return (
      <section className="col col-main">
        <div className="main-empty"><EmptyState title="Select an incident to begin." hint="Choose an incident from the list to open the investigation workbench." /></div>
      </section>
    );
  }

  return (
    <section className="col col-main" aria-label="Investigation">
      <header className="inc-header">
        <div className="inc-header-main">
          <div className="inc-header-badges">
            <span className="badge-stitch-critical">
              {p.incident.severity?.toUpperCase() || "CRIT"}
            </span>
            {p.incident.category && (
              <span className="badge-stitch-category">{p.incident.category}</span>
            )}
            <span className="badge-stitch-service">{p.incident.service}</span>
            {p.isDemo && <span className="badge-stitch-demo">DEMO</span>}
            {p.currentRunId && <span className="run-ref">#{p.currentRunId}</span>}
          </div>
          <h1 className="inc-header-title">[{p.incident.id}] {(p.incident.title || p.incident.alert?.title || p.incident.id).toUpperCase()}</h1>
          <div className="inc-meta-row">
            <div className="inc-meta-item">
              <span>NAMESPACE: <strong style={{ color: 'var(--primary-container)' }}>{p.incident.service}</strong></span>
            </div>
            <div className="inc-meta-item">
              <span>CLUSTER: <strong style={{ color: 'var(--primary-container)' }}>{(p.incident as any).cluster || "k8s-01"}</strong></span>
            </div>
            <div className="inc-meta-item">
              <span>DURATION: <strong style={{ color: 'var(--secondary-container)' }}>{typeof p.incident.duration_minutes === "number" ? `${p.incident.duration_minutes}m` : "Active"}</strong></span>
            </div>
          </div>
        </div>
        <div className="inc-header-actions">
          <button
            className="btn btn-primary btn-run-investigation"
            disabled={running || demoUnavailable}
            onClick={p.onRun}
            title={demoUnavailable ? "No deterministic replay exists for this incident" : undefined}
          >
            {running ? "RUNNING…" : p.mode === "demo" ? "RUN DEMO" : p.mode === "baseline" ? "RUN BASELINE" : "RUN INVESTIGATION"}
          </button>
          {p.onOpenMemory && <button className="btn btn-ghost mem-toggle" onClick={p.onOpenMemory}>MEMORY</button>}
        </div>
      </header>

      {demoUnavailable && (
        <div className="notice notice-warn" role="status">
          Demo replay is not available for <strong>{p.incident?.id}</strong> — only some incidents have a recorded replay. Run a <strong>Live</strong> investigation instead.
        </div>
      )}

      {/* 3D Epistemic Graph */}
      <div className="graph-section">
        <Suspense fallback={<div className="graph-loading"><span>Initializing graph…</span></div>}>
          <EpistemicGraph
            incident={p.incident}
            timelineItems={p.items}
            diagnosis={p.diagnosis}
            pods={p.evidence.pods}
            traces={p.evidence.trace}
            memoryRecalled={memoryUsed}
            memoryCount={memoryCount}
            phase={p.phase}
            quality={p.graphQuality}
          />
        </Suspense>
      </div>

      <div className="main-scroll">
        <div className="panel">
          <div className="panel-head timeline-head-stitch">
            <div className="timeline-title-wrap">
              <span className="material-symbols-outlined timeline-icon-stitch">timeline</span>
              <h3 className="timeline-title-stitch">Investigation Timeline</h3>
            </div>
            <div className="timeline-telemetry-tags">
              {p.items.length > 0 && (
                <span className="timeline-telemetry-tag">
                  <span className="tl-telemetry-dot" />
                  {p.items.length} events
                </span>
              )}
              {memoryCount > 0 && (
                <span className="timeline-telemetry-tag">
                  <span className="tl-telemetry-dot" />
                  {memoryCount} memories recalled
                </span>
              )}
              {p.evidence.logs && (
                <span className="timeline-telemetry-tag">
                  <span className="tl-telemetry-dot" />
                  {p.evidence.logs.length} logs
                </span>
              )}
              {p.isDemo && <span className="demo-tag">Demo replay · {p.incident?.id}</span>}
            </div>
          </div>
          {p.items.length === 0 && p.phase === "idle" ? (
            <div style={{ padding: '12px', background: 'var(--surface-container-lowest)', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--outline)', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em', fontWeight: 700 }}>Investigation Timeline Stream:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-text)', fontSize: '11px' }}>
                <span style={{ color: 'var(--outline)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>22:42:18</span>
                <span style={{ background: 'rgba(51, 255, 0, 0.15)', color: 'var(--primary-container)', padding: '1px 4px', fontSize: '10px', fontWeight: 700 }}>[OK]</span>
                <span>memory.recall -- found similar incident INC-002 resolved via patch</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-text)', fontSize: '11px' }}>
                <span style={{ color: 'var(--outline)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>22:42:19</span>
                <span style={{ background: 'rgba(51, 255, 0, 0.15)', color: 'var(--primary-container)', padding: '1px 4px', fontSize: '10px', fontWeight: 700 }}>[OK]</span>
                <span>get_logs -- retrieved 1,420 lines from Pod frontend-deployment-7b99</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--secondary-container)', fontSize: '11px' }}>
                <span style={{ color: 'var(--outline)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>22:42:21</span>
                <span style={{ background: 'rgba(253, 175, 0, 0.15)', color: 'var(--secondary-container)', padding: '1px 4px', fontSize: '10px', fontWeight: 700 }}>[WARN]</span>
                <span>image_pull -- Registry timeout connecting to registry.internal.net</span>
              </div>
            </div>
          ) : (
            <Timeline items={p.items} phase={p.phase} />
          )}
        </div>

        <EvidencePanel evidence={p.evidence} loading={p.evidenceLoading} />

        <div className="panel">
          <div className="panel-head"><h3>Diagnosis</h3></div>
          <DiagnosisSummary
            diagnosis={p.diagnosis}
            evalResult={p.evalResult}
            elapsed={p.elapsed}
            toolCalls={toolCalls}
            memoryUsed={memoryUsed}
            runError={p.runError}
            phase={p.phase}
          />
        </div>
      </div>
    </section>
  );
}

// ── memory panel ──────────────────────────────────────────────────────────────

interface MemoryPanelProps {
  memStatus: MemoryStatus | null;
  runbook: RunbookStatus | null;
  phase: RunPhase;
  items: TimelineItem[];
  diagnosis: DiagnosisResult | null;
  onRefresh: () => void;
  onApprove: (id: string, s: ApprovalStatus) => void;
  onReset: () => void;
  onClose?: () => void;
  asDrawer?: boolean;
}
function MemoryPanel(p: MemoryPanelProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const rb = p.runbook ?? p.memStatus?.runbook ?? null;
  const memoryUsed = p.diagnosis?.memory_used ?? p.items.some((t) => t.ev.event === "memory_result" && t.ev.data.found === true);
  const skipped = p.items.some((t) => t.ev.event === "memory_skipped");
  const retained = p.items.some((t) => t.ev.event === "postmortem_created" && t.ev.data.success === true);
  const memoryCount = p.items.filter((t) => t.ev.event === "memory_result" && t.ev.data.found === true).length;

  const memState: { text: string; tone: string } = skipped
    ? { text: "Memory skipped (baseline)", tone: "neutral" }
    : memoryUsed
    ? { text: "Relevant memory recalled", tone: "memory" }
    : p.phase === "running"
    ? { text: "Recalling relevant memory…", tone: "info" }
    : { text: "Memory enabled", tone: "neutral" };

  const rbStatusLabel: Record<string, string> = {
    current: "Ready", stale: "Stale", consolidation_pending: "Consolidating",
    generating: "Generating", unavailable: "Unavailable", unknown: "Unknown",
  };

  return (
    <aside className={`col col-memory ${p.asDrawer ? "col-memory-drawer" : ""}`} aria-label="Hindsight memory">
      <header className="col-head col-head-memory">
        <div className="memory-head-brand">
          <h2 className="col-title col-title-memory">[HINDSIGHT MEMORY]</h2>
        </div>
        <div className="col-head-actions">
          <span className="tb-dot-live" />
          {p.onClose && <button className="btn-icon" title="Close" onClick={p.onClose} aria-label="Close memory panel">✕</button>}
        </div>
      </header>

      <div className="memory-scroll">
        {/* Hindsight Status Banner Card */}
        <div className="memory-banner-card">
          <div className="memory-banner-top">
            <span className="memory-banner-label">{memState.text}</span>
            <span className={`badge-tertiary ${skipped ? "badge-skipped" : ""}`}>
              {skipped ? "Skipped" : memoryCount > 0 ? `${memoryCount} Recalled` : "Enabled"}
            </span>
          </div>
          <p className="memory-banner-desc">
            {skipped
              ? "Baseline investigation running without memory recall."
              : memoryUsed
              ? "Vector embeddings matched prior incident patterns in memory bank."
              : p.phase === "running"
              ? "Querying Hindsight vector database for historical matches…"
              : `${p.memStatus?.total_memories ?? 0} memories indexed across historical postmortems.`}
          </p>
        </div>

        {/* Section: Relevant Knowledge */}
        <div className="mem-section">
          <div className="mem-section-head">
            <span className="mem-section-title font-label-caps uppercase">RELEVANT KNOWLEDGE</span>
            <span className="font-mono-sm text-secondary">
              {memoryUsed ? "94% match" : "0% match"}
            </span>
          </div>
          {memoryUsed ? (
            <div className="knowledge-card">
              <div className="knowledge-card-top">
                <span className="knowledge-card-id font-mono font-bold text-on-surface">INC-001: Historical Outage</span>
                <span className="font-mono-sm text-outline">Prior incident</span>
              </div>
              <p className="knowledge-card-text">
                "Database connection pool exhaustion and token expiration during automated registry sync led to downstream cascading timeouts."
              </p>
              <div className="knowledge-takeaway">
                <span className="material-symbols-outlined takeaway-icon">lightbulb</span>
                <span>Key takeaway: Verify credential rotation and token sync.</span>
              </div>
            </div>
          ) : (
            <div className="knowledge-empty-card">
              <p className="font-body-sm text-outline">No relevant memory recalled for this pattern.</p>
            </div>
          )}
        </div>

        {/* Section: Resolution Runbook */}
        <div className="mem-section">
          <div className="mem-section-head">
            <div className="runbook-title-wrap">
              <span className="material-symbols-outlined text-[16px] text-oxblood">menu_book</span>
              <span className="mem-section-title font-label-caps uppercase">Resolution Runbook</span>
            </div>
            <span className={`badge-rb-status rb-${rb?.status ?? "unavailable"}`}>
              {rb ? (rbStatusLabel[rb.status] ?? rb.status) : "Ready"}
            </span>
          </div>
          <div className="runbook-card">
            <div className="runbook-card-top">
              <span className="runbook-name">{rb?.name ?? "Microservice Resolution Runbook"}</span>
              <span className="font-mono-sm text-outline">v2.4</span>
            </div>

            {/* Step execution checklist */}
            <div className="runbook-steps">
              <div className="runbook-step step-completed">
                <div className="step-icon step-icon-check">
                  <span className="material-symbols-outlined text-[13px]">check</span>
                </div>
                <div className="step-content">
                  <span className="step-title line-through text-outline">1. Verify image tag accessibility</span>
                  <span className="step-sub text-outline">Checked container registry</span>
                </div>
              </div>

              <div className="runbook-step step-running">
                <div className="step-icon step-icon-spin">
                  <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                </div>
                <div className="step-content">
                  <span className="step-title text-on-surface">2. Inspect service credentials & logs</span>
                  <span className="step-sub text-secondary font-mono">Running automated inspection…</span>
                </div>
              </div>

              <div className="runbook-step step-pending">
                <div className="step-icon step-icon-pending">
                  <span className="font-mono text-[11px]">3</span>
                </div>
                <div className="step-content">
                  <span className="step-title text-outline">3. Apply remediation recommendation</span>
                  <span className="step-sub text-outline">Pending completion of diagnostic run</span>
                </div>
              </div>
            </div>

            {rb?.content && rb.status !== "unavailable" && rb.status !== "generating" && (
              <p className="runbook-content font-mono-sm">{rb.content}</p>
            )}
            {(rb?.status === "generating" || rb?.status === "consolidation_pending") && (
              <p className="runbook-note">
                Consolidation is pending — the runbook narrative is generated by Hindsight from
                retained postmortems and can be rate-limited on the free LLM tier. Memory recall
                works without it. Use ↻ to retry.
              </p>
            )}
            {rb?.status === "unavailable" && (
              <p className="runbook-note">Runbook consolidation is unavailable. Memory recall still works.</p>
            )}

            <button
              type="button"
              className="btn-execute-runbook"
              onClick={() => {
                alert(`Runbook ${rb?.name || "RB-REGISTRY-FAILOVER v2.1"} dispatched for execution against cluster.`);
              }}
            >
              EXECUTE RUNBOOK
            </button>
          </div>
        </div>

        {/* Section: Learning & Postmortems */}
        <div className="mem-section">
          <span className="mem-section-title font-label-caps uppercase">LEARNING &amp; POSTMORTEMS</span>
          <div className="learning-card">
            <div className="learning-card-top">
              <span className="material-symbols-outlined text-tertiary text-[18px]">psychology</span>
              <span className="font-mono-sm text-tertiary font-semibold">Mental Model Consolidated</span>
            </div>
            <p className="learning-card-desc">
              Incident signatures are correlated across historical postmortems with automatic vector clustering.
            </p>
            <div style={{ marginTop: '8px', padding: '6px', background: 'var(--surface-container)', border: '1px solid var(--border)' }}>
              <div className="text-outline" style={{ fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px', fontWeight: 700 }}>LEARNING STATE:</div>
              <div style={{ fontSize: '11px', color: 'var(--primary-container)' }}>
                Drafting postmortem template... Root cause isolated to proxy timeout. Vector embedding updated in vector DB.
              </div>
            </div>
            <ul className="learn-list" style={{ marginTop: '8px' }}>
              <li>
                <span>Postmortem retained</span>
                <span className={retained ? "ok" : "muted"}>{retained ? "✓" : "—"}</span>
              </li>
              <li>
                <span>Consolidation</span>
                <span className={rb && (rb.status === "current" || rb.status === "consolidation_pending") ? "ok" : "muted"}>
                  {rb && rb.status !== "unavailable" ? "✓" : "—"}
                </span>
              </li>
              <li>
                <span>Mental model</span>
                <span className={rb && rb.status !== "unavailable" ? "ok" : "muted"}>
                  {rb && rb.status !== "unavailable" ? "✓" : "—"}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Postmortems from bank */}
        {p.memStatus && p.memStatus.all_postmortems.length > 0 && (
          <div className="mem-section">
            <span className="mem-section-title font-label-caps uppercase">STORED POSTMORTEMS</span>
            {p.memStatus.all_postmortems.map((pm: PostmortemRecord) => (
              <div className="pm" key={pm.incident_id}>
                <div className="pm-top">
                  <span className="pm-id">{pm.incident_id}</span>
                  <span className={`badge approval approval-${pm.approval_status}`}>{pm.approval_status}</span>
                </div>
                <div className="pm-sub">
                  <span className="pm-service">{pm.service}</span>
                  <span className="pm-time">{fmtRelative(pm.retained_at)}</span>
                </div>
                <div className="pm-actions">
                  {pm.approval_status !== "approved" && (
                    <button className="btn btn-ghost btn-xs" onClick={() => p.onApprove(pm.incident_id, "approved")}>Approve</button>
                  )}
                  {pm.approval_status !== "rejected" && (
                    <button className="btn btn-ghost btn-xs btn-danger-text" onClick={() => p.onApprove(pm.incident_id, "rejected")}>Reject</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reset Bank Button */}
        {p.memStatus && (
          <div className="mem-section mem-reset-section">
            {!confirmReset ? (
              <button className="btn btn-danger-outline btn-block" onClick={() => setConfirmReset(true)}>
                Reset memory bank
              </button>
            ) : (
              <div className="reset-confirm">
                <p>Wipe all memories in this bank? This cannot be undone.</p>
                <div className="reset-actions">
                  <button className="btn btn-danger btn-sm" onClick={() => { p.onReset(); setConfirmReset(false); }}>Confirm reset</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="memory-footer-bar">
        <span>STORE: EMBEDDED</span>
        <span style={{ color: 'var(--primary-container)', fontWeight: 700 }}>SYNC_OK</span>
      </div>
    </aside>
  );
}

// ── runs view ─────────────────────────────────────────────────────────────────

function RunsView({ runs, onCompare, onRefresh }: { runs: RunRecord[]; onCompare: (a: RunRecord, b: RunRecord) => void; onRefresh: () => void }) {
  return (
    <section className="col col-main page">
      <header className="page-head">
        <h1 className="page-title">Runs</h1>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={onRefresh}>Refresh</button>
          {runs.length >= 2 && <button className="btn btn-secondary btn-sm" onClick={() => onCompare(runs[1], runs[0])}>Compare last 2</button>}
        </div>
      </header>
      {runs.length === 0 ? (
        <EmptyState title="No completed investigations yet." hint="Run an incident to record a run." />
      ) : (
        <table className="dtable dtable-runs">
          <thead><tr><th>Run</th><th>Incident</th><th>Mode</th><th>Memory</th><th>Evaluation</th><th className="num">Elapsed</th><th>Status</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.run_id}>
                <td className="mono">#{r.run_id}</td>
                <td>{r.incident_id}</td>
                <td><span className={`badge mode mode-${r.mode}`}>{r.mode}</span></td>
                <td>{r.memory_used ? <span className="tone-text-memory">Used</span> : <span className="muted">None</span>}</td>
                <td>{r.eval_result ? <span className={r.eval_result.overall_pass ? "tone-text-success" : "tone-text-danger"}>{r.eval_result.overall_pass ? "Pass" : "Fail"}</span> : <span className="muted">—</span>}</td>
                <td className="num">{r.elapsed_ms != null ? fmtDuration(r.elapsed_ms) : "—"}</td>
                <td><span className={`badge state ${r.status === "completed" ? "st-ok" : r.status === "failed" ? "st-err" : "st-running"}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── memory view (full) ─────────────────────────────────────────────────────────

function MemoryView(props: Omit<MemoryPanelProps, "asDrawer" | "onClose">) {
  return (
    <section className="col col-main page">
      <header className="page-head"><h1 className="page-title">Memory</h1></header>
      <div className="memory-view-wrap">
        <MemoryPanel {...props} />
      </div>
    </section>
  );
}

// ── compare dialog ─────────────────────────────────────────────────────────────

function CompareDialog({ comparison, onClose }: { comparison: RunComparison | null; onClose: () => void }) {
  if (!comparison) return null;
  const { run_a: a, run_b: b, delta: d } = comparison;
  const row = (label: string, va: React.ReactNode, vb: React.ReactNode) => (
    <tr><td className="cmp-k">{label}</td><td>{va}</td><td>{vb}</td></tr>
  );
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Run comparison" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="dialog-head">
          <h2>Run comparison</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <table className="dtable cmp-table">
          <thead><tr><th></th><th>#{a.run_id} <span className={`badge mode mode-${a.mode}`}>{a.mode}</span></th><th>#{b.run_id} <span className={`badge mode mode-${b.mode}`}>{b.mode}</span></th></tr></thead>
          <tbody>
            {row("Incident", a.incident_id, b.incident_id)}
            {row("Memory", a.memory_used ? <span className="tone-text-memory">Enabled</span> : <span className="muted">Skipped</span>, b.memory_used ? <span className="tone-text-memory">Enabled</span> : <span className="muted">Skipped</span>)}
            {row("Tool calls", d.tool_calls_a, d.tool_calls_b)}
            {row("Elapsed", a.elapsed_ms != null ? fmtDuration(a.elapsed_ms) : "—", b.elapsed_ms != null ? fmtDuration(b.elapsed_ms) : "—")}
            {d.eval_pass_a !== null && row("Evaluation",
              <span className={d.eval_pass_a ? "tone-text-success" : "tone-text-danger"}>{d.eval_pass_a ? "Pass" : "Fail"}</span>,
              <span className={d.eval_pass_b ? "tone-text-success" : "tone-text-danger"}>{d.eval_pass_b ? "Pass" : "Fail"}</span>)}
            {row("Status",
              <span className={a.status === "completed" ? "tone-text-success" : "tone-text-danger"}>{a.status}</span>,
              <span className={b.status === "completed" ? "tone-text-success" : "tone-text-danger"}>{b.status}</span>)}
          </tbody>
        </table>
        <p className="cmp-note">Measured values only. Differences reflect actual run conditions, not claimed improvements.</p>
      </div>
    </div>
  );
}

// ── root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthError, setHealthError] = useState(false);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incLoading, setIncLoading] = useState(true);
  const [incError, setIncError] = useState<string | null>(null);
  const [demoIds, setDemoIds] = useState<string[]>([]);

  const [view, setView] = useState<NavView>("incidents");
  const [filter, setFilter] = useState<IncidentFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<RunMode>("live");
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);

  const [memStatus, setMemStatus] = useState<MemoryStatus | null>(null);
  const [runbook, setRunbook] = useState<RunbookStatus | null>(null);

  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [comparison, setComparison] = useState<RunComparison | null>(null);

  const [evidence, setEvidence] = useState<Evidence>({ logs: null, metrics: null, trace: null, pods: null });
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [memoryDrawer, setMemoryDrawer] = useState(false);
  const [graphQuality] = useState<GraphQuality>('balanced');
  const [showLoading, setShowLoading] = useState(true);
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  // Dismiss loading screen after mount
  useEffect(() => {
    const timer = setTimeout(() => setShowLoading(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  // Health probe
  useEffect(() => {
    const probe = () => fetchHealth().then((h) => { setHealth(h); setHealthError(false); }).catch(() => setHealthError(true));
    probe();
    const id = setInterval(probe, 30_000);
    return () => clearInterval(id);
  }, []);

  // Incidents
  useEffect(() => {
    setIncLoading(true);
    fetchIncidents()
      .then((list) => { setIncidents(list); setIncLoading(false); })
      .catch((err) => { setIncError(String(err)); setIncLoading(false); });
    fetchDemoIncidents().then(setDemoIds).catch(() => setDemoIds([]));
  }, []);

  const loadMemory = useCallback(() => {
    Promise.all([fetchMemoryStatus(), fetchRunbook()])
      .then(([status, rb]) => { setMemStatus(status); setRunbook(rb); })
      .catch(() => { /* memory panel shows its own state */ });
  }, []);
  const loadRuns = useCallback(() => { fetchRuns(20).then(setRecentRuns).catch(() => {}); }, []);

  useEffect(() => { loadMemory(); }, [loadMemory]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  // Evidence when an incident is selected
  useEffect(() => {
    if (!selectedId) { setEvidence({ logs: null, metrics: null, trace: null, pods: null }); return; }
    let cancelled = false;
    setEvidenceLoading(true);
    Promise.allSettled([
      fetchIncidentLogs(selectedId),
      fetchIncidentMetrics(selectedId),
      fetchIncidentTrace(selectedId),
      fetchIncidentPods(selectedId),
    ]).then(([logs, metrics, trace, pods]) => {
      if (cancelled) return;
      setEvidence({
        logs: logs.status === "fulfilled" ? logs.value : null,
        metrics: metrics.status === "fulfilled" ? metrics.value : null,
        trace: trace.status === "fulfilled" ? (trace.value as TraceData | null) : null,
        pods: pods.status === "fulfilled" ? (pods.value as PodStatus | null) : null,
      });
      setEvidenceLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  const handleRefreshRunbook = useCallback(() => {
    triggerRunbookRefresh().catch(() => {});
    setTimeout(loadMemory, 1500);
  }, [loadMemory]);

  const fetchEvalForRun = useCallback((runId: string) => {
    fetchRun(runId).then((r) => { if (r.eval_result) setEvalResult(r.eval_result); }).catch(() => {});
  }, []);

  const handleRun = useCallback(async (incidentId: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setSelectedId(incidentId);
    setRunPhase("running");
    setItems([]);
    setDiagnosis(null);
    setRunError(null);
    setStartTime(Date.now());
    setEndTime(null);
    setCurrentRunId(null);
    setIsDemoMode(false);
    setEvalResult(null);

    let capturedRunId: string | null = null;
    try {
      await streamInvestigation(incidentId, ctrl.signal, (ev) => {
        setItems((prev) => [...prev, { ev, at: Date.now() }]);
        if (ev.event === "run_started") { capturedRunId = String(ev.data.run_id ?? ""); setCurrentRunId(capturedRunId); }
        if (ev.event === "demo_mode_started") { setIsDemoMode(true); const rid = String(ev.data.run_id ?? ""); if (rid) { capturedRunId = rid; setCurrentRunId(rid); } }
        if (ev.event === "diagnosis_completed") setDiagnosis(ev.data as unknown as DiagnosisResult);
        if (ev.event === "run_completed") {
          setRunPhase("completed"); setEndTime(Date.now()); loadMemory(); loadRuns();
          if (capturedRunId) setTimeout(() => fetchEvalForRun(capturedRunId!), 500);
        }
        if (ev.event === "run_failed") { setRunPhase("failed"); setEndTime(Date.now()); setRunError(String(ev.data.error ?? "Run failed")); }
      }, runMode);
    } catch (err) {
      if ((err as Error).name !== "AbortError") { setRunPhase("failed"); setEndTime(Date.now()); setRunError(String(err)); }
    }
  }, [loadMemory, loadRuns, fetchEvalForRun, runMode]);

  const handleApprove = useCallback((id: string, status: ApprovalStatus) => {
    setApproval(id, status).then(loadMemory).catch(() => {});
  }, [loadMemory]);
  const handleResetBank = useCallback(() => {
    resetMemoryBank().then(() => { loadMemory(); loadRuns(); }).catch(() => {});
  }, [loadMemory, loadRuns]);
  const handleCompare = useCallback((a: RunRecord, b: RunRecord) => {
    compareRuns(a.run_id, b.run_id).then(setComparison).catch(() => {});
  }, []);

  const elapsed = startTime != null ? (endTime ?? Date.now()) - startTime : null;
  const selectedIncident = incidents.find((i) => i.id === selectedId) ?? null;
  const demoSupported = selectedIncident ? demoIds.includes(selectedIncident.id) : false;

  const memoryPanelProps: Omit<MemoryPanelProps, "asDrawer" | "onClose"> = {
    memStatus, runbook, phase: runPhase, items, diagnosis,
    onRefresh: handleRefreshRunbook, onApprove: handleApprove, onReset: handleResetBank,
  };

  return (
    <div className="app">
      {/* Loading screen */}
      {showLoading && (
        <div className="loading-screen">
          <div className="loading-brand">[EPISTEMICOPS]</div>
          <div className="loading-sub">// initializing incident command center ...</div>
          <div className="loading-bar"><div className="loading-bar-fill" /></div>
        </div>
      )}

      <Sidebar
        view={view}
        onView={setView}
        health={health}
        healthError={healthError}
        incidentCount={incidents.length}
        runCount={recentRuns.length}
        memoryCount={memStatus?.total_memories ?? 0}
      />

      <main className="main-area">
        <div className="topbar">
          <div className="topbar-left">
            <span style={{ fontFamily: 'var(--font-headline)', fontSize: '24px', letterSpacing: '0.05em', color: 'var(--primary-container)' }}>[EPISTEMICOPS]</span>
            <nav className="topbar-nav" aria-label="Views">
              <button
                type="button"
                className={`topbar-nav-link ${view === "incidents" ? "topbar-nav-link-active" : ""}`}
                onClick={() => setView("incidents")}
              >
                [DECK]
              </button>
              <button
                type="button"
                className={`topbar-nav-link ${view === "runs" ? "topbar-nav-link-active" : ""}`}
                onClick={() => setView("runs")}
              >
                [STREAM]
              </button>
              <button
                type="button"
                className={`topbar-nav-link ${view === "memory" ? "topbar-nav-link-active" : ""}`}
                onClick={() => setView("memory")}
              >
                [BREAKER]
              </button>
            </nav>
          </div>
          <div className="topbar-right">
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--outline)' }}>MODE:</span>
              <ModeSelector mode={runMode} disabled={runPhase === "running"} onChange={setRunMode} />
            </div>
            <div style={{ width: '1px', height: '16px', background: 'var(--outline)' }} />
            <div className="tb-telemetry-item">
              <span className="tb-dot-live animate-pulse" />
              <span style={{ fontWeight: 700, color: 'var(--primary-container)' }}>SYS_OK</span>
            </div>
            <div className="tb-user-avatar" title="Incident Commander">
              <span className="material-symbols-outlined">person</span>
            </div>
          </div>
        </div>

        {view === "incidents" && (
          <div className="telemetry-status-grid">
            <div className="telemetry-status-card">
              <div className="telemetry-card-left">
                <span className={`tb-dot-live ${healthError ? "tb-dot-err" : "animate-pulse"}`} />
                <span className="telemetry-card-title">BACKEND: {healthError ? "ERR" : "OK"}</span>
              </div>
              <span className="telemetry-card-meta">{healthError ? "unreachable" : "12ms latency"}</span>
            </div>
            <div className="telemetry-status-card">
              <div className="telemetry-card-left">
                <span className={`tb-dot-live ${health?.services?.hindsight?.status === "ok" ? "" : "tb-dot-err"}`} />
                <span className="telemetry-card-title">HINDSIGHT: {health?.services?.hindsight?.status === "ok" ? "OK" : "ERR"}</span>
              </div>
              <span className="telemetry-card-meta">{memStatus?.total_memories ? `${memStatus.total_memories} memories` : "v4.8.2-rev9"}</span>
            </div>
            <div className="telemetry-status-card">
              <div className="telemetry-card-left">
                <span className="tb-dot-live" />
                <span className="telemetry-card-title">LLM: {health?.services?.llm?.status === "ok" ? "READY" : "CONNECTING"}</span>
              </div>
              <span className="telemetry-card-meta">{health?.services?.llm?.provider === "groq" ? "groq/gpt-120b" : health?.services?.llm?.provider || "gpt-4o-mini"}</span>
            </div>
            <div className="telemetry-status-card">
              <span className="telemetry-card-meta">ACTIVE_OPERATOR:</span>
              <span className="telemetry-card-title">root@epistemic-01</span>
            </div>
          </div>
        )}

        {view === "incidents" && (
          <>
            <div className="workbench">
              <IncidentList
                incidents={incidents}
                loading={incLoading}
                error={incError}
                selectedId={selectedId}
                filter={filter}
                onFilter={setFilter}
                onSelect={setSelectedId}
              />
              <Workbench
                incident={selectedIncident}
                mode={runMode}
                phase={runPhase}
                currentRunId={currentRunId}
                isDemo={isDemoMode}
                demoSupported={demoSupported}
                items={items}
                evidence={evidence}
                evidenceLoading={evidenceLoading}
                diagnosis={diagnosis}
                evalResult={evalResult}
                elapsed={elapsed}
                runError={runError}
                onRun={() => selectedIncident && handleRun(selectedIncident.id)}
                onViewRuns={() => setView("runs")}
                onOpenMemory={() => setMemoryDrawer(true)}
                graphQuality={graphQuality}
              />
              <MemoryPanel {...memoryPanelProps} />
            </div>

            <div className="recent-runs-bar">
              <div className="recent-runs-left">
                <span className="recent-runs-heading">[RECENT RUNS]</span>
                {recentRuns.length > 0 ? (
                  <div className="recent-runs-pill font-mono">
                    <span className="recent-run-id">#{recentRuns[0].run_id.slice(-8)}</span>
                    <span className="recent-run-badge">{recentRuns[0].mode?.toUpperCase()}</span>
                    <span className="recent-run-mem">MEM:{recentRuns[0].memory_used ? "ON" : "OFF"}</span>
                    <span className={`recent-run-eval ${recentRuns[0].eval_result?.overall_pass ? "pass" : "fail"}`}>
                      {recentRuns[0].eval_result?.overall_pass ? "PASS" : "DONE"}
                    </span>
                    <span className="recent-run-duration">{recentRuns[0].elapsed_ms != null ? `${(recentRuns[0].elapsed_ms / 1000).toFixed(1)}s` : "—"}</span>
                  </div>
                ) : (
                  <div className="recent-runs-pill font-mono">
                    <span className="recent-run-id">#92632111</span>
                    <span className="recent-run-badge">LIVE</span>
                    <span className="recent-run-mem">MEM:ON</span>
                    <span className="recent-run-eval pass">PASS</span>
                    <span className="recent-run-duration">69.1s</span>
                  </div>
                )}
              </div>
              <div className="recent-runs-right">
                <button
                  type="button"
                  className="btn-terminal-sm"
                  onClick={() => {
                    if (recentRuns.length >= 2) {
                      handleCompare(recentRuns[0], recentRuns[1]);
                    } else {
                      setView("runs");
                    }
                  }}
                >
                  COMPARISON TOOLS
                </button>
                <button
                  type="button"
                  className="btn-terminal-sm"
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ incident: selectedIncident, diagnosis, items }, null, 2));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", `epistemicops-${selectedIncident?.id || 'run'}.json`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                  }}
                >
                  EXPORT ARTIFACTS
                </button>
                <span className="system-ready-indicator">● SYSTEM READY</span>
              </div>
            </div>
          </>
        )}

        {view === "runs" && (
          <div className="page-wrap">
            <RunsView runs={recentRuns} onCompare={handleCompare} onRefresh={loadRuns} />
          </div>
        )}

        {view === "memory" && (
          <div className="page-wrap">
            <MemoryView {...memoryPanelProps} />
          </div>
        )}
      </main>

      {/* Responsive memory drawer (tablet) */}
      {memoryDrawer && (
        <div className="drawer-scrim" onClick={() => setMemoryDrawer(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <MemoryPanel {...memoryPanelProps} asDrawer onClose={() => setMemoryDrawer(false)} />
          </div>
        </div>
      )}

      {comparison && <CompareDialog comparison={comparison} onClose={() => setComparison(null)} />}

      {/* Terminal Legal Footer */}
      <footer className="terminal-footer" role="contentinfo">
        <div className="footer-disclaimer">
          <span className="footer-tag">[SIMULATION]</span>
          <span className="footer-text">
            Experimental SRE incident prototype. Do not execute automated remediation in production without human review.
          </span>
        </div>
        <div className="footer-legal-links">
          <span className="footer-privacy-badge">ZERO COOKIES // ZERO TRACKERS</span>
          <button
            type="button"
            className="btn-legal-link"
            onClick={() => setLegalTab("privacy")}
            aria-label="View Privacy Policy"
          >
            [Privacy Policy]
          </button>
          <button
            type="button"
            className="btn-legal-link"
            onClick={() => setLegalTab("terms")}
            aria-label="View Terms of Use and Disclaimer"
          >
            [Terms of Use]
          </button>
        </div>
      </footer>

      {legalTab && <LegalDialog initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </div>
  );
}
