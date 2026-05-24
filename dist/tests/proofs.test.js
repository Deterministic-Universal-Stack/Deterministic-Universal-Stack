"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const math_1 = require("@dus/math");
(0, vitest_1.describe)("algebraic proof obligations", () => {
    (0, vitest_1.it)("verifies join-semilattice laws on event sets", () => {
        const a = new Set(["e1", "e2"]);
        const b = new Set(["e2", "e3"]);
        const c = new Set(["e4"]);
        (0, vitest_1.expect)((0, math_1.verifyJoinSemilattice)(a, b, c)).toBe(true);
        (0, vitest_1.expect)((0, math_1.sameSet)((0, math_1.leastUpperBound)(a, b), new Set(["e1", "e2", "e3"]))).toBe(true);
    });
    (0, vitest_1.it)("computes entropy over replicated distributions", () => {
        const entropy = (0, math_1.shannonEntropy)([4, 4, 2]);
        (0, vitest_1.expect)(entropy).toBeGreaterThan(0);
        (0, vitest_1.expect)(entropy).toBeLessThan(2);
    });
});
//# sourceMappingURL=proofs.test.js.map