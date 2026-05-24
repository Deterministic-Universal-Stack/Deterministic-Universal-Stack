"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const core_1 = require("@dus/core");
const storage_1 = require("@dus/storage");
const reducer = (state, event) => {
    const payload = event.payload;
    const values = { ...state.value.values, [String(payload.key)]: payload.value };
    return {
        value: { values },
        hash: (0, core_1.canonicalHash)({ values }),
        eventCount: state.eventCount + 1n
    };
};
(0, vitest_1.describe)("persistent event storage", () => {
    (0, vitest_1.it)("writes and verifies persisted logs", async () => {
        const dir = await (0, promises_1.mkdtemp)(node_path_1.default.join(node_os_1.default.tmpdir(), "dus-"));
        try {
            const runtime = new core_1.DUS("node", reducer, {
                reducerVersion: "store@1",
                initialValue: { values: {} }
            });
            runtime.emit("set", { key: "a", value: 1 }, { timestamp: 1 });
            runtime.emit("set", { key: "b", value: 2 }, { timestamp: 2 });
            const store = new storage_1.FileSystemEventStore({ rootDir: dir });
            await store.saveLog("primary", "store@1", runtime.getEvents());
            const valid = await store.verifyLog("primary");
            const loaded = await store.loadLog("primary");
            (0, vitest_1.expect)(valid).toBe(true);
            (0, vitest_1.expect)(loaded.events.length).toBe(2);
        }
        finally {
            await (0, promises_1.rm)(dir, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=storage.test.js.map