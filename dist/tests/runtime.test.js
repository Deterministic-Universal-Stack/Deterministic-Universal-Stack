"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const runtime_1 = require("@dus/runtime");
(0, vitest_1.describe)("deterministic agent runtime", () => {
    (0, vitest_1.it)("replays timelines exactly", () => {
        const runtime = new runtime_1.DeterministicAgentRuntime("node", "run-1");
        runtime.record({ agentId: "planner", kind: "input", content: "ship DUS" }, 1);
        runtime.record({ agentId: "planner", kind: "plan", content: ["build", "verify"] }, 2);
        runtime.record({ agentId: "worker", kind: "action", content: "npm run verify" }, 3);
        const timeline = runtime.timeline();
        (0, vitest_1.expect)(runtime.replay(timeline.events).hash).toBe(timeline.state.hash);
    });
    (0, vitest_1.it)("branches reasoning without mutating the main branch", () => {
        const main = new runtime_1.DeterministicAgentRuntime("node", "run-1");
        main.record({ agentId: "planner", kind: "input", content: "choose path" }, 1);
        const branch = main.branch("alt");
        branch.record({ agentId: "planner", kind: "plan", content: "alternate path" }, 2);
        (0, vitest_1.expect)(main.timeline().events.length).toBe(1);
        (0, vitest_1.expect)(branch.timeline().events.length).toBe(2);
    });
});
//# sourceMappingURL=runtime.test.js.map