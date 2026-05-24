import { describe, expect, it } from "vitest";
import { DUS, SYSTEM_LAWS, canonicalHash, type Reducer } from "@dus/core";

interface KVState {
  values: Record<string, unknown>;
}

const reducer: Reducer<KVState> = (state, event) => {
  const payload = event.payload as Record<string, unknown>;
  const values = { ...state.value.values };
  values[String(payload.key)] = payload.value;
  return {
    value: { values },
    hash: canonicalHash({ values }),
    eventCount: state.eventCount + 1n
  };
};

describe("DUS core invariants", () => {
  it("derives identical state from identical event history", () => {
    const left = new DUS<KVState>("left", reducer, {
      reducerVersion: "test@1",
      initialValue: { values: {} }
    });
    left.emit("set", { key: "a", value: 1 }, { timestamp: 1 });
    left.emit("set", { key: "b", value: 2 }, { timestamp: 2 });

    const right = new DUS<KVState>("right", reducer, {
      reducerVersion: "test@1",
      initialValue: { values: {} }
    });
    right.sync([...left.getEvents()].reverse());

    expect(left.getState().hash).toBe(right.getState().hash);
    expect(left.getState().value).toEqual(right.getState().value);
  });

  it("heals divergent replicas by exchanging event sets", () => {
    const left = new DUS<KVState>("left", reducer, {
      reducerVersion: "test@1",
      initialValue: { values: {} }
    });
    const right = new DUS<KVState>("right", reducer, {
      reducerVersion: "test@1",
      initialValue: { values: {} }
    });

    left.emit("set", { key: "left", value: "offline" }, { timestamp: 1 });
    right.emit("set", { key: "right", value: "offline" }, { timestamp: 2 });

    left.sync(right);
    right.sync(left);

    expect(left.getState().hash).toBe(right.getState().hash);
    expect(left.getState().value).toEqual({
      values: {
        left: "offline",
        right: "offline"
      }
    });
  });

  it("supports snapshots plus incremental replay", () => {
    const runtime = new DUS<KVState>("node", reducer, {
      reducerVersion: "test@1",
      initialValue: { values: {} }
    });
    runtime.emit("set", { key: "a", value: 1 }, { timestamp: 1 });
    const snapshot = runtime.snapshot();
    const tail = runtime.emit("set", { key: "b", value: 2 }, { timestamp: 2 });
    const replayed = runtime.replayFromSnapshot(snapshot, [tail]);

    expect(replayed.hash).toBe(runtime.getState().hash);
  });

  it("verifies the core laws against live state", () => {
    const runtime = new DUS<KVState>("node", reducer, {
      reducerVersion: "test@1",
      initialValue: { values: {} },
      signingKey: "secret"
    });
    runtime.emit("set", { key: "a", value: 1 }, { timestamp: 1 });

    const verification = runtime.verify();

    expect(verification.isValid).toBe(true);
    expect(verification.errors).toEqual([]);
    expect(SYSTEM_LAWS.length).toBeGreaterThan(0);
  });
});
