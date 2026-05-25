import { type Reducer } from "@dus/core";
export interface WorldState {
    objects: Record<string, {
        x: number;
        y: number;
        owner: string;
        version: number;
    }>;
    counters: Record<string, number>;
}
export interface ProofHistory {
    seed: number;
    partitionedHashes: string[];
    convergedHash: string;
    eventCount: number;
    frontier: string[];
    branches: Array<{
        name: string;
        hash: string;
        eventCount: number;
    }>;
    faults: ChaosFault[];
    witness: HashWitness;
    deterministicTime: DeterministicTimeSample[];
    timings: HistoryTimings;
    events: Array<{
        id: string;
        type: string;
        parents: string[];
        nodeId: string;
        sessionId: string;
        lamport: string;
        timestamp: number;
        payload: unknown;
    }>;
}
export interface ChaosFault {
    type: "partition" | "reorder-storm" | "duplicate-event" | "delayed-delivery" | "clock-drift" | "malformed-history" | "partial-replay-corruption" | "branch-explosion" | "reducer-corruption";
    detail: string;
    detected: boolean;
}
export interface HashWitness {
    eventSetHash: string;
    reducerVersion: string;
    stateHash: string;
    witnessHash: string;
    eventCount: number;
}
export interface DeterministicTimeSample {
    eventId: string;
    nodeId: string;
    wallTime: number;
    logicalTime: string;
    causalSlot: number;
}
export interface HistoryTimings {
    replayMs: number;
    convergenceMs: number;
    branchMergeMs: number;
    serializationMs: number;
    serializationBytes: number;
}
export interface BenchmarkMetrics {
    historiesPerSecond: number;
    replayEventsPerSecond: number;
    branchMergeLatencyMs: number;
    convergenceLatencyMs: number;
    serializationCostMs: number;
    serializationBytesPerEvent: number;
    replayAmplification: number;
    memoryGrowthMB: number;
}
export interface ProofReport {
    histories: number;
    divergenceEvents: number;
    replayFailures: number;
    partitionFailures: number;
    branchFailures: number;
    chaosFailures: number;
    witnessFailures: number;
    deterministicTimeFailures: number;
    totalEvents: number;
    durationMs: number;
    historiesPerSecond: number;
    benchmarks: BenchmarkMetrics;
    chaos: Record<ChaosFault["type"], {
        injected: number;
        detected: number;
        failures: number;
    }>;
    witnesses: HashWitness[];
    sample: ProofHistory;
}
export declare const worldReducer: Reducer<WorldState>;
export declare function runProofSuite(options?: {
    histories?: number;
    replicas?: number;
    eventsPerReplica?: number;
    seed?: number;
}): ProofReport;
export declare function simulateHistory(seed?: number, replicaCount?: number, eventsPerReplica?: number, historyIndex?: number): ProofHistory;
//# sourceMappingURL=index.d.ts.map