import { type Event, type Reducer, type State } from "@dus/core";
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
export declare const agentReducer: Reducer<Record<string, unknown>>;
export declare class DeterministicAgentRuntime {
    readonly nodeId: string;
    readonly runId: string;
    readonly branchId: string;
    private readonly dus;
    constructor(nodeId: string, runId: string, branchId?: string, seedEvents?: Event[]);
    record(step: Omit<AgentStep, "runId" | "branchId">, timestamp?: number): Event;
    branch(branchId: string): DeterministicAgentRuntime;
    timeline(): AgentTimeline;
    replay(events?: Event<unknown>[]): State<Record<string, unknown>>;
    sync(peer: DeterministicAgentRuntime): AgentTimeline;
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
export declare const programReducer: Reducer<Record<string, unknown>>;
export declare class DeterministicProgramRuntime {
    readonly nodeId: string;
    readonly runtimeId: string;
    private readonly dus;
    constructor(nodeId: string, runtimeId: string, seedEvents?: Event[]);
    step(instruction: ProgramInstruction, timestamp?: number): Event;
    state(): State<Record<string, unknown>>;
    timeline(): ProgramTimeline;
    replay(events?: Event<unknown>[]): State<Record<string, unknown>>;
    sync(peer: DeterministicProgramRuntime): ProgramTimeline;
}
//# sourceMappingURL=index.d.ts.map