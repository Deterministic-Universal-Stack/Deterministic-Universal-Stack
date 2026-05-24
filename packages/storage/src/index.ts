import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEventOrder, canonicalHash, type Event } from "@dus/core";

export interface StoreConfig {
  rootDir: string;
}

export interface PersistedLog {
  reducerVersion: string;
  events: Event[];
  rootHash: string;
}

export function merkleRoot(events: Event[]): string {
  const leaves = canonicalEventOrder(events).map((event) =>
    canonicalHash({
      id: event.id,
      type: event.type,
      payload: event.payload,
      parents: event.parents,
      metadata: event.metadata,
      hash: event.hash,
      signature: event.signature ?? null
    })
  );
  if (leaves.length === 0) {
    return canonicalHash([]);
  }

  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
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
  constructor(private readonly config: StoreConfig) {}

  async saveLog(name: string, reducerVersion: string, events: Event[]): Promise<PersistedLog> {
    await mkdir(this.config.rootDir, { recursive: true });
    const log: PersistedLog = {
      reducerVersion,
      events: canonicalEventOrder(events),
      rootHash: merkleRoot(events)
    };
    const filePath = path.join(this.config.rootDir, `${name}.json`);
    await writeFile(filePath, stringifyWithBigInt(log), "utf8");
    return log;
  }

  async loadLog(name: string): Promise<PersistedLog> {
    const filePath = path.join(this.config.rootDir, `${name}.json`);
    const raw = await readFile(filePath, "utf8");
    return parseWithBigInt(raw) as PersistedLog;
  }

  async listLogs(): Promise<string[]> {
    try {
      const files = await readdir(this.config.rootDir);
      return files.filter((file) => file.endsWith(".json")).sort();
    } catch {
      return [];
    }
  }

  async verifyLog(name: string): Promise<boolean> {
    const log = await this.loadLog(name);
    return merkleRoot(log.events) === log.rootHash;
  }
}

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, current) => typeof current === "bigint" ? { __bigint__: current.toString() } : current,
    2
  );
}

function parseWithBigInt(raw: string): unknown {
  return JSON.parse(raw, (_key, value) => {
    if (
      value &&
      typeof value === "object" &&
      "__bigint__" in value &&
      typeof value.__bigint__ === "string"
    ) {
      return BigInt(value.__bigint__);
    }
    return value;
  });
}
