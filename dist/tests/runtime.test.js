import { describe, expect, it } from "vitest";
import { DeterministicAgentRuntime } from "@dus/runtime";
describe("deterministic agent runtime", () => {
    it("replays timelines exactly", () => {
        const runtime = new DeterministicAgentRuntime("node", "run-1");
        runtime.record({ agentId: "planner", kind: "input", content: "ship DUS" }, 1);
        runtime.record({ agentId: "planner", kind: "plan", content: ["build", "verify"] }, 2);
        runtime.record({ agentId: "worker", kind: "action", content: "npm run verify" }, 3);
        const timeline = runtime.timeline();
        expect(runtime.replay(timeline.events).hash).toBe(timeline.state.hash);
    });
    it("branches reasoning without mutating the main branch", () => {
        const main = new DeterministicAgentRuntime("node", "run-1");
        main.record({ agentId: "planner", kind: "input", content: "choose path" }, 1);
        const branch = main.branch("alt");
        branch.record({ agentId: "planner", kind: "plan", content: "alternate path" }, 2);
        expect(main.timeline().events.length).toBe(1);
        expect(branch.timeline().events.length).toBe(2);
    });
});
//# sourceMappingURL=runtime.test.js.map