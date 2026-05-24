import { describe, expect, it } from "vitest";
import { leastUpperBound, sameSet, shannonEntropy, verifyJoinSemilattice } from "@dus/math";

describe("algebraic proof obligations", () => {
  it("verifies join-semilattice laws on event sets", () => {
    const a = new Set(["e1", "e2"]);
    const b = new Set(["e2", "e3"]);
    const c = new Set(["e4"]);
    expect(verifyJoinSemilattice(a, b, c)).toBe(true);
    expect(sameSet(leastUpperBound(a, b), new Set(["e1", "e2", "e3"]))).toBe(true);
  });

  it("computes entropy over replicated distributions", () => {
    const entropy = shannonEntropy([4, 4, 2]);
    expect(entropy).toBeGreaterThan(0);
    expect(entropy).toBeLessThan(2);
  });
});
