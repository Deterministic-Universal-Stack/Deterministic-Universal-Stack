import { describe, expect, it } from "vitest";
import { DUS, canonicalHash } from "@dus/core";
import { convergeReplicas, toReplicaView } from "@dus/network";
const reducer = (state, event) => {
    const payload = event.payload;
    const values = { ...state.value.values, [String(payload.key)]: payload.value };
    return {
        value: { values },
        hash: canonicalHash({ values }),
        eventCount: state.eventCount + 1n
    };
};
describe("network convergence", () => {
    it("converges pairwise gossip to a shared frontier", () => {
        const a = new DUS("a", reducer, {
            reducerVersion: "net@1",
            initialValue: { values: {} }
        });
        const b = new DUS("b", reducer, {
            reducerVersion: "net@1",
            initialValue: { values: {} }
        });
        const c = new DUS("c", reducer, {
            reducerVersion: "net@1",
            initialValue: { values: {} }
        });
        a.emit("set", { key: "x", value: 1 }, { timestamp: 1 });
        b.emit("set", { key: "y", value: 2 }, { timestamp: 2 });
        c.emit("set", { key: "z", value: 3 }, { timestamp: 3 });
        const replicas = [toReplicaView("a", a), toReplicaView("b", b), toReplicaView("c", c)];
        const metrics = convergeReplicas(replicas);
        expect(metrics.length).toBeGreaterThan(0);
        expect(replicas[0].frontier.size).toBe(replicas[1].frontier.size);
        expect(replicas[1].frontier.size).toBe(replicas[2].frontier.size);
    });
});
//# sourceMappingURL=network.test.js.map