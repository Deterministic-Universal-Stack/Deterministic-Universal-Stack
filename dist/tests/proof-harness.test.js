import { describe, expect, it } from "vitest";
import { runProofSuite, simulateHistory } from "@dus/proof-harness";
describe("deterministic proof harness", () => {
    it("converges partitioned randomized histories", () => {
        const report = runProofSuite({ histories: 25, replicas: 3, eventsPerReplica: 5, seed: 7 });
        expect(report.divergenceEvents).toBe(0);
        expect(report.replayFailures).toBe(0);
        expect(report.partitionFailures).toBe(0);
        expect(report.branchFailures).toBe(0);
        expect(report.chaosFailures).toBe(0);
        expect(report.witnessFailures).toBe(0);
        expect(report.deterministicTimeFailures).toBe(0);
        expect(report.benchmarks.replayEventsPerSecond).toBeGreaterThan(0);
    });
    it("emits a visual replay history", () => {
        const history = simulateHistory(99, 3, 4, 1);
        expect(history.events).toHaveLength(12);
        expect(history.frontier.length).toBeGreaterThan(0);
        expect(history.faults.length).toBeGreaterThan(0);
        expect(history.witness.witnessHash).toBeTruthy();
        expect(history.deterministicTime).toHaveLength(12);
    });
});
//# sourceMappingURL=proof-harness.test.js.map