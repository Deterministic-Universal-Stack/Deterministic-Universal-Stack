export interface EventMetadata {
    timestamp: number;
    nodeId: string;
    sessionId: string;
    lamport: bigint;
    vectorClock: Record<string, bigint>;
}
export interface Event<TPayload = unknown> {
    id: string;
    type: string;
    payload: TPayload;
    parents: string[];
    metadata: EventMetadata;
    hash: string;
    signature?: string;
}
export interface State<TValue = Record<string, unknown>> {
    value: TValue;
    hash: string;
    eventCount: bigint;
}
export interface DUSOptions<TValue = Record<string, unknown>> {
    reducerVersion: string;
    initialValue?: TValue;
    signingKey?: string;
}
export interface EmitOptions {
    parents?: string[];
    timestamp?: number;
    sessionId?: string;
}
export interface Snapshot<TValue = Record<string, unknown>> {
    reducerVersion: string;
    state: State<TValue>;
    frontier: string[];
    eventCount: number;
    eventIds: string[];
    hash: string;
}
export interface VerificationResult {
    isValid: boolean;
    errors: string[];
}
export interface ReducerValidationResult extends VerificationResult {
    replayHash?: string;
}
export type Reducer<TValue = Record<string, unknown>, TPayload = unknown> = (state: State<TValue>, event: Event<TPayload>) => State<TValue>;
export declare function canonicalStringify(value: unknown): string;
export declare function canonicalHash(value: unknown): string;
export declare function signEvent(eventHash: string, signingKey: string): string;
export declare function verifyEventSignature(event: Event, signingKey: string): boolean;
export declare function createState<TValue>(value: TValue, eventCount?: bigint): State<TValue>;
export declare function compareEventIds(a: string, b: string): number;
export declare function canonicalEventOrder(events: Iterable<Event>): Event[];
export declare function hasCycles(events: Iterable<Event>): boolean;
export declare function topologicalSort(events: Iterable<Event>): Event[];
export declare function mergeEventSets(left: Iterable<Event>, right: Iterable<Event>): Map<string, Event>;
export declare class DUS<TValue = Record<string, unknown>> {
    private readonly reducer;
    private readonly reducerVersion;
    private readonly signingKey?;
    private readonly nodeId;
    private readonly initialValue;
    private readonly events;
    private frontier;
    private state;
    constructor(nodeId: string, reducer: Reducer<TValue>, options: DUSOptions<TValue>);
    emit<TPayload>(type: string, payload: TPayload, options?: EmitOptions): Event<TPayload>;
    accept(event: Event): void;
    sync(peer: DUS<TValue> | Event[] | Iterable<Event>): State<TValue>;
    replay(events?: Event[], initial?: State<TValue>): State<TValue>;
    snapshot(): Snapshot<TValue>;
    replayFromSnapshot(snapshot: Snapshot<TValue>, tailEvents: Event[]): State<TValue>;
    verify(): VerificationResult;
    getEvents(): Event[];
    getState(): State<TValue>;
    getFrontier(): string[];
    merge(other: DUS<TValue>): DUS<TValue>;
    recomputeFrontier(): void;
}
export declare function validateReducer<TValue>(nodeId: string, reducer: Reducer<TValue>, events: Event[], options: DUSOptions<TValue>): ReducerValidationResult;
export declare const SYSTEM_LAWS: readonly ["State is derived only from immutable events.", "Any two replicas that possess the same closed event set and reducer version converge to the same state hash.", "No valid replay may depend on hidden mutable state.", "Duplicate delivery is safe because event IDs are content-addressed.", "Causal parents must be replayed before their children."];
//# sourceMappingURL=index.d.ts.map