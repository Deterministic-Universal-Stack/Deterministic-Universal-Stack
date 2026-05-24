import { describe, expect, it } from "vitest";
import { createState } from "@dus/core";
import { replayEvents } from "@dus/replay";
import { DeterministicProgramRuntime, programReducer } from "@dus/runtime";

describe("replay engine", () => {
  it("replays deterministic program runtimes to the same final hash", () => {
    const runtime = new DeterministicProgramRuntime("node", "runtime-1");
    runtime.step({ op: "set", key: "name", value: "dus" }, 1);
    runtime.step({ op: "increment", key: "count", value: 1 }, 2);
    runtime.step({ op: "append", key: "items", value: "alpha" }, 3);

    const trace = replayEvents(createState<Record<string, unknown>>({}), runtime.timeline().events, programReducer, 2);

    expect(trace.finalState.hash).toBe(runtime.state().hash);
    expect(trace.checkpoints.length).toBeGreaterThan(0);
  });
});
