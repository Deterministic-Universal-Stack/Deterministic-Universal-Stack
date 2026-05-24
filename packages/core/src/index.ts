import { createHash, createHmac } from "node:crypto";

export interface EventMetadata {
  timestamp: number;
  nodeId: string;
  sessionId: string;
  lamport: bigint;
  vectorClock: Record<string, bigint>;
}

export interface Event<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  parents: string[];
  metadata: EventMetadata;
  hash: string;
  signature?: string;
}

export interface State<TValue = Record<string, unknown>> {
  value: TValue;
  hash: string;
  eventCount: bigint;
}

export interface DUSOptions<TValue = Record<string, unknown>> {
  reducerVersion: string;
  initialValue?: TValue;
  signingKey?: string;
}

export interface EmitOptions {
  parents?: string[];
  timestamp?: number;
  sessionId?: string;
}

export interface Snapshot<TValue = Record<string, unknown>> {
  reducerVersion: string;
  state: State<TValue>;
  frontier: string[];
  eventCount: number;
  eventIds: string[];
  hash: string;
}

export interface VerificationResult {
  isValid: boolean;
  errors: string[];
}

export interface ReducerValidationResult extends VerificationResult {
  replayHash?: string;
}

export type Reducer<TValue = Record<string, unknown>, TPayload = unknown> = (
  state: State<TValue>,
  event: Event<TPayload>
) => State<TValue>;

export function canonicalStringify(value: unknown): string {
  if (typeof value === "bigint") {
    return JSON.stringify({ __bigint__: value.toString() });
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

export function stringifyWithBigInt(value: unknown, spacing = 2): string {
  return JSON.stringify(
    value,
    (_key, current) => typeof current === "bigint" ? { __bigint__: current.toString() } : current,
    spacing
  );
}

export function signEvent(eventHash: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(eventHash).digest("hex");
}

export function verifyEventSignature(event: Event, signingKey: string): boolean {
  if (!event.signature) {
    return false;
  }
  return signEvent(event.hash, signingKey) === event.signature;
}

export function createState<TValue>(value: TValue, eventCount = 0n): State<TValue> {
  return {
    value,
    hash: canonicalHash(value),
    eventCount
  };
}

export function compareEventIds(a: string, b: string): number {
  return a.localeCompare(b);
}

function compareEvents(a: Event, b: Event): number {
  const byTimestamp = a.metadata.timestamp - b.metadata.timestamp;
  if (byTimestamp !== 0) {
    return byTimestamp;
  }

  const byLamport = a.metadata.lamport < b.metadata.lamport ? -1 : a.metadata.lamport > b.metadata.lamport ? 1 : 0;
  if (byLamport !== 0) {
    return byLamport;
  }

  return compareEventIds(a.id, b.id);
}

export function canonicalEventOrder(events: Iterable<Event>): Event[] {
  return [...events].sort((a, b) => {
    const byTimestamp = a.metadata.timestamp - b.metadata.timestamp;
    if (byTimestamp !== 0) {
      return byTimestamp;
    }

    const byLamport = a.metadata.lamport < b.metadata.lamport ? -1 : a.metadata.lamport > b.metadata.lamport ? 1 : 0;
    if (byLamport !== 0) {
      return byLamport;
    }

    return compareEventIds(a.id, b.id);
  });
}

export function hasCycles(events: Iterable<Event>): boolean {
  const eventMap = new Map<string, Event>();
  for (const event of events) {
    eventMap.set(event.id, event);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (id: string): boolean => {
    if (visited.has(id)) {
      return false;
    }
    if (visiting.has(id)) {
      return true;
    }

    visiting.add(id);
    const event = eventMap.get(id);
    if (event) {
      for (const parent of event.parents) {
        if (eventMap.has(parent) && dfs(parent)) {
          return true;
        }
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of eventMap.keys()) {
    if (dfs(id)) {
      return true;
    }
  }
  return false;
}

export function topologicalSort(events: Iterable<Event>): Event[] {
  const eventMap = new Map<string, Event>();
  const inDegree = new Map<string, number>();
  const children = new Map<string, Set<string>>();

  for (const event of events) {
    eventMap.set(event.id, event);
    inDegree.set(event.id, inDegree.get(event.id) ?? 0);
    children.set(event.id, children.get(event.id) ?? new Set());
  }

  for (const event of eventMap.values()) {
    for (const parent of [...event.parents].sort(compareEventIds)) {
      if (!eventMap.has(parent)) {
        continue;
      }
      children.get(parent)!.add(event.id);
      inDegree.set(event.id, (inDegree.get(event.id) ?? 0) + 1);
    }
  }

  const queue = canonicalEventOrder(
    [...eventMap.values()].filter((event) => (inDegree.get(event.id) ?? 0) === 0)
  );
  const sorted: Event[] = [];

  while (queue.length > 0) {
    const event = queue.shift()!;
    sorted.push(event);
    const neighbors = [...(children.get(event.id) ?? new Set())]
      .map((id) => eventMap.get(id)!)
      .sort(compareEvents);

    for (const neighbor of neighbors) {
      const next = (inDegree.get(neighbor.id) ?? 1) - 1;
      inDegree.set(neighbor.id, next);
      if (next === 0) {
        queue.push(neighbor);
        queue.sort(compareEvents);
      }
    }
  }

  if (sorted.length !== eventMap.size) {
    throw new Error("Cycle detected while sorting events.");
  }

  return sorted;
}

export function mergeEventSets(left: Iterable<Event>, right: Iterable<Event>): Map<string, Event> {
  const merged = new Map<string, Event>();
  for (const event of left) {
    merged.set(event.id, event);
  }
  for (const event of right) {
    merged.set(event.id, event);
  }
  return merged;
}

function computeFrontier(events: Iterable<Event>): Set<string> {
  const frontier = new Set<string>();
  const referenced = new Set<string>();

  for (const event of events) {
    frontier.add(event.id);
    for (const parent of event.parents) {
      referenced.add(parent);
    }
  }

  for (const parent of referenced) {
    frontier.delete(parent);
  }
  return frontier;
}

function nextLamport(events: Iterable<Event>): bigint {
  let max = 0n;
  for (const event of events) {
    if (event.metadata.lamport > max) {
      max = event.metadata.lamport;
    }
  }
  return max + 1n;
}

export class DUS<TValue = Record<string, unknown>> {
  private readonly reducer: Reducer<TValue>;
  private readonly reducerVersion: string;
  private readonly signingKey?: string;
  private readonly nodeId: string;
  private readonly initialValue: TValue;
  private readonly events = new Map<string, Event>();
  private frontier = new Set<string>();
  private state: State<TValue>;

  constructor(nodeId: string, reducer: Reducer<TValue>, options: DUSOptions<TValue>) {
    this.nodeId = nodeId;
    this.reducer = reducer;
    this.reducerVersion = options.reducerVersion;
    this.signingKey = options.signingKey;
    this.initialValue = (options.initialValue ?? {} as TValue);
    this.state = createState(this.initialValue);
  }

  emit<TPayload>(type: string, payload: TPayload, options: EmitOptions = {}): Event<TPayload> {
    const parents = [...(options.parents ?? [...this.frontier])].sort(compareEventIds);
    const lamport = nextLamport(this.events.values());
    const timestamp = options.timestamp ?? Date.now();
    const sessionId = options.sessionId ?? "default";
    const vectorClock: Record<string, bigint> = { [this.nodeId]: lamport };
    const metadata: EventMetadata = {
      timestamp,
      nodeId: this.nodeId,
      sessionId,
      lamport,
      vectorClock
    };

    const hash = canonicalHash({ type, payload, parents, metadata });
    const event: Event<TPayload> = {
      id: hash,
      type,
      payload,
      parents,
      metadata,
      hash,
      signature: this.signingKey ? signEvent(hash, this.signingKey) : undefined
    };

    this.accept(event);
    return event;
  }

  accept(event: Event): void {
    if (this.events.has(event.id)) {
      return;
    }
    this.events.set(event.id, event);
    this.frontier.add(event.id);
    for (const parent of event.parents) {
      this.frontier.delete(parent);
    }
    this.state = this.replay();
  }

  sync(peer: DUS<TValue> | Event[] | Iterable<Event>): State<TValue> {
    const events = peer instanceof DUS ? peer.getEvents() : Array.isArray(peer) ? peer : [...peer];
    for (const event of events) {
      this.accept(event);
    }
    return this.state;
  }

  replay(events: Event[] = this.getEvents(), initial: State<TValue> = createState(this.initialValue)): State<TValue> {
    const sorted = topologicalSort(events);
    let state = initial;
    for (const event of sorted) {
      state = this.reducer(state, event);
      const expectedHash = canonicalHash(state.value);
      if (state.hash !== expectedHash) {
        throw new Error(`Reducer violated determinism at event ${event.id}`);
      }
    }
    return {
      value: state.value,
      hash: canonicalHash(state.value),
      eventCount: BigInt(sorted.length) + initial.eventCount
    };
  }

  snapshot(): Snapshot<TValue> {
    const eventIds = this.getEvents().map((event) => event.id);
    const frontier = [...this.frontier].sort(compareEventIds);
    return {
      reducerVersion: this.reducerVersion,
      state: this.state,
      frontier,
      eventCount: eventIds.length,
      eventIds,
      hash: canonicalHash({
        reducerVersion: this.reducerVersion,
        stateHash: this.state.hash,
        frontier,
        eventIds
      })
    };
  }

  replayFromSnapshot(snapshot: Snapshot<TValue>, tailEvents: Event[]): State<TValue> {
    if (snapshot.reducerVersion !== this.reducerVersion) {
      throw new Error("Reducer version mismatch.");
    }
    return this.replay(tailEvents, snapshot.state);
  }

  verify(): VerificationResult {
    const errors: string[] = [];
    if (hasCycles(this.events.values())) {
      errors.push("Event graph contains a cycle.");
    }

    for (const event of this.events.values()) {
      const expectedHash = canonicalHash({
        type: event.type,
        payload: event.payload,
        parents: event.parents,
        metadata: event.metadata
      });
      if (event.hash !== expectedHash || event.id !== expectedHash) {
        errors.push(`Event hash mismatch for ${event.id}.`);
      }
      for (const parent of event.parents) {
        if (!this.events.has(parent)) {
          errors.push(`Missing parent ${parent} referenced by ${event.id}.`);
        }
      }
      if (this.signingKey && !verifyEventSignature(event, this.signingKey)) {
        errors.push(`Invalid signature for ${event.id}.`);
      }
    }

    try {
      const replayed = this.replay();
      if (replayed.hash !== this.state.hash) {
        errors.push("Live state differs from replayed state.");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { isValid: errors.length === 0, errors };
  }

  getEvents(): Event[] {
    return canonicalEventOrder(this.events.values());
  }

  getState(): State<TValue> {
    return this.state;
  }

  getFrontier(): string[] {
    return [...this.frontier].sort(compareEventIds);
  }

  merge(other: DUS<TValue>): DUS<TValue> {
    const merged = new DUS<TValue>(this.nodeId, this.reducer, {
      reducerVersion: this.reducerVersion,
      initialValue: this.initialValue,
      signingKey: this.signingKey
    });
    for (const event of mergeEventSets(this.getEvents(), other.getEvents()).values()) {
      merged.accept(event);
    }
    return merged;
  }

  recomputeFrontier(): void {
    this.frontier = computeFrontier(this.events.values());
  }
}

export function validateReducer<TValue>(
  nodeId: string,
  reducer: Reducer<TValue>,
  events: Event[],
  options: DUSOptions<TValue>
): ReducerValidationResult {
  const first = new DUS<TValue>(nodeId, reducer, options);
  const second = new DUS<TValue>(`${nodeId}-peer`, reducer, options);
  const errors: string[] = [];

  try {
    first.sync(events);
    second.sync([...events].reverse());
    if (first.getState().hash !== second.getState().hash) {
      errors.push("Reducer is order-sensitive over the same causal history.");
    }
    const replay = first.replay();
    if (replay.hash !== first.getState().hash) {
      errors.push("Replay hash differs from live state hash.");
    }
    const verification = first.verify();
    errors.push(...verification.errors);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    isValid: errors.length === 0,
    errors,
    replayHash: first.getState().hash
  };
}

export const SYSTEM_LAWS = [
  "State is derived only from immutable events.",
  "Any two replicas that possess the same closed event set and reducer version converge to the same state hash.",
  "No valid replay may depend on hidden mutable state.",
  "Duplicate delivery is safe because event IDs are content-addressed.",
  "Causal parents must be replayed before their children."
] as const;
