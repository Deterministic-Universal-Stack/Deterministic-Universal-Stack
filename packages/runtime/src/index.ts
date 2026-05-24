import { DUS, canonicalHash, type Event, type Reducer, type State } from "@dus/core";

export type AgentStepKind = "input" | "plan" | "action" | "observation" | "result";

export interface AgentStep {
  agentId: string;
  kind: AgentStepKind;
  content: unknown;
  runId: string;
  branchId: string;
}

export interface AgentTimeline {
  runId: string;
  branchId: string;
  events: Event[];
  state: State<Record<string, unknown>>;
}

export const agentReducer: Reducer<Record<string, unknown>> = (state, event) => {
  const step = event.payload as AgentStep;
  const runKey = `run:${step.runId}:${step.branchId}`;
  const agentKey = `agent:${step.agentId}`;
  const existingRun = Array.isArray(state.value[runKey]) ? state.value[runKey] as unknown[] : [];
  const existingAgent = Array.isArray(state.value[agentKey]) ? state.value[agentKey] as unknown[] : [];
  const record = {
    eventId: event.id,
    kind: step.kind,
    content: step.content,
    timestamp: event.metadata.timestamp
  };
  const value = {
    ...state.value,
    [runKey]: [...existingRun, record],
    [agentKey]: [...existingAgent, record]
  };
  return {
    value,
    hash: canonicalHash(value),
    eventCount: state.eventCount + 1n
  };
};

export class DeterministicAgentRuntime {
  private readonly dus: DUS<Record<string, unknown>>;

  constructor(
    readonly nodeId: string,
    readonly runId: string,
    readonly branchId = "main",
    seedEvents: Event[] = []
  ) {
    this.dus = new DUS(nodeId, agentReducer, {
      reducerVersion: "dus-agent-runtime@1",
      initialValue: {}
    });
    this.dus.sync(seedEvents);
  }

  record(step: Omit<AgentStep, "runId" | "branchId">, timestamp = Date.now()): Event {
    return this.dus.emit("agent_step", {
      ...step,
      runId: this.runId,
      branchId: this.branchId
    }, { timestamp, sessionId: this.runId });
  }

  branch(branchId: string): DeterministicAgentRuntime {
    return new DeterministicAgentRuntime(this.nodeId, this.runId, branchId, this.dus.getEvents());
  }

  timeline(): AgentTimeline {
    return {
      runId: this.runId,
      branchId: this.branchId,
      events: this.dus.getEvents(),
      state: this.dus.getState()
    };
  }

  replay(events = this.dus.getEvents()): State<Record<string, unknown>> {
    return this.dus.replay(events);
  }

  sync(peer: DeterministicAgentRuntime): AgentTimeline {
    this.dus.sync(peer.timeline().events);
    return this.timeline();
  }
}

export interface ProgramInstruction {
  op: "set" | "append" | "increment";
  key: string;
  value?: unknown;
}

export interface ProgramFrame {
  runtimeId: string;
  stepId: string;
  instruction: ProgramInstruction;
  emittedAt: number;
}

export interface ProgramTimeline {
  runtimeId: string;
  events: Event[];
  state: State<Record<string, unknown>>;
}

export const programReducer: Reducer<Record<string, unknown>> = (state, event) => {
  const frame = event.payload as ProgramFrame;
  const next = { ...state.value };

  switch (frame.instruction.op) {
    case "set":
      next[frame.instruction.key] = frame.instruction.value;
      break;
    case "append": {
      const existing = Array.isArray(next[frame.instruction.key]) ? next[frame.instruction.key] as unknown[] : [];
      next[frame.instruction.key] = [...existing, frame.instruction.value];
      break;
    }
    case "increment": {
      const amount = typeof frame.instruction.value === "number" ? frame.instruction.value : 1;
      const current = typeof next[frame.instruction.key] === "number" ? next[frame.instruction.key] as number : 0;
      next[frame.instruction.key] = current + amount;
      break;
    }
    default:
      break;
  }

  return {
    value: next,
    hash: canonicalHash(next),
    eventCount: state.eventCount + 1n
  };
};

export class DeterministicProgramRuntime {
  private readonly dus: DUS<Record<string, unknown>>;

  constructor(
    readonly nodeId: string,
    readonly runtimeId: string,
    seedEvents: Event[] = []
  ) {
    this.dus = new DUS(nodeId, programReducer, {
      reducerVersion: "dus-program-runtime@1",
      initialValue: {}
    });
    this.dus.sync(seedEvents);
  }

  step(instruction: ProgramInstruction, timestamp = Date.now()): Event {
    return this.dus.emit("program_step", {
      runtimeId: this.runtimeId,
      stepId: `${this.runtimeId}:${this.dus.getEvents().length + 1}`,
      instruction,
      emittedAt: timestamp
    } satisfies ProgramFrame, { timestamp, sessionId: this.runtimeId });
  }

  state(): State<Record<string, unknown>> {
    return this.dus.getState();
  }

  timeline(): ProgramTimeline {
    return {
      runtimeId: this.runtimeId,
      events: this.dus.getEvents(),
      state: this.dus.getState()
    };
  }

  replay(events = this.dus.getEvents()): State<Record<string, unknown>> {
    return this.dus.replay(events);
  }

  sync(peer: DeterministicProgramRuntime): ProgramTimeline {
    this.dus.sync(peer.timeline().events);
    return this.timeline();
  }
}
