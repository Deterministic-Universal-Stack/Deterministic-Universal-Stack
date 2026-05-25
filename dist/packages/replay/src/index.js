import { canonicalHash, topologicalSort } from "@dus/core";
export function replayEvents(initialState, events, reducer, checkpointEvery = 1) {
    const sorted = topologicalSort(events);
    let state = initialState;
    const checkpoints = [];
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
export function replayFromCheckpoint(checkpoint, tailEvents, reducer) {
    return replayEvents(checkpoint.state, tailEvents, reducer, 1);
}
//# sourceMappingURL=index.js.map