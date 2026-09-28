import type {
  ApprovalStatus,
  HealthInfo,
  Incident,
  MemoryStatus,
  RunComparison,
  RunMode,
  RunRecord,
  RunbookStatus,
  StreamEvent,
} from "./types";

// In dev/preview mode the Vite proxy handles relative URLs (BASE="").
// For a standalone production deployment set VITE_API_BASE_URL to the
// backend origin, e.g. http://my-server:8000
const BASE: string = import.meta.env.VITE_API_BASE_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const fetchHealth = () => get<HealthInfo>("/health");
export const fetchIncidents = () => get<Incident[]>("/api/incidents");
export const fetchDemoIncidents = () => get<string[]>("/api/demo/incidents");

// ── Evidence (read-only fixture data for the Evidence tabs) ─────────────────────

export const fetchIncidentLogs = (id: string) =>
  get<string[]>(`/api/incidents/${id}/logs`);
export const fetchIncidentMetrics = (id: string) =>
  get<Record<string, unknown>>(`/api/incidents/${id}/metrics`);
export const fetchIncidentTrace = (id: string) =>
  get<unknown>(`/api/incidents/${id}/trace`);
export const fetchIncidentPods = (id: string) =>
  get<unknown>(`/api/incidents/${id}/pods`);
export const fetchMemoryStatus = () => get<MemoryStatus>("/api/memory/status");
export const fetchRunbook = () => get<RunbookStatus>("/api/memory/runbook");
export const triggerRunbookRefresh = () =>
  post<{ operation_id: string }>("/api/memory/runbook/refresh");

export const setApproval = (incidentId: string, status: ApprovalStatus) =>
  put<{ incident_id: string; approval_status: ApprovalStatus }>(
    `/api/memory/approvals/${incidentId}`,
    { status }
  );

// ── Run store / Learning loop ──────────────────────────────────────────────────

export const fetchRuns = (limit = 20) =>
  get<RunRecord[]>(`/api/runs?limit=${limit}`);

export const fetchRun = (runId: string) =>
  get<RunRecord>(`/api/runs/${runId}`);

export const compareRuns = (runIdA: string, runIdB: string) =>
  post<RunComparison>("/api/runs/compare", { run_id_a: runIdA, run_id_b: runIdB });

export const resetMemoryBank = () => {
  return fetch("/api/memory/bank", { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`DELETE /api/memory/bank → ${r.status}`);
    return r.json();
  });
};

// ── SSE streaming ──────────────────────────────────────────────────────────────

export async function streamInvestigation(
  incidentId: string,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
  mode: RunMode = "live"
): Promise<void> {
  const params = mode === "baseline" ? "?baseline=true" : mode === "demo" ? "?demo=true" : "";
  let response: Response;
  try {
    response = await fetch(`/api/investigate/${incidentId}${params}`, {
      method: "POST",
      signal,
      headers: { Accept: "text/event-stream" },
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}: ${response.statusText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by blank lines
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        for (const line of chunk.split(/\r?\n/)) {
          if (line.startsWith("data: ")) {
            const json = line.slice(6).trim();
            if (!json || json === "[DONE]") continue;
            try {
              onEvent(JSON.parse(json) as StreamEvent);
            } catch {
              // skip unparseable lines
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
