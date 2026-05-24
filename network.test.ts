import { describe, expect, it } from "vitest";
import { DUS, canonicalHash, type Reducer } from "@dus/core";
import { convergeReplicas, toReplicaView } from "@dus/network";

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

describe("network convergence", () => {
  it("converges pairwise gossip to a shared frontier", () => {
    const a = new DUS<KVState>("a", reducer, {
      reducerVersion: "net@1",
      initialValue: { values: {} }
    });
    const b = new DUS<KVState>("b", reducer, {
      reducerVersion: "net@1",
      initialValue: { values: {} }
    });
    const c = new DUS<KVState>("c", reducer, {
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
