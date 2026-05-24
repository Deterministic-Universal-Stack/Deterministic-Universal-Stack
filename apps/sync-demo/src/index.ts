import { DUS, canonicalHash, stringifyWithBigInt, type Reducer } from "@dus/core";
import { convergeReplicas, toReplicaView } from "@dus/network";

interface SyncState {
  values: Record<string, string>;
}

const reducer: Reducer<SyncState> = (state, event) => {
  const payload = event.payload as { key: string; value: string };
  const values = { ...state.value.values, [payload.key]: payload.value };
  return {
    value: { values },
    hash: canonicalHash({ values }),
    eventCount: state.eventCount + 1n
  };
};

const a = new DUS<SyncState>("node-a", reducer, {
  reducerVersion: "sync-demo@1",
  initialValue: { values: {} }
});
const b = new DUS<SyncState>("node-b", reducer, {
  reducerVersion: "sync-demo@1",
  initialValue: { values: {} }
});
const c = new DUS<SyncState>("node-c", reducer, {
  reducerVersion: "sync-demo@1",
  initialValue: { values: {} }
});

a.emit("set", { key: "greeting", value: "hello" }, { timestamp: 1 });
b.emit("set", { key: "location", value: "across-town" }, { timestamp: 2 });
c.emit("set", { key: "status", value: "connected" }, { timestamp: 3 });

const replicas = [toReplicaView("node-a", a), toReplicaView("node-b", b), toReplicaView("node-c", c)];
const metrics = convergeReplicas(replicas, 5);

console.log(stringifyWithBigInt({
  metrics,
  replicas: replicas.map((replica) => ({
    nodeId: replica.nodeId,
    frontier: [...replica.frontier].sort(),
    eventIds: [...replica.events.keys()].sort()
  }))
}, 2));
