import { type DUS, type Event } from "@dus/core";
export interface ReplicaView {
    nodeId: string;
    frontier: Set<string>;
    events: Map<string, Event>;
    trust: Map<string, number>;
}
export interface GossipMetrics {
    divergenceBefore: number;
    divergenceAfter: number;
    eventsTransferred: number;
}
export declare function toReplicaView<TValue>(nodeId: string, runtime: DUS<TValue>): ReplicaView;
export declare function divergence(left: ReplicaView, right: ReplicaView): number;
export declare function gossipPair(left: ReplicaView, right: ReplicaView): GossipMetrics;
export declare function convergeReplicas(replicas: ReplicaView[], maxRounds?: number): GossipMetrics[];
export interface QuorumConfig {
    nodeCount: number;
    maxFaulty: number;
}
export interface Vote {
    validatorId: string;
    eventId: string;
    approved: boolean;
}
export declare class ByzantineQuorum {
    readonly config: QuorumConfig;
    readonly quorumSize: number;
    constructor(config: QuorumConfig);
    reachesConsensus(votes: Vote[]): boolean;
}
export declare function missingEvents(source: ReplicaView, target: ReplicaView): Event[];
//# sourceMappingURL=index.d.ts.map