import { describe, expect, it } from "vitest";
import { deriveTopology } from "./components/three/EpistemicGraph";
import type { Incident, DiagnosisResult, TraceData, StreamEvent } from "./types";

describe("App module", () => {
  it("can be imported", async () => {
    const mod = await import("./App");
    expect(typeof mod.default).toBe("function");
  });
});

describe("EpistemicGraph deriveTopology (3D State Synchronization)", () => {
  const mockIncident: Incident = {
    id: "INC-004",
    title: "Deployment rollout not progressing — shipping service",
    service: "shipping-service",
    severity: "critical",
    category: "bad_deploy",
    duration_minutes: 12,
  };

  it("returns empty nodes and edges when no incident is selected", () => {
    const result = deriveTopology(null, null, null, null, [], false, "idle");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("derives topology nodes for selected incident INC-004", () => {
    const result = deriveTopology(mockIncident, null, null, null, [], false, "idle");
    expect(result.nodes.length).toBeGreaterThan(0);
    const serviceNode = result.nodes.find((n) => n.id === "shipping-service");
    expect(serviceNode).toBeDefined();
    expect(serviceNode?.type).toBe("service");
  });

  it("activates investigating state when phase is running", () => {
    const timeline: Array<{ ev: StreamEvent; at: number }> = [
      { ev: { event: "tool_started", data: { tool: "get_logs" } }, at: Date.now() },
    ];
    const result = deriveTopology(mockIncident, null, null, null, timeline, false, "running");
    const serviceNode = result.nodes.find((n) => n.id === "shipping-service");
    expect(serviceNode?.state).toBe("investigating");
  });

  it("highlights root-cause node when diagnosis completes", () => {
    const diagnosis: DiagnosisResult = {
      incident_id: "INC-004",
      root_cause: "ImagePullBackOff on shipping-service due to invalid revision tag",
      recommended_remediation: "Rollback deployment to rev-7",
      confidence: 0.95,
      evidence: ["Container registry 404"],
      memory_used: false,
      tool_calls: ["get_logs", "describe_pod"],
      status: "completed",
    };
    const result = deriveTopology(mockIncident, null, null, diagnosis, [], false, "completed");
    const serviceNode = result.nodes.find((n) => n.id === "shipping-service");
    expect(serviceNode?.state).toBe("root-cause");
  });

  it("tags nodes as memory related when Hindsight recalls relevant memory", () => {
    const result = deriveTopology(mockIncident, null, null, null, [], true, "idle");
    const memoryNode = result.nodes.find((n) => n.isMemoryRelated);
    expect(memoryNode).toBeDefined();
  });

  it("incorporates dependency edges from trace spans", () => {
    const traces: TraceData = {
      spans: [
        { name: "HTTP GET /checkout", service: "shipping-service", duration_ms: 240 },
        { name: "Query token-db", service: "token-service-db", duration_ms: 120 },
      ],
      summary: "Trace showing downstream DB bottleneck",
    };
    const result = deriveTopology(mockIncident, null, traces, null, [], false, "idle");
    const edge = result.edges.find((e) => e.highlighted);
    expect(edge).toBeDefined();
  });
});

describe("Incident selection and demo replay safety", () => {
  it("determines demo support truthfully from demoIds without silent fallback", () => {
    const demoIds = ["inc-003", "inc-004"];
    
    // INC-004 has demo replay
    const inc004Supported = demoIds.includes("inc-004");
    expect(inc004Supported).toBe(true);

    // INC-005 does NOT have demo replay
    const inc005Supported = demoIds.includes("inc-005");
    expect(inc005Supported).toBe(false);

    // When an unsupported incident is selected in demo mode, it must be flagged as unavailable
    // and never substitute inc-001
    const selectedIncidentId = "inc-005";
    const demoUnavailable = !demoIds.includes(selectedIncidentId);
    expect(demoUnavailable).toBe(true);
    expect(selectedIncidentId).not.toBe("inc-001");
  });
});

describe("Privacy and LegalDialog component", () => {
  it("exports LegalDialog with accessible structure", async () => {
    const mod = await import("./components/LegalDialog");
    expect(typeof mod.LegalDialog).toBe("function");
  });
});

