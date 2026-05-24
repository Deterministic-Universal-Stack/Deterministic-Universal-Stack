import { createHash, createHmac } from "node:crypto";
export function canonicalStringify(value) {
    if (typeof value === "bigint") {
        return JSON.stringify({ __bigint__: value.toString() });
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalStringify).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const obj = value;
        return `{${Object.keys(obj)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
export function canonicalHash(value) {
    return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}
export function signEvent(eventHash, signingKey) {
    return createHmac("sha256", signingKey).update(eventHash).digest("hex");
}
export function verifyEventSignature(event, signingKey) {
    if (!event.signature) {
        return false;
    }
    return signEvent(event.hash, signingKey) === event.signature;
}
export function createState(value, eventCount = 0n) {
    return {
        value,
        hash: canonicalHash(value),
        eventCount
    };
}
export function compareEventIds(a, b) {
    return a.localeCompare(b);
}
function compareEvents(a, b) {
    const byTimestamp = a.metadata.timestamp - b.metadata.timestamp;
    if (byTimestamp !== 0) {
        return byTimestamp;
    }
    const byLamport = a.metadata.lamport < b.metadata.lamport ? -1 : a.metadata.lamport > b.metadata.lamport ? 1 : 0;
    if (byLamport !== 0) {
        return byLamport;
    }
    return compareEventIds(a.id, b.id);
}
export function canonicalEventOrder(events) {
    return [...events].sort((a, b) => {
        const byTimestamp = a.metadata.timestamp - b.metadata.timestamp;
        if (byTimestamp !== 0) {
            return byTimestamp;
        }
        const byLamport = a.metadata.lamport < b.metadata.lamport ? -1 : a.metadata.lamport > b.metadata.lamport ? 1 : 0;
        if (byLamport !== 0) {
            return byLamport;
        }
        return compareEventIds(a.id, b.id);
    });
}
export function hasCycles(events) {
    const eventMap = new Map();
    for (const event of events) {
        eventMap.set(event.id, event);
    }
    const visiting = new Set();
    const visited = new Set();
    const dfs = (id) => {
        if (visited.has(id)) {
            return false;
        }
        if (visiting.has(id)) {
            return true;
        }
        visiting.add(id);
        const event = eventMap.get(id);
        if (event) {
            for (const parent of event.parents) {
                if (eventMap.has(parent) && dfs(parent)) {
                    return true;
                }
            }
        }
        visiting.delete(id);
        visited.add(id);
        return false;
    };
    for (const id of eventMap.keys()) {
        if (dfs(id)) {
            return true;
        }
    }
    return false;
}
export function topologicalSort(events) {
    const eventMap = new Map();
    const inDegree = new Map();
    const children = new Map();
    for (const event of events) {
        eventMap.set(event.id, event);
        inDegree.set(event.id, inDegree.get(event.id) ?? 0);
        children.set(event.id, children.get(event.id) ?? new Set());
    }
    for (const event of eventMap.values()) {
        for (const parent of [...event.parents].sort(compareEventIds)) {
            if (!eventMap.has(parent)) {
                continue;
            }
            children.get(parent).add(event.id);
            inDegree.set(event.id, (inDegree.get(event.id) ?? 0) + 1);
        }
    }
    const queue = canonicalEventOrder([...eventMap.values()].filter((event) => (inDegree.get(event.id) ?? 0) === 0));
    const sorted = [];
    while (queue.length > 0) {
        const event = queue.shift();
        sorted.push(event);
        const neighbors = [...(children.get(event.id) ?? new Set())]
            .map((id) => eventMap.get(id))
            .sort(compareEvents);
        for (const neighbor of neighbors) {
            const next = (inDegree.get(neighbor.id) ?? 1) - 1;
            inDegree.set(neighbor.id, next);
            if (next === 0) {
                queue.push(neighbor);
                queue.sort(compareEvents);
            }
        }
    }
    if (sorted.length !== eventMap.size) {
        throw new Error("Cycle detected while sorting events.");
    }
    return sorted;
}
export function mergeEventSets(left, right) {
    const merged = new Map();
    for (const event of left) {
        merged.set(event.id, event);
    }
    for (const event of right) {
        merged.set(event.id, event);
    }
    return merged;
}
function computeFrontier(events) {
    const frontier = new Set();
    const referenced = new Set();
    for (const event of events) {
        frontier.add(event.id);
        for (const parent of event.parents) {
            referenced.add(parent);
        }
    }
    for (const parent of referenced) {
        frontier.delete(parent);
    }
    return frontier;
}
function nextLamport(events) {
    let max = 0n;
    for (const event of events) {
        if (event.metadata.lamport > max) {
            max = event.metadata.lamport;
        }
    }
    return max + 1n;
}
export class DUS {
    reducer;
    reducerVersion;
    signingKey;
    nodeId;
    initialValue;
    events = new Map();
    frontier = new Set();
    state;
    constructor(nodeId, reducer, options) {
        this.nodeId = nodeId;
        this.reducer = reducer;
        this.reducerVersion = options.reducerVersion;
        this.signingKey = options.signingKey;
        this.initialValue = (options.initialValue ?? {});
        this.state = createState(this.initialValue);
    }
    emit(type, payload, options = {}) {
        const parents = [...(options.parents ?? [...this.frontier])].sort(compareEventIds);
        const lamport = nextLamport(this.events.values());
        const timestamp = options.timestamp ?? Date.now();
        const sessionId = options.sessionId ?? "default";
        const vectorClock = { [this.nodeId]: lamport };
        const metadata = {
            timestamp,
            nodeId: this.nodeId,
            sessionId,
            lamport,
            vectorClock
        };
        const hash = canonicalHash({ type, payload, parents, metadata });
        const event = {
            id: hash,
            type,
            payload,
            parents,
            metadata,
            hash,
            signature: this.signingKey ? signEvent(hash, this.signingKey) : undefined
        };
        this.accept(event);
        return event;
    }
    accept(event) {
        if (this.events.has(event.id)) {
            return;
        }
        this.events.set(event.id, event);
        this.frontier.add(event.id);
        for (const parent of event.parents) {
            this.frontier.delete(parent);
        }
        this.state = this.replay();
    }
    sync(peer) {
        const events = peer instanceof DUS ? peer.getEvents() : Array.isArray(peer) ? peer : [...peer];
        for (const event of events) {
            this.accept(event);
        }
        return this.state;
    }
    replay(events = this.getEvents(), initial = createState(this.initialValue)) {
        const sorted = topologicalSort(events);
        let state = initial;
        for (const event of sorted) {
            state = this.reducer(state, event);
            const expectedHash = canonicalHash(state.value);
            if (state.hash !== expectedHash) {
                throw new Error(`Reducer violated determinism at event ${event.id}`);
            }
        }
        return {
            value: state.value,
            hash: canonicalHash(state.value),
            eventCount: BigInt(sorted.length) + initial.eventCount
        };
    }
    snapshot() {
        const eventIds = this.getEvents().map((event) => event.id);
        const frontier = [...this.frontier].sort(compareEventIds);
        return {
            reducerVersion: this.reducerVersion,
            state: this.state,
            frontier,
            eventCount: eventIds.length,
            eventIds,
            hash: canonicalHash({
                reducerVersion: this.reducerVersion,
                stateHash: this.state.hash,
                frontier,
                eventIds
            })
        };
    }
    replayFromSnapshot(snapshot, tailEvents) {
        if (snapshot.reducerVersion !== this.reducerVersion) {
            throw new Error("Reducer version mismatch.");
        }
        return this.replay(tailEvents, snapshot.state);
    }
    verify() {
        const errors = [];
        if (hasCycles(this.events.values())) {
            errors.push("Event graph contains a cycle.");
        }
        for (const event of this.events.values()) {
            const expectedHash = canonicalHash({
                type: event.type,
                payload: event.payload,
                parents: event.parents,
                metadata: event.metadata
            });
            if (event.hash !== expectedHash || event.id !== expectedHash) {
                errors.push(`Event hash mismatch for ${event.id}.`);
            }
            for (const parent of event.parents) {
                if (!this.events.has(parent)) {
                    errors.push(`Missing parent ${parent} referenced by ${event.id}.`);
                }
            }
            if (this.signingKey && !verifyEventSignature(event, this.signingKey)) {
                errors.push(`Invalid signature for ${event.id}.`);
            }
        }
        try {
            const replayed = this.replay();
            if (replayed.hash !== this.state.hash) {
                errors.push("Live state differs from replayed state.");
            }
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
        return { isValid: errors.length === 0, errors };
    }
    getEvents() {
        return canonicalEventOrder(this.events.values());
    }
    getState() {
        return this.state;
    }
    getFrontier() {
        return [...this.frontier].sort(compareEventIds);
    }
    merge(other) {
        const merged = new DUS(this.nodeId, this.reducer, {
            reducerVersion: this.reducerVersion,
            initialValue: this.initialValue,
            signingKey: this.signingKey
        });
        for (const event of mergeEventSets(this.getEvents(), other.getEvents()).values()) {
            merged.accept(event);
        }
        return merged;
    }
    recomputeFrontier() {
        this.frontier = computeFrontier(this.events.values());
    }
}
export function validateReducer(nodeId, reducer, events, options) {
    const first = new DUS(nodeId, reducer, options);
    const second = new DUS(`${nodeId}-peer`, reducer, options);
    const errors = [];
    try {
        first.sync(events);
        second.sync([...events].reverse());
        if (first.getState().hash !== second.getState().hash) {
            errors.push("Reducer is order-sensitive over the same causal history.");
        }
        const replay = first.replay();
        if (replay.hash !== first.getState().hash) {
            errors.push("Replay hash differs from live state hash.");
        }
        const verification = first.verify();
        errors.push(...verification.errors);
    }
    catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
    }
    return {
        isValid: errors.length === 0,
        errors,
        replayHash: first.getState().hash
    };
}
export const SYSTEM_LAWS = [
    "State is derived only from immutable events.",
    "Any two replicas that possess the same closed event set and reducer version converge to the same state hash.",
    "No valid replay may depend on hidden mutable state.",
    "Duplicate delivery is safe because event IDs are content-addressed.",
    "Causal parents must be replayed before their children."
];
//# sourceMappingURL=index.js.map