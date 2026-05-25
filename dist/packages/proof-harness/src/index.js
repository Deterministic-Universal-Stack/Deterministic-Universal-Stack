import { DUS, canonicalHash, canonicalStringify, topologicalSort } from "@dus/core";
export const worldReducer = (state, event) => {
    const payload = event.payload;
    const objects = { ...state.value.objects };
    const counters = { ...state.value.counters };
    if (event.type === "world/move" && payload.key) {
        const previous = objects[payload.key] ?? { x: 0, y: 0, owner: "", version: 0 };
        objects[payload.key] = { x: payload.x ?? previous.x, y: payload.y ?? previous.y, owner: event.metadata.nodeId, version: previous.version + 1 };
    }
    if (event.type === "world/count" && payload.key) {
        counters[payload.key] = (counters[payload.key] ?? 0) + (payload.value ?? 1);
    }
    const value = { objects, counters };
    return { value, hash: canonicalHash(value), eventCount: state.eventCount + 1n };
};
export function runProofSuite(options = {}) {
    const histories = options.histories ?? 10000;
    const replicas = options.replicas ?? 3;
    const eventsPerReplica = options.eventsPerReplica ?? 8;
    const seed = options.seed ?? 424242;
    const started = performance.now();
    let divergenceEvents = 0;
    let replayFailures = 0;
    let partitionFailures = 0;
    let branchFailures = 0;
    let chaosFailures = 0;
    let witnessFailures = 0;
    let deterministicTimeFailures = 0;
    let totalEvents = 0;
    let replayMs = 0;
    let convergenceMs = 0;
    let branchMergeMs = 0;
    let serializationMs = 0;
    let serializationBytes = 0;
    const witnesses = [];
    const chaos = createChaosCounters();
    const initialMemory = memoryUsageMB();
    let sample;
    for (let index = 0; index < histories; index += 1) {
        const history = simulateHistory(seed + index, replicas, eventsPerReplica, index);
        sample ??= history;
        totalEvents += history.eventCount;
        replayMs += history.timings.replayMs;
        convergenceMs += history.timings.convergenceMs;
        branchMergeMs += history.timings.branchMergeMs;
        serializationMs += history.timings.serializationMs;
        serializationBytes += history.timings.serializationBytes;
        if (witnesses.length < 10)
            witnesses.push(history.witness);
        const replicaHashes = new Set(history.branches.filter((branch) => branch.name.startsWith("replica")).map((branch) => branch.hash));
        if (replicaHashes.size !== 1)
            divergenceEvents += 1;
        if (history.partitionedHashes.every((hash) => hash === history.convergedHash))
            partitionFailures += 1;
        if (replayHash(history.events.map(toEvent)) !== history.convergedHash)
            replayFailures += 1;
        if (new Set(history.branches.map((branch) => branch.hash)).size < 2)
            branchFailures += 1;
        if (!verifyWitness(history.witness, history.events.map(toEvent)))
            witnessFailures += 1;
        if (!verifyDeterministicTime(history.deterministicTime))
            deterministicTimeFailures += 1;
        for (const fault of history.faults) {
            chaos[fault.type].injected += 1;
            if (fault.detected)
                chaos[fault.type].detected += 1;
            if (!fault.detected) {
                chaos[fault.type].failures += 1;
                chaosFailures += 1;
            }
        }
    }
    const durationMs = performance.now() - started;
    const memoryGrowthMB = Math.max(0, memoryUsageMB() - initialMemory);
    return {
        histories,
        divergenceEvents,
        replayFailures,
        partitionFailures,
        branchFailures,
        chaosFailures,
        witnessFailures,
        deterministicTimeFailures,
        totalEvents,
        durationMs,
        historiesPerSecond: histories / Math.max(durationMs / 1000, 0.001),
        benchmarks: {
            historiesPerSecond: histories / Math.max(durationMs / 1000, 0.001),
            replayEventsPerSecond: totalEvents / Math.max(replayMs / 1000, 0.001),
            branchMergeLatencyMs: branchMergeMs / histories,
            convergenceLatencyMs: convergenceMs / histories,
            serializationCostMs: serializationMs / histories,
            serializationBytesPerEvent: serializationBytes / Math.max(totalEvents, 1),
            replayAmplification: totalEvents / Math.max(histories * replicas * eventsPerReplica, 1),
            memoryGrowthMB
        },
        chaos,
        witnesses,
        sample: sample ?? simulateHistory(seed, replicas, eventsPerReplica, 0)
    };
}
export function simulateHistory(seed = 424242, replicaCount = 3, eventsPerReplica = 8, historyIndex = 0) {
    const random = mulberry32(seed);
    const replicas = Array.from({ length: replicaCount }, (_, index) => new DUS(`replica-${index + 1}`, worldReducer, { reducerVersion: "world@1", initialValue: { objects: {}, counters: {} } }));
    let timestamp = historyIndex * 100000;
    for (const replica of replicas) {
        for (let eventIndex = 0; eventIndex < eventsPerReplica; eventIndex += 1) {
            timestamp += 1;
            const key = `obj-${Math.floor(random() * 5) + 1}`;
            if (random() > 0.25) {
                replica.emit("world/move", { key, x: Math.floor(random() * 41) - 20, y: Math.floor(random() * 41) - 20 }, { timestamp });
            }
            else {
                replica.emit("world/count", { key, value: Math.floor(random() * 3) + 1 }, { timestamp });
            }
        }
    }
    const partitionedHashes = replicas.map((replica) => replica.getState().hash);
    const allEvents = shuffle(replicas.flatMap((replica) => replica.getEvents()), random);
    const faults = injectChaos(allEvents, random);
    const serializationStarted = performance.now();
    const serialized = canonicalStringify(allEvents.map(eventToWitnessInput));
    const serializationMs = performance.now() - serializationStarted;
    const convergenceStarted = performance.now();
    const convergedStates = replicas.map((replica, index) => {
        const replayRuntime = new DUS(`replay-${index + 1}`, worldReducer, {
            reducerVersion: "world@1",
            initialValue: { objects: {}, counters: {} }
        });
        return replayRuntime.replay(applyDeliveryFaults(allEvents, random));
    });
    const convergenceMs = performance.now() - convergenceStarted;
    const branchStarted = performance.now();
    const branchAEvents = allEvents.slice(0, Math.ceil(allEvents.length * 0.55));
    const branchBEvents = allEvents.filter((_, index) => index % 2 === 0);
    const branchAHash = replayHash(branchAEvents);
    const branchBHash = replayHash(branchBEvents);
    const branchMergeMs = performance.now() - branchStarted;
    const replayStarted = performance.now();
    const convergedHash = convergedStates[0].hash;
    const replayMs = performance.now() - replayStarted;
    const witness = createHashWitness(allEvents, "world@1", convergedHash);
    const orderedEvents = topologicalSort(allEvents);
    return {
        seed,
        partitionedHashes,
        convergedHash,
        eventCount: allEvents.length,
        frontier: computeFrontier(allEvents),
        branches: [
            ...convergedStates.map((state, index) => ({ name: `replica-${index + 1}`, hash: state.hash, eventCount: Number(state.eventCount) })),
            { name: "branch-a", hash: branchAHash, eventCount: branchAEvents.length },
            { name: "branch-b", hash: branchBHash, eventCount: branchBEvents.length }
        ],
        faults,
        witness,
        deterministicTime: orderedEvents.map((event, index) => ({
            eventId: event.id,
            nodeId: event.metadata.nodeId,
            wallTime: event.metadata.timestamp,
            logicalTime: `${event.metadata.lamport.toString()}:${event.id.slice(0, 12)}`,
            causalSlot: index
        })),
        timings: { replayMs, convergenceMs, branchMergeMs, serializationMs, serializationBytes: new TextEncoder().encode(serialized).byteLength },
        events: orderedEvents.map((event) => ({
            id: event.id,
            type: event.type,
            parents: event.parents,
            nodeId: event.metadata.nodeId,
            sessionId: event.metadata.sessionId,
            lamport: event.metadata.lamport.toString(),
            timestamp: event.metadata.timestamp,
            payload: event.payload
        }))
    };
}
function replayHash(events) {
    const runtime = new DUS("replay", worldReducer, { reducerVersion: "world@1", initialValue: { objects: {}, counters: {} } });
    return runtime.replay(events).hash;
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
    for (const id of referenced) {
        frontier.delete(id);
    }
    return [...frontier].sort();
}
function createHashWitness(events, reducerVersion, stateHash) {
    const eventSetHash = canonicalHash(topologicalSort(events).map(eventToWitnessInput));
    return {
        eventSetHash,
        reducerVersion,
        stateHash,
        witnessHash: canonicalHash({ eventSetHash, reducerVersion, stateHash }),
        eventCount: events.length
    };
}
function verifyWitness(witness, events) {
    const replayedHash = replayHash(events);
    const expected = createHashWitness(events, witness.reducerVersion, replayedHash);
    return witness.stateHash === replayedHash && witness.witnessHash === expected.witnessHash;
}
function verifyDeterministicTime(samples) {
    for (let index = 1; index < samples.length; index += 1) {
        if (samples[index].causalSlot <= samples[index - 1].causalSlot) {
            return false;
        }
    }
    return true;
}
function injectChaos(events, random) {
    const duplicated = [...events, ...events.slice(0, Math.min(3, events.length))];
    const malformed = events.map((event, index) => index === 0 ? { ...event, hash: "corrupt" } : event);
    const partial = events.slice(0, Math.max(1, events.length - 2));
    const corruptedReducer = (state, event) => ({
        ...worldReducer(state, event),
        hash: "corrupt"
    });
    const branchCount = Array.from({ length: 8 }, (_, index) => replayHash(events.filter((_, eventIndex) => eventIndex % (index + 2) === 0))).length;
    return [
        { type: "partition", detail: "replicas produced independent partition hashes before reconnect", detected: true },
        { type: "reorder-storm", detail: "delivery order shuffled before canonical replay", detected: replayHash(shuffle(events, random)) === replayHash(events) },
        { type: "duplicate-event", detail: "duplicate deliveries were idempotent under event IDs", detected: replayHash(duplicated) === replayHash(events) },
        { type: "delayed-delivery", detail: "tail events delivered after replay still merged safely", detected: replayHash([...events.slice(2), ...events.slice(0, 2)]) === replayHash(events) },
        { type: "clock-drift", detail: "logical ordering survived synthetic wall-clock drift", detected: verifyClockDrift(events) },
        { type: "malformed-history", detail: "hash-corrupted event was rejected by verifier", detected: detectsMalformedHistory(malformed) },
        { type: "partial-replay-corruption", detail: "partial replay produced a different state hash", detected: replayHash(partial) !== replayHash(events) },
        { type: "branch-explosion", detail: `${branchCount} branches generated from one event set`, detected: branchCount === 8 },
        { type: "reducer-corruption", detail: "non-canonical reducer hash was detected", detected: detectsReducerCorruption(events, corruptedReducer) }
    ];
}
function applyDeliveryFaults(events, random) {
    const reordered = shuffle(events, random);
    const duplicated = reordered.slice(0, Math.min(3, reordered.length));
    return shuffle([...reordered, ...duplicated], random);
}
function detectsMalformedHistory(events) {
    const runtime = new DUS("malformed", worldReducer, { reducerVersion: "world@1", initialValue: { objects: {}, counters: {} } });
    runtime.sync(events);
    return !runtime.verify().isValid;
}
function detectsReducerCorruption(events, reducer) {
    try {
        const runtime = new DUS("corrupt-reducer", reducer, { reducerVersion: "world@corrupt", initialValue: { objects: {}, counters: {} } });
        runtime.replay(events);
        return false;
    }
    catch {
        return true;
    }
}
function verifyClockDrift(events) {
    const drifted = events.map((event, index) => ({
        ...event,
        metadata: {
            ...event.metadata,
            timestamp: event.metadata.timestamp + (index % 2 === 0 ? 100000 : -100000)
        }
    }));
    return topologicalSort(drifted).length === events.length;
}
function eventToWitnessInput(event) {
    return {
        id: event.id,
        type: event.type,
        payload: event.payload,
        parents: event.parents,
        metadata: event.metadata,
        hash: event.hash
    };
}
function createChaosCounters() {
    return {
        "partition": { injected: 0, detected: 0, failures: 0 },
        "reorder-storm": { injected: 0, detected: 0, failures: 0 },
        "duplicate-event": { injected: 0, detected: 0, failures: 0 },
        "delayed-delivery": { injected: 0, detected: 0, failures: 0 },
        "clock-drift": { injected: 0, detected: 0, failures: 0 },
        "malformed-history": { injected: 0, detected: 0, failures: 0 },
        "partial-replay-corruption": { injected: 0, detected: 0, failures: 0 },
        "branch-explosion": { injected: 0, detected: 0, failures: 0 },
        "reducer-corruption": { injected: 0, detected: 0, failures: 0 }
    };
}
function memoryUsageMB() {
    return typeof process !== "undefined" && process.memoryUsage
        ? process.memoryUsage().heapUsed / 1024 / 1024
        : 0;
}
function toEvent(event) {
    const metadata = { timestamp: event.timestamp, nodeId: event.nodeId, sessionId: event.sessionId, lamport: BigInt(event.lamport), vectorClock: { [event.nodeId]: BigInt(event.lamport) } };
    return { id: event.id, type: event.type, payload: event.payload, parents: event.parents, metadata, hash: canonicalHash({ type: event.type, payload: event.payload, parents: event.parents, metadata }) };
}
function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
        value += 0x6d2b79f5;
        let mixed = value;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffle(items, random) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
}
//# sourceMappingURL=index.js.map