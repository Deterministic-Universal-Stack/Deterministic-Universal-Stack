"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const core_1 = require("@dus/core");
const network_1 = require("@dus/network");
const reducer = (state, event) => {
    const payload = event.payload;
    const values = { ...state.value.values, [String(payload.key)]: payload.value };
    return {
        value: { values },
        hash: (0, core_1.canonicalHash)({ values }),
        eventCount: state.eventCount + 1n
    };
};
(0, vitest_1.describe)("network convergence", () => {
    (0, vitest_1.it)("converges pairwise gossip to a shared frontier", () => {
        const a = new core_1.DUS("a", reducer, {
            reducerVersion: "net@1",
            initialValue: { values: {} }
        });
        const b = new core_1.DUS("b", reducer, {
            reducerVersion: "net@1",
            initialValue: { values: {} }
        });
        const c = new core_1.DUS("c", reducer, {
            reducerVersion: "net@1",
            initialValue: { values: {} }
        });
        a.emit("set", { key: "x", value: 1 }, { timestamp: 1 });
        b.emit("set", { key: "y", value: 2 }, { timestamp: 2 });
        c.emit("set", { key: "z", value: 3 }, { timestamp: 3 });
        const replicas = [(0, network_1.toReplicaView)("a", a), (0, network_1.toReplicaView)("b", b), (0, network_1.toReplicaView)("c", c)];
        const metrics = (0, network_1.convergeReplicas)(replicas);
        (0, vitest_1.expect)(metrics.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(replicas[0].frontier.size).toBe(replicas[1].frontier.size);
        (0, vitest_1.expect)(replicas[1].frontier.size).toBe(replicas[2].frontier.size);
    });
});
//# sourceMappingURL=network.test.js.map