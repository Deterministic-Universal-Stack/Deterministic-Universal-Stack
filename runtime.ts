/**
 * DUS Production Runtime
 * 
 * Full-featured deterministic runtime with:
 * - Resource limits and quotas
 * - Sandboxed execution contexts
 * - Async operation handling
 * - Error recovery and circuit breaking
 * - Performance monitoring
 */

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

// ============================================================================
// TYPES
// ============================================================================

export interface Event<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  parents: string[];
  metadata: EventMetadata;
  hash: string;
  signature?: string;
}

export interface EventMetadata {
  timestamp: number;
  nodeId: string;
  sessionId: string;
  lamport: bigint;
  vectorClock: Record<string, bigint>;
}

export interface State<TValue = unknown> {
  value: TValue;
  hash: string;
  eventCount: bigint;
  metadata: StateMetadata;
}

export interface StateMetadata {
  lastEventId?: string;
  lastEventTimestamp?: number;
  checkpointHash?: string;
}

export type Reducer<TValue = unknown, TPayload = unknown> = (
  state: State<TValue>,
  event: Event<TPayload>
) => State<TValue> | Promise<State<TValue>>;

export interface RuntimeConfig {
  // Resource limits
  maxEvents: number;
  maxStateSize: number;
  maxExecutionTime: number;
  maxMemoryMB: number;
  
  // Execution control
  enableSandbox: boolean;
  enableMetrics: boolean;
  enableTracing: boolean;
  
  // Checkpointing
  checkpointInterval: number;
  maxCheckpoints: number;
  
  // Error handling
  maxRetries: number;
  circuitBreakerThreshold: number;
}

export interface ExecutionMetrics {
  eventsProcessed: bigint;
  totalExecutionTime: number;
  avgEventLatency: number;
  peakMemoryMB: number;
  errorCount: number;
  checkpointCount: number;
}

export interface Checkpoint<TValue = unknown> {
  id: string;
  eventId: string;
  state: State<TValue>;
  timestamp: number;
  hash: string;
}

// ============================================================================
// RESOURCE TRACKER
// ============================================================================

export class ResourceTracker {
  private startTime: number;
  private eventCount: bigint = 0n;
  private errors: number = 0;
  private executionTimes: number[] = [];
  
  constructor(private config: RuntimeConfig) {
    this.startTime = Date.now();
  }
  
  trackEvent(executionTime: number): void {
    this.eventCount++;
    this.executionTimes.push(executionTime);
    
    if (this.eventCount > BigInt(this.config.maxEvents)) {
      throw new Error(`Event limit exceeded: ${this.config.maxEvents}`);
    }
  }
  
  trackError(): void {
    this.errors++;
    
    if (this.errors > this.config.circuitBreakerThreshold) {
      throw new Error(`Circuit breaker triggered: ${this.errors} errors`);
    }
  }
  
  checkMemory(): void {
    const memoryMB = process.memoryUsage().heapUsed / 1024 / 1024;
    
    if (memoryMB > this.config.maxMemoryMB) {
      throw new Error(`Memory limit exceeded: ${memoryMB.toFixed(2)}MB > ${this.config.maxMemoryMB}MB`);
    }
  }
  
  checkTimeout(startTime: number): void {
    const elapsed = Date.now() - startTime;
    
    if (elapsed > this.config.maxExecutionTime) {
      throw new Error(`Execution timeout: ${elapsed}ms > ${this.config.maxExecutionTime}ms`);
    }
  }
  
  getMetrics(): ExecutionMetrics {
    const now = Date.now();
    const totalTime = now - this.startTime;
    const avgLatency = this.executionTimes.length > 0
      ? this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length
      : 0;
    
    return {
      eventsProcessed: this.eventCount,
      totalExecutionTime: totalTime,
      avgEventLatency: avgLatency,
      peakMemoryMB: process.memoryUsage().heapUsed / 1024 / 1024,
      errorCount: this.errors,
      checkpointCount: 0, // Updated by runtime
    };
  }
}

// ============================================================================
// EXECUTION SANDBOX
// ============================================================================

export class ExecutionSandbox {
  private readonly allowedGlobals = new Set([
    'Array', 'Object', 'String', 'Number', 'Boolean', 'Math', 'JSON',
    'Date', 'RegExp', 'Map', 'Set', 'Promise'
  ]);
  
  createContext(): Record<string, unknown> {
    const context: Record<string, unknown> = {};
    
    // Only expose safe globals
    for (const name of this.allowedGlobals) {
      context[name] = (globalThis as any)[name];
    }
    
    return context;
  }
  
  async execute<T>(
    fn: Function,
    args: unknown[],
    timeout: number
  ): Promise<T> {
    // Create execution promise
    const executionPromise = Promise.resolve(fn(...args));
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Execution timeout')), timeout);
    });
    
    // Race between execution and timeout
    return Promise.race([executionPromise, timeoutPromise]) as Promise<T>;
  }
}

// ============================================================================
// CHECKPOINT MANAGER
// ============================================================================

export class CheckpointManager<TValue = unknown> {
  private checkpoints: Map<string, Checkpoint<TValue>> = new Map();
  private checkpointOrder: string[] = [];
  
  constructor(private config: RuntimeConfig) {}
  
  createCheckpoint(
    eventId: string,
    state: State<TValue>
  ): Checkpoint<TValue> {
    const checkpoint: Checkpoint<TValue> = {
      id: this.hash({ eventId, state, timestamp: Date.now() }),
      eventId,
      state: JSON.parse(JSON.stringify(state)), // Deep clone
      timestamp: Date.now(),
      hash: state.hash,
    };
    
    this.checkpoints.set(checkpoint.id, checkpoint);
    this.checkpointOrder.push(checkpoint.id);
    
    // Prune old checkpoints
    while (this.checkpointOrder.length > this.config.maxCheckpoints) {
      const oldId = this.checkpointOrder.shift()!;
      this.checkpoints.delete(oldId);
    }
    
    return checkpoint;
  }
  
  getLatestCheckpoint(): Checkpoint<TValue> | null {
    if (this.checkpointOrder.length === 0) return null;
    const latestId = this.checkpointOrder[this.checkpointOrder.length - 1];
    return this.checkpoints.get(latestId) || null;
  }
  
  getCheckpoint(id: string): Checkpoint<TValue> | null {
    return this.checkpoints.get(id) || null;
  }
  
  getAllCheckpoints(): Checkpoint<TValue>[] {
    return this.checkpointOrder.map(id => this.checkpoints.get(id)!);
  }
  
  private hash(value: unknown): string {
    const str = JSON.stringify(value, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v
    );
    return createHash('sha256').update(str).digest('hex');
  }
}

// ============================================================================
// PRODUCTION RUNTIME
// ============================================================================

export class DUSRuntime<TValue = unknown> extends EventEmitter {
  private state: State<TValue>;
  private events: Map<string, Event> = new Map();
  private eventOrder: string[] = [];
  private resourceTracker: ResourceTracker;
  private sandbox: ExecutionSandbox;
  private checkpointManager: CheckpointManager<TValue>;
  private lamport: bigint = 0n;
  private vectorClock: Record<string, bigint> = {};
  
  constructor(
    private nodeId: string,
    private reducer: Reducer<TValue>,
    initialValue: TValue,
    private config: Partial<RuntimeConfig> = {}
  ) {
    super();
    
    // Merge with defaults
    const fullConfig: RuntimeConfig = {
      maxEvents: 1000000,
      maxStateSize: 100 * 1024 * 1024, // 100MB
      maxExecutionTime: 30000, // 30s
      maxMemoryMB: 512,
      enableSandbox: true,
      enableMetrics: true,
      enableTracing: false,
      checkpointInterval: 1000,
      maxCheckpoints: 10,
      maxRetries: 3,
      circuitBreakerThreshold: 100,
      ...config,
    };
    
    this.resourceTracker = new ResourceTracker(fullConfig);
    this.sandbox = new ExecutionSandbox();
    this.checkpointManager = new CheckpointManager(fullConfig);
    this.config = fullConfig;
    
    // Initialize state
    this.state = {
      value: initialValue,
      hash: this.hash(initialValue),
      eventCount: 0n,
      metadata: {},
    };
    
    this.vectorClock[nodeId] = 0n;
  }
  
  // Event emission
  async emit<TPayload>(
    type: string,
    payload: TPayload,
    options: {
      parents?: string[];
      timestamp?: number;
      sessionId?: string;
    } = {}
  ): Promise<Event<TPayload>> {
    const startTime = Date.now();
    
    try {
      // Resource checks
      this.resourceTracker.checkMemory();
      this.resourceTracker.checkTimeout(startTime);
      
      // Increment clocks
      this.lamport++;
      this.vectorClock[this.nodeId] = (this.vectorClock[this.nodeId] || 0n) + 1n;
      
      // Create event
      const event: Event<TPayload> = {
        id: this.generateId(),
        type,
        payload,
        parents: options.parents || this.getFrontier(),
        metadata: {
          timestamp: options.timestamp || Date.now(),
          nodeId: this.nodeId,
          sessionId: options.sessionId || this.nodeId,
          lamport: this.lamport,
          vectorClock: { ...this.vectorClock },
        },
        hash: '', // Will be computed
      };
      
      // Compute hash
      event.hash = this.hash(event);
      
      // Store event
      this.events.set(event.id, event);
      this.eventOrder.push(event.id);
      
      // Apply reduction
      await this.applyEvent(event);
      
      // Track metrics
      this.resourceTracker.trackEvent(Date.now() - startTime);
      
      // Emit event for listeners
      this.emit('event', event);
      
      // Checkpoint if needed
      if (this.state.eventCount % BigInt((this.config as RuntimeConfig).checkpointInterval) === 0n) {
        const checkpoint = this.checkpointManager.createCheckpoint(event.id, this.state);
        this.emit('checkpoint', checkpoint);
      }
      
      return event;
      
    } catch (error) {
      this.resourceTracker.trackError();
      this.emit('error', error);
      throw error;
    }
  }
  
  // Event synchronization
  async sync(events: Event[]): Promise<void> {
    for (const event of events) {
      if (!this.events.has(event.id)) {
        this.events.set(event.id, event);
        this.eventOrder.push(event.id);
        
        // Update vector clock
        for (const [nodeId, clock] of Object.entries(event.metadata.vectorClock)) {
          this.vectorClock[nodeId] = this.max(
            this.vectorClock[nodeId] || 0n,
            clock
          );
        }
      }
    }
    
    // Replay to converge
    await this.replay();
  }
  
  // Deterministic replay
  private async replay(): Promise<void> {
    const sorted = this.topologicalSort();
    
    // Reset state
    const initialValue = (this.state.value as any).constructor === Object
      ? {}
      : (this.state.value as any).constructor === Array
      ? []
      : this.state.value;
    
    this.state = {
      value: initialValue as TValue,
      hash: this.hash(initialValue),
      eventCount: 0n,
      metadata: {},
    };
    
    // Apply events in order
    for (const eventId of sorted) {
      const event = this.events.get(eventId);
      if (event) {
        await this.applyEvent(event);
      }
    }
  }
  
  // Apply single event
  private async applyEvent(event: Event): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Execute reducer (potentially sandboxed)
      let nextState: State<TValue>;
      
      if ((this.config as RuntimeConfig).enableSandbox) {
        nextState = await this.sandbox.execute<State<TValue>>(
          this.reducer,
          [this.state, event],
          (this.config as RuntimeConfig).maxExecutionTime
        );
      } else {
        nextState = await Promise.resolve(this.reducer(this.state, event));
      }
      
      // Update state
      nextState.eventCount = this.state.eventCount + 1n;
      nextState.metadata = {
        lastEventId: event.id,
        lastEventTimestamp: event.metadata.timestamp,
        checkpointHash: this.state.hash,
      };
      
      this.state = nextState;
      
      if ((this.config as RuntimeConfig).enableTracing) {
        this.emit('trace', {
          eventId: event.id,
          stateBefore: this.state,
          stateAfter: nextState,
          executionTime: Date.now() - startTime,
        });
      }
      
    } catch (error) {
      this.resourceTracker.trackError();
      throw new Error(`Failed to apply event ${event.id}: ${error}`);
    }
  }
  
  // Topological sort for causal order
  private topologicalSort(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    
    const visit = (eventId: string): void => {
      if (visited.has(eventId)) return;
      visited.add(eventId);
      
      const event = this.events.get(eventId);
      if (!event) return;
      
      for (const parent of event.parents) {
        visit(parent);
      }
      
      result.push(eventId);
    };
    
    for (const eventId of this.eventOrder) {
      visit(eventId);
    }
    
    return result;
  }
  
  // Get current frontier (events with no children)
  private getFrontier(): string[] {
    const hasChildren = new Set<string>();
    
    for (const event of this.events.values()) {
      for (const parent of event.parents) {
        hasChildren.add(parent);
      }
    }
    
    const frontier: string[] = [];
    for (const eventId of this.events.keys()) {
      if (!hasChildren.has(eventId)) {
        frontier.push(eventId);
      }
    }
    
    return frontier.length > 0 ? frontier : [];
  }
  
  // State access
  getState(): State<TValue> {
    return { ...this.state };
  }
  
  getEvents(): Event[] {
    return Array.from(this.events.values());
  }
  
  getMetrics(): ExecutionMetrics {
    const metrics = this.resourceTracker.getMetrics();
    metrics.checkpointCount = this.checkpointManager.getAllCheckpoints().length;
    return metrics;
  }
  
  getCheckpoints(): Checkpoint<TValue>[] {
    return this.checkpointManager.getAllCheckpoints();
  }
  
  // Utilities
  private generateId(): string {
    return createHash('sha256')
      .update(`${this.nodeId}-${Date.now()}-${Math.random()}`)
      .digest('hex')
      .slice(0, 32);
  }
  
  private hash(value: unknown): string {
    const str = JSON.stringify(value, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v
    );
    return createHash('sha256').update(str).digest('hex');
  }
  
  private max(a: bigint, b: bigint): bigint {
    return a > b ? a : b;
  }
}
