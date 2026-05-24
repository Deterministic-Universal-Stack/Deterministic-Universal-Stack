import { DUS, canonicalHash } from "@dus/core";
import { FileSystemEventStore } from "@dus/storage";
import path from "node:path";
const reducer = (state, event) => {
    const payload = event.payload;
    const kv = { ...state.value.kv };
    if (event.type === "set") {
        kv[String(payload.key)] = payload.value;
    }
    return {
        value: { kv },
        hash: canonicalHash({ kv }),
        eventCount: state.eventCount + 1n
    };
};
async function main() {
    const command = process.argv[2] ?? "help";
    const runtime = new DUS("cli-node", reducer, {
        reducerVersion: "dus-cli@1",
        initialValue: { kv: {} }
    });
    runtime.emit("set", { key: "system", value: "deterministic" }, { timestamp: 1 });
    runtime.emit("set", { key: "replication", value: "causal" }, { timestamp: 2 });
    if (command === "replay") {
        console.log(JSON.stringify(runtime.replay(), null, 2));
        return;
    }
    if (command === "snapshot") {
        console.log(JSON.stringify(runtime.snapshot(), null, 2));
        return;
    }
    if (command === "persist") {
        const store = new FileSystemEventStore({
            rootDir: path.join(process.cwd(), ".tmp")
        });
        const log = await store.saveLog("cli-demo", "dus-cli@1", runtime.getEvents());
        console.log(JSON.stringify(log, null, 2));
        return;
    }
    console.log("Usage: npm run replay | tsx apps/cli/src/index.ts [replay|snapshot|persist]");
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map