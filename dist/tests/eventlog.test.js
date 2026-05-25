import { describe, expect, it } from "vitest";
import { DUS, canonicalHash } from "@dus/core";
import { EventLog } from "@dus/eventlog";
const reducer = (state, event) => {
    const payload = event.payload;
    const values = { ...state.value.values, [payload.key]: payload.value };
    return {
        value: { values },
        hash: canonicalHash({ values }),
        eventCount: state.eventCount + 1n
    };
};
describe("event log architecture", () => {
    it("builds merkle snapshots and segments over canonical event order", () => {
        const runtime = new DUS("node", reducer, {
            reducerVersion: "eventlog@1",
            initialValue: { values: {} }
        });
        runtime.emit("set", { key: "a", value: 1 }, { timestamp: 1 });
        runtime.emit("set", { key: "b", value: 2 }, { timestamp: 2 });
        runtime.emit("set", { key: "c", value: 3 }, { timestamp: 3 });
        const log = new EventLog();
        log.appendMany(runtime.getEvents());
        const snapshot = log.snapshot(2);
        expect(snapshot.eventCount).toBe(3);
        expect(snapshot.rootHash.length).toBe(64);
        expect(snapshot.segments).toHaveLength(2);
    });
});
//# sourceMappingURL=eventlog.test.js.map