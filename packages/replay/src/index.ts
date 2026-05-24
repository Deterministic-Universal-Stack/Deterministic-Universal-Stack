import { canonicalHash, topologicalSort, type Event, type Reducer, type State } from "@dus/core";

export interface ReplayCheckpoint<TValue> {
  eventId: string;
  index: number;
  state: State<TValue>;
}

export interface ReplayTrace<TValue> {
  finalState: State<TValue>;
  checkpoints: ReplayCheckpoint<TValue>[];
}

export function replayEvents<TValue>(
  initialState: State<TValue>,
  events: Iterable<Event>,
  reducer: Reducer<TValue>,
  checkpointEvery = 1
): ReplayTrace<TValue> {
  const sorted = topologicalSort(events);
  let state = initialState;
  const checkpoints: ReplayCheckpoint<TValue>[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    state = reducer(state, sorted[index]);
    const hash = canonicalHash(state.value);
    if (hash !== state.hash) {
      throw new Error(`Replay detected non-canonical state at event ${sorted[index].id}`);
    }
    if ((index + 1) % checkpointEvery === 0 || index === sorted.length - 1) {
      checkpoints.push({
        eventId: sorted[index].id,
        index,
        state
      });
    }
  }

  return {
    finalState: state,
    checkpoints
  };
}

export function replayFromCheckpoint<TValue>(
  checkpoint: ReplayCheckpoint<TValue>,
  tailEvents: Iterable<Event>,
  reducer: Reducer<TValue>
): ReplayTrace<TValue> {
  return replayEvents(checkpoint.state, tailEvents, reducer, 1);
}
