import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEventOrder, canonicalHash } from "@dus/core";
export function merkleRoot(events) {
    const leaves = canonicalEventOrder(events).map((event) => canonicalHash({
        id: event.id,
        type: event.type,
        payload: event.payload,
        parents: event.parents,
        metadata: event.metadata,
        hash: event.hash,
        signature: event.signature ?? null
    }));
    if (leaves.length === 0) {
        return canonicalHash([]);
    }
    let level = leaves;
    while (level.length > 1) {
        const next = [];
        for (let index = 0; index < level.length; index += 2) {
            const left = level[index];
            const right = level[index + 1] ?? left;
            next.push(createHash("sha256").update(left + right).digest("hex"));
        }
        level = next;
    }
    return level[0];
}
export class FileSystemEventStore {
    config;
    constructor(config) {
        this.config = config;
    }
    async saveLog(name, reducerVersion, events) {
        await mkdir(this.config.rootDir, { recursive: true });
        const log = {
            reducerVersion,
            events: canonicalEventOrder(events),
            rootHash: merkleRoot(events)
        };
        const filePath = path.join(this.config.rootDir, `${name}.json`);
        await writeFile(filePath, stringifyWithBigInt(log), "utf8");
        return log;
    }
    async loadLog(name) {
        const filePath = path.join(this.config.rootDir, `${name}.json`);
        const raw = await readFile(filePath, "utf8");
        return parseWithBigInt(raw);
    }
    async listLogs() {
        try {
            const files = await readdir(this.config.rootDir);
            return files.filter((file) => file.endsWith(".json")).sort();
        }
        catch {
            return [];
        }
    }
    async verifyLog(name) {
        const log = await this.loadLog(name);
        return merkleRoot(log.events) === log.rootHash;
    }
}
function stringifyWithBigInt(value) {
    return JSON.stringify(value, (_key, current) => typeof current === "bigint" ? { __bigint__: current.toString() } : current, 2);
}
function parseWithBigInt(raw) {
    return JSON.parse(raw, (_key, value) => {
        if (value &&
            typeof value === "object" &&
            "__bigint__" in value &&
            typeof value.__bigint__ === "string") {
            return BigInt(value.__bigint__);
        }
        return value;
    });
}
//# sourceMappingURL=index.js.map