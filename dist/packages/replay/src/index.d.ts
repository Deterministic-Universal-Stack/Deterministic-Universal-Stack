import { type Event, type Reducer, type State } from "@dus/core";
export interface ReplayCheckpoint<TValue> {
    eventId: string;
    index: number;
    state: State<TValue>;
}
export interface ReplayTrace<TValue> {
    finalState: State<TValue>;
    checkpoints: ReplayCheckpoint<TValue>[];
}
export declare function replayEvents<TValue>(initialState: State<TValue>, events: Iterable<Event>, reducer: Reducer<TValue>, checkpointEvery?: number): ReplayTrace<TValue>;
export declare function replayFromCheckpoint<TValue>(checkpoint: ReplayCheckpoint<TValue>, tailEvents: Iterable<Event>, reducer: Reducer<TValue>): ReplayTrace<TValue>;
//# sourceMappingURL=index.d.ts.map