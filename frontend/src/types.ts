// ── Incident fixtures ──────────────────────────────────────────────────────────

export interface Incident {
  id: string;
  title: string;
  severity: string;
  service: string;
  category: string;
  description?: string;
  alert?: { title?: string };
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

export interface HealthInfo {
  status: string;
  service: string;
  services: {
    ollama: ServiceHealth;
    hindsight: ServiceHealth;
  };
}

// ── UI state ───────────────────────────────────────────────────────────────────

export type RunPhase = "idle" | "running" | "completed" | "failed";
