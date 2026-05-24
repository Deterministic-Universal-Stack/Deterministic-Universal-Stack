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
//# sourceMappingURL=index.d.ts.map