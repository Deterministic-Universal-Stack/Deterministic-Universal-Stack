import { type DUS, type Event, compareEventIds } from "@dus/core";
import { jaccardDistance } from "@dus/math";

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

export function toReplicaView<TValue>(nodeId: string, runtime: DUS<TValue>): ReplicaView {
  return {
    nodeId,
    frontier: new Set(runtime.getFrontier()),
    events: new Map(runtime.getEvents().map((event) => [event.id, event])),
    trust: new Map()
  };
}

export function divergence(left: ReplicaView, right: ReplicaView): number {
  return jaccardDistance(left.frontier, right.frontier);
}

export function gossipPair(left: ReplicaView, right: ReplicaView): GossipMetrics {
  const before = divergence(left, right);
  let transferred = 0;

  for (const [id, event] of right.events) {
    if (!left.events.has(id)) {
      left.events.set(id, event);
      left.frontier.add(id);
      for (const parent of event.parents) {
        left.frontier.delete(parent);
      }
      transferred += 1;
    }
  }

  for (const [id, event] of left.events) {
    if (!right.events.has(id)) {
      right.events.set(id, event);
      right.frontier.add(id);
      for (const parent of event.parents) {
        right.frontier.delete(parent);
      }
      transferred += 1;
    }
  }

  const after = divergence(left, right);
  return {
    divergenceBefore: before,
    divergenceAfter: after,
    eventsTransferred: transferred
  };
}

export function convergeReplicas(replicas: ReplicaView[], maxRounds = 10): GossipMetrics[] {
  const metrics: GossipMetrics[] = [];
  for (let round = 0; round < maxRounds; round += 1) {
    let changed = false;
    for (let i = 0; i < replicas.length; i += 1) {
      for (let j = i + 1; j < replicas.length; j += 1) {
        const result = gossipPair(replicas[i], replicas[j]);
        metrics.push(result);
        if (result.eventsTransferred > 0) {
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }
  return metrics;
}

export interface QuorumConfig {
  nodeCount: number;
  maxFaulty: number;
}

export interface Vote {
  validatorId: string;
  eventId: string;
  approved: boolean;
}

export class ByzantineQuorum {
  readonly quorumSize: number;

  constructor(readonly config: QuorumConfig) {
    if (config.nodeCount < 3 * config.maxFaulty + 1) {
      throw new Error("Invalid BFT configuration: require n >= 3f + 1.");
    }
    this.quorumSize = Math.floor((2 * config.nodeCount) / 3) + 1;
  }

  reachesConsensus(votes: Vote[]): boolean {
    const approvals = votes.filter((vote) => vote.approved).length;
    return approvals >= this.quorumSize;
  }
}

export function missingEvents(source: ReplicaView, target: ReplicaView): Event[] {
  return [...source.events.values()]
    .filter((event) => !target.events.has(event.id))
    .sort((a, b) => {
      const parentCompare = a.parents.join(",").localeCompare(b.parents.join(","));
      if (parentCompare !== 0) {
        return parentCompare;
      }
      return compareEventIds(a.id, b.id);
    });
}
