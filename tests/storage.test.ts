import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DUS, canonicalHash, type Reducer } from "@dus/core";
import { FileSystemEventStore } from "@dus/storage";

interface KVState {
  values: Record<string, unknown>;
}

const reducer: Reducer<KVState> = (state, event) => {
  const payload = event.payload as Record<string, unknown>;
  const values = { ...state.value.values, [String(payload.key)]: payload.value };
  return {
    value: { values },
    hash: canonicalHash({ values }),
    eventCount: state.eventCount + 1n
  };
};

describe("persistent event storage", () => {
  it("writes and verifies persisted logs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dus-"));
    try {
      const runtime = new DUS<KVState>("node", reducer, {
        reducerVersion: "store@1",
        initialValue: { values: {} }
      });
      runtime.emit("set", { key: "a", value: 1 }, { timestamp: 1 });
      runtime.emit("set", { key: "b", value: 2 }, { timestamp: 2 });

      const store = new FileSystemEventStore({ rootDir: dir });
      await store.saveLog("primary", "store@1", runtime.getEvents());
      const valid = await store.verifyLog("primary");
      const loaded = await store.loadLog("primary");

      expect(valid).toBe(true);
      expect(loaded.events.length).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
