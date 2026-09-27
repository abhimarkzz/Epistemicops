import { describe, expect, it } from "vitest";

// Minimal smoke test: the module imports without error.
// UI integration tests will be added in a later stage once
// mock-service-worker is set up.
describe("App module", () => {
  it("can be imported", async () => {
    // Dynamic import verifies the module parses and exports a default.
    const mod = await import("./App");
    expect(typeof mod.default).toBe("function");
  });
});
