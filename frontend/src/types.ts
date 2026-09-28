// ── Incident fixtures ──────────────────────────────────────────────────────────

export interface Incident {
  id: string;
  title: string;
  severity: string;
  service: string;
  category?: string;
  description?: string;
  alert?: { title?: string; state?: string };
  environment?: string;
  timestamp?: string;
  duration_minutes?: number;
  tags?: string[];
  symptoms?: string[];
}

// Read-only evidence (fixture-backed). Shapes are intentionally loose because
// different incidents expose different modalities.
export interface PodStatus {
  namespace?: string;
  pods?: Array<{
    name: string;
    node?: string;
    phase?: string;
    ready?: string;
    restarts?: number;
    age?: string;
    image?: string;
    status?: string;
  }>;
}

export interface TraceData {
  service?: string;
  sampled_spans?: number;
  summary?: string;
  spans?: Array<Record<string, unknown>>;
}

// ── Agent stream events ────────────────────────────────────────────────────────

export interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

// ── Diagnosis (inside diagnosis_completed data) ────────────────────────────────

export interface DiagnosisResult {
  incident_id: string;
  root_cause: string;
  evidence: string[];
  recommended_remediation: string;
  confidence: number;
  memory_used: boolean;
  tool_calls: string[];
  status: "completed" | "failed" | "inconclusive";
}

// ── Memory / Runbook ───────────────────────────────────────────────────────────

export type RunbookStatusStr =
  | "current"
  | "stale"
  | "consolidation_pending"
  | "generating"
  | "unavailable"
  | "unknown";

export interface RunbookStatus {
  mental_model_id: string;
  name: string;
  content: string | null;
  is_stale: boolean;
  last_refreshed_at: string | null;
  last_memory_seen_at: string | null;
  status: RunbookStatusStr;
  pending_approvals: number;
  refresh_operation_id: string | null;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface PostmortemRecord {
  incident_id: string;
  service: string;
  category: string | null;
  severity: string;
  retained_at: string;
  approval_status: ApprovalStatus;
  tags: string[];
  document_id: string;
  evidence_refs: string[];
  source_fixture: string | null;
}

export interface MemoryStatus {
  bank_id: string;
  bank_reachable: boolean;
  total_memories: number;
  runbook: RunbookStatus;
  pending_approvals: number;
  approved_count: number;
  rejected_count: number;
  all_postmortems: PostmortemRecord[];
}

// ── Health probe ───────────────────────────────────────────────────────────────

export interface ServiceHealth {
  status: "ok" | "unreachable";
  url: string;
}

export interface LlmHealth extends ServiceHealth {
  provider: string;
}

export interface HealthInfo {
  status: string;
  service: string;
  services: {
    llm: LlmHealth;
    hindsight: ServiceHealth;
  };
}

// ── Run store / Learning loop ──────────────────────────────────────────────────

export type RunMode = "live" | "baseline" | "demo";

export interface EvalResult {
  incident_id: string;
  root_cause_category_match: boolean;
  evidence_keywords_found: string[];
  evidence_score: number;
  remediation_ok: boolean;
  forbidden_category_triggered: boolean;
  overall_pass: boolean;
  notes: string[];
}

export interface RunRecord {
  run_id: string;
  incident_id: string;
  mode: RunMode;
  started_at: string;
  elapsed_ms: number | null;
  tool_calls: string[];
  memory_used: boolean;
  diagnosis: DiagnosisResult | null;
  eval_result: EvalResult | null;
  error: string | null;
  status: "running" | "completed" | "failed";
}

export interface RunDelta {
  memory_used_a: boolean;
  memory_used_b: boolean;
  elapsed_ms_a: number | null;
  elapsed_ms_b: number | null;
  elapsed_ms_delta: number | null;
  tool_calls_a: number;
  tool_calls_b: number;
  eval_pass_a: boolean | null;
  eval_pass_b: boolean | null;
  evidence_score_a: number | null;
  evidence_score_b: number | null;
}

export interface RunComparison {
  run_a: RunRecord;
  run_b: RunRecord;
  delta: RunDelta;
}

// ── UI state ───────────────────────────────────────────────────────────────────

export type RunPhase = "idle" | "running" | "completed" | "failed";
