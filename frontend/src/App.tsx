import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchHealth,
  fetchIncidents,
  fetchMemoryStatus,
  fetchRunbook,
  setApproval,
  streamInvestigation,
  triggerRunbookRefresh,
} from "./api";
import type {
  ApprovalStatus,
  DiagnosisResult,
  HealthInfo,
  Incident,
  MemoryStatus,
  PostmortemRecord,
  RunbookStatus,
  RunPhase,
  StreamEvent,
} from "./types";
import "./App.css";

// ── helpers ────────────────────────────────────────────────────────────────────

function severityClass(s: string): string {
  const lower = s.toLowerCase();
  if (lower === "p1" || lower === "critical") return "sev-p1";
  if (lower === "p2" || lower === "high") return "sev-p2";
  if (lower === "p3" || lower === "medium") return "sev-p3";
  return "sev-p4";
}

function fmtTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtRelative(isoStr: string | null): string {
  if (!isoStr) return "—";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface EventDisplay {
  prefix: string;
  text: string;
  colorClass: string;
}

function describeEvent(ev: StreamEvent): EventDisplay {
  const d = ev.data;
  switch (ev.event) {
    case "incident_started":
      return { prefix: "▶", text: `Incident ${String(d.incident_id ?? "")} started`, colorClass: "ev-green" };
    case "memory_query_started":
      return { prefix: "MEM", text: "Querying historical patterns…", colorClass: "ev-purple" };
    case "memory_result": {
      const found = Boolean(d.found);
      const trust = d.trust_level ? ` [${d.trust_level}]` : "";
      return found
        ? { prefix: "◆", text: `Memory: found relevant patterns${trust}`, colorClass: "ev-purple" }
        : { prefix: "◇", text: "Memory: no patterns found", colorClass: "ev-muted" };
    }
    case "tool_started":
      return { prefix: "⚙", text: `Calling ${String(d.tool ?? d.name ?? "tool")}`, colorClass: "ev-blue" };
    case "tool_result_summary": {
      const summary = String(d.summary ?? "done");
      const tool = d.tool ? `${d.tool}: ` : "";
      return { prefix: "✓", text: `${tool}${summary}`, colorClass: "ev-green" };
    }
    case "diagnosis_started":
      return { prefix: "⊕", text: "Analyzing evidence…", colorClass: "ev-yellow" };
    case "diagnosis_completed": {
      const conf = typeof d.confidence === "number" ? ` — ${(d.confidence * 100).toFixed(0)}% confidence` : "";
      return { prefix: "✓✓", text: `Diagnosis complete${conf}`, colorClass: "ev-green" };
    }
    case "memory_retention_started": {
      const tags = Array.isArray(d.tags) ? d.tags.join(", ") : "";
      return { prefix: "⊙", text: `Retaining postmortem${tags ? ` [${tags}]` : ""}`, colorClass: "ev-purple" };
    }
    case "postmortem_created":
      return {
        prefix: "◉",
        text: d.success ? "Postmortem retained in memory" : "Postmortem retention failed",
        colorClass: d.success ? "ev-green" : "ev-red",
      };
    case "run_completed":
      return { prefix: "●", text: "Run completed", colorClass: "ev-green" };
    case "run_failed":
      return { prefix: "✗", text: `Run failed: ${String(d.error ?? "unknown error")}`, colorClass: "ev-red" };
    default:
      return { prefix: "·", text: ev.event, colorClass: "ev-muted" };
  }
}

// ── sub-components ─────────────────────────────────────────────────────────────

interface HeaderProps {
  health: HealthInfo | null;
  healthError: boolean;
}
function Header({ health, healthError }: HeaderProps) {
  const dot = (ok: boolean | null) => (
    <span className={`dot ${ok === null ? "dot-unknown" : ok ? "dot-ok" : "dot-err"}`} />
  );
  const ollama = health?.services?.ollama?.status === "ok";
  const hindsight = health?.services?.hindsight?.status === "ok";
  return (
    <header className="app-header">
      <div className="header-brand">
        <span className="header-logo">◈</span>
        <span className="header-title">EpistemicOps</span>
        <span className="header-sub">SRE Incident Intelligence</span>
      </div>
      <div className="header-status">
        {healthError ? (
          <span className="status-chip status-chip-err">Backend unreachable</span>
        ) : (
          <>
            <span className="status-service">
              {dot(health ? ollama : null)} Ollama
            </span>
            <span className="status-service">
              {dot(health ? hindsight : null)} Hindsight
            </span>
          </>
        )}
      </div>
    </header>
  );
}

interface IncidentQueueProps {
  incidents: Incident[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  runPhase: RunPhase;
  onSelect: (id: string) => void;
  onRun: (id: string) => void;
}
function IncidentQueue({
  incidents,
  loading,
  error,
  selectedId,
  runPhase,
  onSelect,
  onRun,
}: IncidentQueueProps) {
  const isRunning = runPhase === "running";
  return (
    <aside className="panel panel-left">
      <div className="panel-header">
        <span className="panel-title">Incident Queue</span>
        <span className="panel-count">{incidents.length}</span>
      </div>
      <div className="panel-body">
        {loading && <div className="panel-msg">Loading incidents…</div>}
        {error && <div className="panel-error">{error}</div>}
        {!loading && !error && incidents.length === 0 && (
          <div className="panel-msg">No incidents found.</div>
        )}
        {incidents.map((inc) => (
          <div
            key={inc.id}
            className={`incident-card ${selectedId === inc.id ? "incident-card-selected" : ""}`}
            onClick={() => onSelect(inc.id)}
          >
            <div className="inc-row-top">
              <span className={`sev-badge ${severityClass(inc.severity)}`}>{inc.severity}</span>
              <span className="inc-id">{inc.id}</span>
            </div>
            <div className="inc-title">{inc.title || inc.alert?.title || inc.id}</div>
            <div className="inc-meta">
              <span className="tag">{inc.service}</span>
              <span className="tag tag-cat">{inc.category}</span>
            </div>
            <button
              className="btn-run"
              disabled={isRunning}
              onClick={(e) => {
                e.stopPropagation();
                onRun(inc.id);
              }}
            >
              {isRunning && selectedId === inc.id ? (
                <span className="spinner">⟳</span>
              ) : (
                "Run Incident"
              )}
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

interface AgentTimelineProps {
  events: StreamEvent[];
  runPhase: RunPhase;
  selectedId: string | null;
}
function AgentTimeline({ events, runPhase, selectedId }: AgentTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <section className="panel panel-center">
      <div className="panel-header">
        <span className="panel-title">Agent Activity</span>
        {runPhase === "running" && <span className="status-chip status-chip-running">Running</span>}
        {runPhase === "completed" && <span className="status-chip status-chip-ok">Completed</span>}
        {runPhase === "failed" && <span className="status-chip status-chip-err">Failed</span>}
      </div>
      <div className="panel-body timeline-body">
        {runPhase === "idle" && (
          <div className="timeline-empty">
            {selectedId
              ? `Select "Run Incident" to start investigation of ${selectedId}`
              : "Select an incident from the queue to begin."}
          </div>
        )}
        {events.map((ev, i) => {
          const { prefix, text, colorClass } = describeEvent(ev);
          return (
            <div key={i} className={`timeline-event ${colorClass}`}>
              <span className="ev-prefix">{prefix}</span>
              <span className="ev-text">{text}</span>
            </div>
          );
        })}
        {runPhase === "running" && (
          <div className="timeline-event ev-muted">
            <span className="ev-prefix pulse">·</span>
            <span className="ev-text">Agent working…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}

interface RunbookPanelProps {
  runbook: RunbookStatus | null;
  memStatus: MemoryStatus | null;
  loadingMemory: boolean;
  runPhase: RunPhase;
  approvals: PostmortemRecord[];
  onRefresh: () => void;
  onApprove: (id: string, status: ApprovalStatus) => void;
}
function RunbookPanel({
  runbook,
  memStatus,
  loadingMemory,
  approvals,
  onRefresh,
  onApprove,
}: RunbookPanelProps) {
  const rb = runbook ?? memStatus?.runbook;
  const statusLabel: Record<string, string> = {
    current: "Current",
    stale: "Stale",
    consolidation_pending: "Consolidation pending",
    generating: "Generating…",
    unavailable: "Unavailable",
    unknown: "Unknown",
  };
  const statusClass: Record<string, string> = {
    current: "status-chip-ok",
    stale: "status-chip-warn",
    consolidation_pending: "status-chip-warn",
    generating: "status-chip-running",
    unavailable: "status-chip-err",
    unknown: "status-chip-muted",
  };

  return (
    <aside className="panel panel-right">
      <div className="panel-header">
        <span className="panel-title">Runbook / Memory</span>
        <button className="btn-icon" onClick={onRefresh} title="Refresh memory status">
          ↻
        </button>
      </div>
      <div className="panel-body">
        {loadingMemory && !rb && <div className="panel-msg">Loading…</div>}

        {/* Runbook section */}
        <div className="rb-section">
          <div className="rb-section-label">Mental Model</div>
          <div className="rb-name">{rb?.name ?? "Microservice Resolution Runbook"}</div>
          {rb && (
            <div className="rb-meta-row">
              <span className={`status-chip ${statusClass[rb.status] ?? "status-chip-muted"}`}>
                {statusLabel[rb.status] ?? rb.status}
              </span>
              {rb.last_refreshed_at && (
                <span className="rb-time">Updated {fmtRelative(rb.last_refreshed_at)}</span>
              )}
            </div>
          )}
          {rb?.content && rb.status !== "unavailable" && (
            <div className="rb-content">{rb.content}</div>
          )}
          {rb?.status === "unavailable" && (
            <div className="panel-error">Hindsight unreachable — runbook unavailable</div>
          )}
          {rb?.status === "consolidation_pending" && (
            <div className="panel-warn">Consolidation in progress — check back shortly</div>
          )}
          <button className="btn-secondary btn-block" onClick={onRefresh}>
            ↻ Refresh Runbook
          </button>
        </div>

        {/* Memory bank */}
        {memStatus && (
          <div className="rb-section">
            <div className="rb-section-label">Memory Bank</div>
            <div className="rb-stats">
              <div className="rb-stat">
                <span className="rb-stat-label">Bank</span>
                <span className={memStatus.bank_reachable ? "ev-green" : "ev-red"}>
                  {memStatus.bank_reachable ? "Reachable" : "Unreachable"}
                </span>
              </div>
              <div className="rb-stat">
                <span className="rb-stat-label">Memories</span>
                <span>{memStatus.total_memories}</span>
              </div>
              <div className="rb-stat">
                <span className="rb-stat-label">Pending</span>
                <span className={memStatus.pending_approvals > 0 ? "ev-yellow" : ""}>
                  {memStatus.pending_approvals}
                </span>
              </div>
              <div className="rb-stat">
                <span className="rb-stat-label">Approved</span>
                <span className="ev-green">{memStatus.approved_count}</span>
              </div>
            </div>
          </div>
        )}

        {/* Approvals */}
        {approvals.length > 0 && (
          <div className="rb-section">
            <div className="rb-section-label">Postmortems</div>
            {approvals.map((pm) => (
              <div key={pm.incident_id} className="pm-row">
                <div className="pm-id">{pm.incident_id}</div>
                <div className="pm-meta">
                  <span className="tag">{pm.service}</span>
                  <span className="tag tag-cat">{pm.severity}</span>
                  <span className="rb-time">{fmtRelative(pm.retained_at)}</span>
                </div>
                <div className="pm-actions">
                  <span
                    className={`approval-badge approval-${pm.approval_status}`}
                  >
                    {pm.approval_status}
                  </span>
                  {pm.approval_status !== "approved" && (
                    <button
                      className="btn-approve"
                      onClick={() => onApprove(pm.incident_id, "approved")}
                    >
                      Approve
                    </button>
                  )}
                  {pm.approval_status !== "rejected" && (
                    <button
                      className="btn-reject"
                      onClick={() => onApprove(pm.incident_id, "rejected")}
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

interface SummaryBarProps {
  diagnosis: DiagnosisResult | null;
  events: StreamEvent[];
  runPhase: RunPhase;
  elapsed: number | null;
  runError: string | null;
}
function SummaryBar({ diagnosis, events, runPhase, elapsed, runError }: SummaryBarProps) {
  if (runPhase === "idle" && !diagnosis) {
    return (
      <footer className="summary-bar summary-idle">
        <span className="summary-hint">Run an incident to see the diagnosis summary here.</span>
      </footer>
    );
  }

  const toolCalls = events.filter((e) => e.event === "tool_started").length;
  const memoryUsed = diagnosis?.memory_used ?? events.some((e) => e.event === "memory_result" && e.data.found);

  return (
    <footer className="summary-bar">
      <div className="summary-stats">
        <div className="summary-stat">
          <span className="summary-stat-label">Tool calls</span>
          <span className="summary-stat-value">{toolCalls}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat-label">Elapsed</span>
          <span className="summary-stat-value">{elapsed != null ? fmtTime(elapsed) : "—"}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat-label">Memory</span>
          <span className={`summary-stat-value ${memoryUsed ? "ev-purple" : "ev-muted"}`}>
            {memoryUsed ? "Used" : "None"}
          </span>
        </div>
        {diagnosis && (
          <div className="summary-stat">
            <span className="summary-stat-label">Confidence</span>
            <span className={`summary-stat-value ${diagnosis.confidence >= 0.7 ? "ev-green" : "ev-yellow"}`}>
              {(diagnosis.confidence * 100).toFixed(0)}%
            </span>
          </div>
        )}
        {diagnosis && (
          <div className="summary-stat">
            <span className="summary-stat-label">Status</span>
            <span className={`summary-stat-value ${diagnosis.status === "completed" ? "ev-green" : "ev-yellow"}`}>
              {diagnosis.status}
            </span>
          </div>
        )}
      </div>

      {runError && (
        <div className="summary-error">
          <span className="ev-red">✗</span> {runError}
        </div>
      )}

      {diagnosis && (
        <div className="summary-diagnosis">
          <div className="diag-row">
            <span className="diag-label">Root cause</span>
            <span className="diag-value">{diagnosis.root_cause}</span>
          </div>
          <div className="diag-row">
            <span className="diag-label">Remediation</span>
            <span className="diag-value">{diagnosis.recommended_remediation}</span>
          </div>
          {diagnosis.evidence.length > 0 && (
            <div className="diag-row">
              <span className="diag-label">Evidence</span>
              <span className="diag-value">{diagnosis.evidence.join(" · ")}</span>
            </div>
          )}
        </div>
      )}
    </footer>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthError, setHealthError] = useState(false);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incLoading, setIncLoading] = useState(true);
  const [incError, setIncError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [memStatus, setMemStatus] = useState<MemoryStatus | null>(null);
  const [runbook, setRunbook] = useState<RunbookStatus | null>(null);
  const [memLoading, setMemLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Health probe
  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealthError(true));

    const id = setInterval(() => {
      fetchHealth()
        .then((h) => { setHealth(h); setHealthError(false); })
        .catch(() => setHealthError(true));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Load incidents
  useEffect(() => {
    setIncLoading(true);
    fetchIncidents()
      .then((list) => { setIncidents(list); setIncLoading(false); })
      .catch((err) => { setIncError(String(err)); setIncLoading(false); });
  }, []);

  // Load memory on mount
  const loadMemory = useCallback(() => {
    setMemLoading(true);
    Promise.all([fetchMemoryStatus(), fetchRunbook()])
      .then(([status, rb]) => {
        setMemStatus(status);
        setRunbook(rb);
        setMemLoading(false);
      })
      .catch(() => setMemLoading(false));
  }, []);

  const handleRefreshRunbook = useCallback(() => {
    triggerRunbookRefresh().catch(console.error);
    // Re-fetch status shortly after to reflect consolidation_pending
    setTimeout(loadMemory, 1500);
  }, [loadMemory]);

  useEffect(() => { loadMemory(); }, [loadMemory]);

  // Run investigation
  const handleRun = useCallback(
    async (incidentId: string) => {
      // Cancel any in-progress run
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setSelectedId(incidentId);
      setRunPhase("running");
      setEvents([]);
      setDiagnosis(null);
      setRunError(null);
      setStartTime(Date.now());
      setEndTime(null);

      try {
        await streamInvestigation(incidentId, ctrl.signal, (ev) => {
          setEvents((prev) => [...prev, ev]);
          if (ev.event === "diagnosis_completed") {
            setDiagnosis(ev.data as unknown as DiagnosisResult);
          }
          if (ev.event === "run_completed") {
            setRunPhase("completed");
            setEndTime(Date.now());
            loadMemory();
          }
          if (ev.event === "run_failed") {
            setRunPhase("failed");
            setEndTime(Date.now());
            setRunError(String(ev.data.error ?? "Run failed"));
          }
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setRunPhase("failed");
          setEndTime(Date.now());
          setRunError(String(err));
        }
      }
    },
    [loadMemory]
  );

  const handleApprove = useCallback(async (id: string, status: ApprovalStatus) => {
    try {
      await setApproval(id, status);
      loadMemory();
    } catch (err) {
      console.error("Approval failed:", err);
    }
  }, [loadMemory]);

  const elapsed =
    startTime != null
      ? (endTime ?? Date.now()) - startTime
      : null;

  const approvals = memStatus?.all_postmortems ?? [];

  return (
    <div className="app-layout">
      <Header health={health} healthError={healthError} />

      <div className="main-grid">
        <IncidentQueue
          incidents={incidents}
          loading={incLoading}
          error={incError}
          selectedId={selectedId}
          runPhase={runPhase}
          onSelect={setSelectedId}
          onRun={handleRun}
        />
        <AgentTimeline events={events} runPhase={runPhase} selectedId={selectedId} />
        <RunbookPanel
          runbook={runbook}
          memStatus={memStatus}
          loadingMemory={memLoading}
          runPhase={runPhase}
          approvals={approvals}
          onRefresh={handleRefreshRunbook}
          onApprove={handleApprove}
        />
      </div>

      <SummaryBar
        diagnosis={diagnosis}
        events={events}
        runPhase={runPhase}
        elapsed={elapsed}
        runError={runError}
      />
    </div>
  );
}
