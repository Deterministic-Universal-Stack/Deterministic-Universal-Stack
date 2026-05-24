import { createState, stringifyWithBigInt } from "@dus/core";
import { replayEvents } from "@dus/replay";
import { DeterministicProgramRuntime, programReducer } from "@dus/runtime";

function now(): bigint {
  return process.hrtime.bigint();
}

const runtime = new DeterministicProgramRuntime("bench-node", "bench-1");
const eventTarget = 1000;

const emitStart = now();
for (let index = 0; index < eventTarget; index += 1) {
  runtime.step({ op: "increment", key: "counter", value: 1 }, index + 1);
}
const emitElapsedNs = now() - emitStart;

const replayStart = now();
const replay = replayEvents(createState<Record<string, unknown>>({}), runtime.timeline().events, programReducer, 100);
const replayElapsedNs = now() - replayStart;

console.log(stringifyWithBigInt({
  benchmark: "dus-runtime-replay",
  eventTarget,
  emitElapsedNs,
  replayElapsedNs,
  finalHash: replay.finalState.hash,
  checkpoints: replay.checkpoints.length
}, 2));
