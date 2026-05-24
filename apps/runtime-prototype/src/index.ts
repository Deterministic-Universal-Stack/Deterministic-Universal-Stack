import { createState, stringifyWithBigInt } from "@dus/core";
import { EventLog } from "@dus/eventlog";
import { replayEvents } from "@dus/replay";
import { DeterministicProgramRuntime, programReducer } from "@dus/runtime";

const runtime = new DeterministicProgramRuntime("prototype-node", "prototype-1");
runtime.step({ op: "set", key: "title", value: "Deterministic runtime prototype" }, 1);
runtime.step({ op: "append", key: "messages", value: "hello" }, 2);
runtime.step({ op: "increment", key: "counter", value: 1 }, 3);
runtime.step({ op: "increment", key: "counter", value: 2 }, 4);

const timeline = runtime.timeline();
const log = new EventLog();
log.appendMany(timeline.events);
const replay = replayEvents(createState<Record<string, unknown>>({}), timeline.events, programReducer, 2);

console.log(stringifyWithBigInt({
  timeline,
  eventLog: log.snapshot(2),
  replay
}, 2));
