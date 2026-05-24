import { describe, expect, it } from "vitest";
import { DUS, EventLog, DeterministicProgramRuntime, replayEvents, createState, programReducer } from "@dus/sdk";

describe("sdk exports", () => {
  it("exposes core, runtime, replay, and event-log surfaces together", () => {
    const runtime = new DeterministicProgramRuntime("node", "sdk-runtime");
    runtime.step({ op: "set", key: "hello", value: "world" }, 1);

    const log = new EventLog();
    log.appendMany(runtime.timeline().events);

    const replay = replayEvents(createState<Record<string, unknown>>({}), runtime.timeline().events, programReducer, 1);
    const dus = new DUS("sdk-node", programReducer, {
      reducerVersion: "sdk@1",
      initialValue: {}
    });

    expect(log.snapshot().eventCount).toBe(1);
    expect(replay.finalState.hash).toBe(runtime.state().hash);
    expect(dus.snapshot().eventCount).toBe(0);
  });
});
