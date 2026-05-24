"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const core_1 = require("@dus/core");
const reducer = (state, event) => {
    const payload = event.payload;
    const values = { ...state.value.values };
    values[String(payload.key)] = payload.value;
    return {
        value: { values },
        hash: (0, core_1.canonicalHash)({ values }),
        eventCount: state.eventCount + 1n
    };
};
(0, vitest_1.describe)("DUS core invariants", () => {
    (0, vitest_1.it)("derives identical state from identical event history", () => {
        const left = new core_1.DUS("left", reducer, {
            reducerVersion: "test@1",
            initialValue: { values: {} }
        });
        left.emit("set", { key: "a", value: 1 }, { timestamp: 1 });
        left.emit("set", { key: "b", value: 2 }, { timestamp: 2 });
        const right = new core_1.DUS("right", reducer, {
            reducerVersion: "test@1",
            initialValue: { values: {} }
        });
        right.sync([...left.getEvents()].reverse());
        (0, vitest_1.expect)(left.getState().hash).toBe(right.getState().hash);
        (0, vitest_1.expect)(left.getState().value).toEqual(right.getState().value);
    });
    (0, vitest_1.it)("heals divergent replicas by exchanging event sets", () => {
        const left = new core_1.DUS("left", reducer, {
            reducerVersion: "test@1",
            initialValue: { values: {} }
        });
        const right = new core_1.DUS("right", reducer, {
            reducerVersion: "test@1",
            initialValue: { values: {} }
        });
        left.emit("set", { key: "left", value: "offline" }, { timestamp: 1 });
        right.emit("set", { key: "right", value: "offline" }, { timestamp: 2 });
        left.sync(right);
        right.sync(left);
        (0, vitest_1.expect)(left.getState().hash).toBe(right.getState().hash);
        (0, vitest_1.expect)(left.getState().value).toEqual({
            values: {
                left: "offline",
                right: "offline"
            }
        });
    });
    (0, vitest_1.it)("supports snapshots plus incremental replay", () => {
        const runtime = new core_1.DUS("node", reducer, {
            reducerVersion: "test@1",
            initialValue: { values: {} }
        });
        runtime.emit("set", { key: "a", value: 1 }, { timestamp: 1 });
        const snapshot = runtime.snapshot();
        const tail = runtime.emit("set", { key: "b", value: 2 }, { timestamp: 2 });
        const replayed = runtime.replayFromSnapshot(snapshot, [tail]);
        (0, vitest_1.expect)(replayed.hash).toBe(runtime.getState().hash);
    });
    (0, vitest_1.it)("verifies the core laws against live state", () => {
        const runtime = new core_1.DUS("node", reducer, {
            reducerVersion: "test@1",
            initialValue: { values: {} },
            signingKey: "secret"
        });
        runtime.emit("set", { key: "a", value: 1 }, { timestamp: 1 });
        const verification = runtime.verify();
        (0, vitest_1.expect)(verification.isValid).toBe(true);
        (0, vitest_1.expect)(verification.errors).toEqual([]);
        (0, vitest_1.expect)(core_1.SYSTEM_LAWS.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=core.test.js.map