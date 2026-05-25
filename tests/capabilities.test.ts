import { describe, expect, it } from "vitest";
import { describeSystemCapabilities } from "@dus/capabilities";

describe("capability graph", () => {
  it("provides gui routes for every app", () => {
    const graph = describeSystemCapabilities();

    expect(graph.apps.length).toBeGreaterThan(0);
    expect(graph.apps.every((app) => app.url.length > 0)).toBe(true);
    expect(graph.layers.map((layer) => layer.id)).toContain("polyglot");
    expect(graph.invariants.map((invariant) => invariant.math)).toContain("S = Phi(closure(E))");
  });
});
