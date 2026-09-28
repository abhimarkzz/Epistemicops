import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function sevClass(s: string): string {
  return `sev-${sevRank(s)}`;
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

function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`badge sev ${sevClass(severity)}`}>{severity}</span>;
}

function StateBadge({ phase }: { phase: RunPhase }) {
  const map: Record<RunPhase, { text: string; cls: string }> = {
    idle: { text: "Idle", cls: "st-idle" },
    running: { text: "Running", cls: "st-running" },
    completed: { text: "Completed", cls: "st-ok" },
    failed: { text: "Failed", cls: "st-err" },
  };
  const s = map[phase];
  return <span className={`badge state ${s.cls}`}>{s.text}</span>;
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
    <div className="segmented" role="tablist" aria-label="Run mode">
      {modes.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          className={`seg ${mode === m.id ? "seg-active" : ""}`}
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

  const nav: { id: NavView; label: string; count?: number }[] = [
    { id: "incidents", label: "Incidents", count: incidentCount },
    { id: "runs", label: "Runs", count: runCount },
    { id: "memory", label: "Memory", count: memoryCount },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">◧</span>
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
            <span>{n.label}</span>
            {typeof n.count === "number" && <span className="nav-count">{n.count}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="health" aria-label="Service health">
        <div className="health-title">System</div>
        <div className="health-row"><Dot status={beStatus} /><span>Backend</span><span className="health-val">{beStatus === "ok" ? "Healthy" : beStatus === "unknown" ? "…" : "Down"}</span></div>
        <div className="health-row"><Dot status={hsStatus} /><span>Hindsight</span><span className="health-val">{hsStatus === "ok" ? "Healthy" : hsStatus === "unknown" ? "…" : "Down"}</span></div>
        <div className="health-row"><Dot status={llmStatus} /><span>{provider}</span><span className="health-val">{llmStatus === "ok" ? "Ready" : llmStatus === "unknown" ? "…" : "Down"}</span></div>
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
        <h2 className="col-title">Incidents</h2>
        <span className="col-meta">{incidents.length}</span>
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
        {filtered.map((inc) => (
          <button
            key={inc.id}
            className={`inc-row ${selectedId === inc.id ? "inc-row-active" : ""}`}
            onClick={() => onSelect(inc.id)}
            aria-current={selectedId === inc.id ? "true" : undefined}
          >
            <div className="inc-row-top">
              <span className="inc-id">{inc.id}</span>
              <SeverityBadge severity={inc.severity} />
            </div>
            <div className="inc-title">{inc.title || inc.alert?.title || inc.id}</div>
            <div className="inc-sub">
              <span className="inc-service">{inc.service}</span>
              {inc.category && <span className="inc-cat">{inc.category}</span>}
            </div>
          </button>
        ))}
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
  const available = useMemo<EvidenceTab[]>(() => {
    const t: EvidenceTab[] = [];
    if (evidence.logs && evidence.logs.length) t.push("logs");
    if (evidence.metrics && Object.keys(evidence.metrics).length) t.push("metrics");
    if (evidence.trace && (evidence.trace.spans?.length || evidence.trace.summary)) t.push("traces");
    if (evidence.pods && evidence.pods.pods?.length) t.push("pods");
    return t;
  }, [evidence]);
  const [tab, setTab] = useState<EvidenceTab>("logs");
  useEffect(() => {
    if (available.length && !available.includes(tab)) setTab(available[0]);
  }, [available, tab]);

  if (loading) return <div className="evidence"><div className="skel-row" /><div className="skel-row" /></div>;
  if (!available.length) return null;

  return (
    <div className="evidence">
      <div className="tabs" role="tablist" aria-label="Evidence">
        {available.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === "logs" && (
          <pre className="logview">{(evidence.logs ?? []).join("\n")}</pre>
        )}
        {tab === "metrics" && evidence.metrics && (
          <div className="metrics">
            {Object.entries(evidence.metrics).map(([k, v]) => (
              <div className="metric" key={k}>
                <span className="metric-k">{k.replace(/_/g, " ")}</span>
                <span className="metric-v">{typeof v === "number" ? v.toLocaleString() : String(v)}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "traces" && evidence.trace && (
          <div className="trace">
            {evidence.trace.summary && <p className="trace-summary">{evidence.trace.summary}</p>}
            <table className="dtable">
              <thead><tr><th>Span</th><th>Service</th><th className="num">Duration</th></tr></thead>
              <tbody>
                {(evidence.trace.spans ?? []).slice(0, 12).map((s, i) => (
                  <tr key={i}>
                    <td>{String((s as Record<string, unknown>).name ?? (s as Record<string, unknown>).operation ?? `span ${i + 1}`)}</td>
                    <td>{String((s as Record<string, unknown>).service ?? "—")}</td>
                    <td className="num">{String((s as Record<string, unknown>).duration_ms ?? (s as Record<string, unknown>).duration ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "pods" && evidence.pods && (
          <table className="dtable">
            <thead><tr><th>Pod</th><th>Phase</th><th>Ready</th><th className="num">Restarts</th><th>Age</th></tr></thead>
            <tbody>
              {(evidence.pods.pods ?? []).map((p, i) => (
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
          <div className="inc-header-idline">
            <span className="inc-header-id">{p.incident.id}</span>
            <SeverityBadge severity={p.incident.severity} />
            <StateBadge phase={p.phase} />
            {p.isDemo && <span className="badge badge-demo">Demo</span>}
            {p.currentRunId && <span className="run-ref">#{p.currentRunId}</span>}
          </div>
          <h1 className="inc-header-title">{p.incident.title || p.incident.alert?.title || p.incident.id}</h1>
          <div className="inc-meta">
            <span><span className="meta-k">Service</span> {p.incident.service}</span>
            {p.incident.category && <span><span className="meta-k">Category</span> {p.incident.category}</span>}
            {p.incident.environment && <span><span className="meta-k">Env</span> {p.incident.environment}</span>}
            {typeof p.incident.duration_minutes === "number" && <span><span className="meta-k">Duration</span> {p.incident.duration_minutes}m</span>}
          </div>
        </div>
        <div className="inc-header-actions">
          <button className="btn btn-primary" disabled={running || demoUnavailable} onClick={p.onRun} title={demoUnavailable ? "No deterministic replay exists for this incident" : undefined}>
            {running ? "Running…" : p.mode === "demo" ? "Run demo" : p.mode === "baseline" ? "Run baseline" : "Run investigation"}
          </button>
          {p.onOpenMemory && <button className="btn btn-ghost mem-toggle" onClick={p.onOpenMemory}>Memory</button>}
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
          <div className="panel-head">
            <h3>Investigation timeline</h3>
            {p.isDemo && <span className="demo-tag">Demo replay · {p.incident?.id}</span>}
          </div>
          {p.items.length === 0 && p.phase === "idle"
            ? <EmptyState title="No activity yet." hint={demoUnavailable ? "This incident has no demo replay — use Live mode." : "Start a run to stream the investigation."} />
            : <Timeline items={p.items} phase={p.phase} />}
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

  const memState: { text: string; tone: string } = skipped
    ? { text: "Memory skipped (baseline)", tone: "neutral" }
    : memoryUsed
    ? { text: "Relevant memory recalled", tone: "memory" }
    : p.phase === "running"
    ? { text: "Recalling relevant memory…", tone: "info" }
    : { text: "Memory enabled", tone: "neutral" };

  const rbStatusLabel: Record<string, string> = {
    current: "Current", stale: "Stale", consolidation_pending: "Consolidating",
    generating: "Generating", unavailable: "Unavailable", unknown: "Unknown",
  };

  return (
    <aside className={`col col-memory ${p.asDrawer ? "col-memory-drawer" : ""}`} aria-label="Hindsight memory">
      <header className="col-head col-head-memory">
        <h2 className="col-title">Hindsight memory</h2>
        <div className="col-head-actions">
          <button className="btn-icon" title="Refresh memory" onClick={p.onRefresh} aria-label="Refresh memory">↻</button>
          {p.onClose && <button className="btn-icon" title="Close" onClick={p.onClose} aria-label="Close memory panel">✕</button>}
        </div>
      </header>

      <div className="memory-scroll">
        <div className={`mem-state tone-${memState.tone}`}>
          <Dot status={memState.tone === "memory" ? "ok" : memState.tone === "info" ? "warn" : "unknown"} />
          <span>{memState.text}</span>
        </div>

        {/* Memory bank */}
        {p.memStatus && (
          <div className="mem-section">
            <div className="mem-section-title">Memory bank</div>
            <div className="mem-stats">
              <div className="mem-stat"><span>{p.memStatus.bank_reachable ? "Reachable" : "Unreachable"}</span><label>Bank</label></div>
              <div className="mem-stat"><span>{p.memStatus.total_memories}</span><label>Memories</label></div>
              <div className="mem-stat"><span>{p.memStatus.pending_approvals}</span><label>Pending</label></div>
              <div className="mem-stat"><span>{p.memStatus.approved_count}</span><label>Approved</label></div>
            </div>
          </div>
        )}

        {/* Runbook / mental model */}
        <div className="mem-section">
          <div className="mem-section-title">Runbook</div>
          <div className="runbook">
            <div className="runbook-name">{rb?.name ?? "Microservice Resolution Runbook"}</div>
            {rb && (
              <span className={`badge rb-badge rb-${rb.status}`}>{rbStatusLabel[rb.status] ?? rb.status}</span>
            )}
            {rb?.content && rb.status !== "unavailable" && rb.status !== "generating" && (
              <p className="runbook-content">{rb.content}</p>
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
          </div>
        </div>

        {/* Learning state */}
        <div className="mem-section">
          <div className="mem-section-title">Learning</div>
          <ul className="learn-list">
            <li><span>Postmortem retained</span><span className={retained ? "ok" : "muted"}>{retained ? "✓" : "—"}</span></li>
            <li><span>Consolidation</span><span className={rb && (rb.status === "current" || rb.status === "consolidation_pending") ? "ok" : "muted"}>{rb && rb.status !== "unavailable" ? "✓" : "—"}</span></li>
            <li><span>Mental model</span><span className={rb && rb.status !== "unavailable" ? "ok" : "muted"}>{rb && rb.status !== "unavailable" ? "✓" : "—"}</span></li>
          </ul>
        </div>

        {/* Postmortems */}
        {p.memStatus && p.memStatus.all_postmortems.length > 0 && (
          <div className="mem-section">
            <div className="mem-section-title">Postmortems</div>
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

        {/* Reset */}
        {p.memStatus && (
          <div className="mem-section">
            {!confirmReset ? (
              <button className="btn btn-danger-outline btn-block" onClick={() => setConfirmReset(true)}>Reset memory bank</button>
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
  const [graphQuality, setGraphQuality] = useState<GraphQuality>('balanced');
  const [showLoading, setShowLoading] = useState(true);

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
          <div className="loading-brand">EpistemicOps</div>
          <div className="loading-sub">Initializing incident graph</div>
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
          <div className="topbar-context">
            {selectedIncident ? (
              <>
                <span className="tb-id">{selectedIncident.id}</span>
                <span className="tb-title">{selectedIncident.title || selectedIncident.id}</span>
              </>
            ) : (
              <span className="tb-title tb-muted">Incident workbench</span>
            )}
          </div>
          <div className="topbar-right">
            <select
              className="quality-select"
              value={graphQuality}
              onChange={(e) => setGraphQuality(e.target.value as GraphQuality)}
              aria-label="3D quality"
            >
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="low">Low</option>
            </select>
            <ModeSelector mode={runMode} disabled={runPhase === "running"} onChange={setRunMode} />
            {healthError && <span className="badge st-err">Backend unreachable</span>}
          </div>
        </div>

        {view === "incidents" && (
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
              onOpenMemory={() => setMemoryDrawer(true)}
              graphQuality={graphQuality}
            />
            <MemoryPanel {...memoryPanelProps} />
          </div>
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
    </div>
  );
}
