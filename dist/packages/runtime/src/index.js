import { DUS, canonicalHash } from "@dus/core";
export const agentReducer = (state, event) => {
    const step = event.payload;
    const runKey = `run:${step.runId}:${step.branchId}`;
    const agentKey = `agent:${step.agentId}`;
    const existingRun = Array.isArray(state.value[runKey]) ? state.value[runKey] : [];
    const existingAgent = Array.isArray(state.value[agentKey]) ? state.value[agentKey] : [];
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
    nodeId;
    runId;
    branchId;
    dus;
    constructor(nodeId, runId, branchId = "main", seedEvents = []) {
        this.nodeId = nodeId;
        this.runId = runId;
        this.branchId = branchId;
        this.dus = new DUS(nodeId, agentReducer, {
            reducerVersion: "dus-agent-runtime@1",
            initialValue: {}
        });
        this.dus.sync(seedEvents);
    }
    record(step, timestamp = Date.now()) {
        return this.dus.emit("agent_step", {
            ...step,
            runId: this.runId,
            branchId: this.branchId
        }, { timestamp, sessionId: this.runId });
    }
    branch(branchId) {
        return new DeterministicAgentRuntime(this.nodeId, this.runId, branchId, this.dus.getEvents());
    }
    timeline() {
        return {
            runId: this.runId,
            branchId: this.branchId,
            events: this.dus.getEvents(),
            state: this.dus.getState()
        };
    }
    replay(events = this.dus.getEvents()) {
        return this.dus.replay(events);
    }
    sync(peer) {
        this.dus.sync(peer.timeline().events);
        return this.timeline();
    }
}
//# sourceMappingURL=index.js.map