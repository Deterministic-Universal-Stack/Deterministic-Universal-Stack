/**
 * Z Plane: Polyglot Language Interoperability Layer
 *
 * The Z plane enables deterministic computation across language boundaries.
 * It provides a unified event model, serialization substrate, and runtime
 * that allows TypeScript, Python, Go, Rust, and WASM workloads to participate
 * in the same deterministic causal replays.
 *
 * Core principle: Language choice is an implementation detail, not a barrier.
 * A polyglot engineer uses the right tool for each job while maintaining
 * deterministic guarantees across the entire system.
 */

/**
 * Language runtime identifier
 */
export enum RuntimeLanguage {
  TYPESCRIPT = "typescript",
  PYTHON = "python",
  GO = "go",
  RUST = "rust",
  WASM = "wasm",
  NATIVE = "native",
}

/**
 * Serialization format for cross-language communication
 */
export enum SerializationFormat {
  CBOR = "cbor", // binary, deterministic, compact
  JSON = "json", // human-readable, slower
  MSGPACK = "msgpack", // binary, fast
  PROTOBUF = "protobuf", // strongly-typed binary
}

/**
 * Z plane event - language-agnostic representation of computation
 */
export interface ZPlaneEvent {
  // Event identity
  id: string;
  timestamp: number;
  sourceLanguage: RuntimeLanguage;

  // Causality
  causationId?: string;
  parents: string[];

  // Computation specification
  operationName: string;
  operationLanguage: RuntimeLanguage;
  operationHash: string; // Determinism verification

  // Serialized input (language-agnostic format)
  input: {
    format: SerializationFormat;
    data: Uint8Array;
    schema?: string; // Optional type hint
  };

  // Runtime metadata
  executionTimeout?: number;
  resourceLimits?: ResourceLimits;
  retryPolicy?: RetryPolicy;
}

/**
 * Result of executing a Z plane operation
 */
export interface ZPlaneResult {
  eventId: string;
  success: boolean;
  outputFormat: SerializationFormat;
  output?: Uint8Array;
  state?: Uint8Array;
  error?: {
    code: string;
    message: string;
    language: RuntimeLanguage;
    stack?: string;
  };
  metrics: ExecutionMetrics;
}

/**
 * Resource constraints for cross-language execution
 */
export interface ResourceLimits {
  maxMemoryMB: number;
  maxCPUTime: number; // milliseconds
  maxStackDepth: number;
  maxFileDescriptors: number;
}

/**
 * Execution retry behavior
 */
export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

/**
 * Execution metrics for auditing and optimization
 */
export interface ExecutionMetrics {
  runtimeLanguage: RuntimeLanguage;
  executionTimeMs: number;
  cpuTimeMs: number;
  memoryPeakMB: number;
  allocations: number;
  syscalls: number;
  determinismScore: number; // 0-1: consistency across reruns
}

/**
 * Z plane adapter interface - implemented by each runtime
 */
export interface ZPlaneAdapter {
  language: RuntimeLanguage;
  version: string;

  // Operation registration and lookup
  registerOperation(
    name: string,
    handler: ZPlaneHandler,
    metadata: OperationMetadata
  ): Promise<void>;
  getOperation(name: string): Promise<OperationMetadata | null>;
  listOperations(): Promise<OperationMetadata[]>;

  // Execution
  execute(event: ZPlaneEvent): Promise<ZPlaneResult>;
  executeWithCheckpoint(
    event: ZPlaneEvent,
    checkpoint: Uint8Array
  ): Promise<ZPlaneResult>;

  // Determinism verification
  verifyDeterminism(
    operationHash: string,
    executionCount: number
  ): Promise<DeterminismReport>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<HealthStatus>;
}

/**
 * Handler function type for Z plane operations
 */
export type ZPlaneHandler = (
  input: Uint8Array,
  format: SerializationFormat,
  context: ExecutionContext
) => Promise<Uint8Array>;

/**
 * Execution context passed to handlers
 */
export interface ExecutionContext {
  eventId: string;
  sourceLanguage: RuntimeLanguage;
  targetLanguage: RuntimeLanguage;
  causationChain: string[];
  resources: ResourceLimits;
  checkpoint?: Uint8Array;
}

/**
 * Operation metadata for registration and discovery
 */
export interface OperationMetadata {
  name: string;
  language: RuntimeLanguage;
  hash: string;
  inputSchema?: string;
  outputSchema?: string;
  deterministic: boolean;
  pure: boolean; // No side effects
  version: string;
  registeredAt: number;
}

/**
 * Determinism verification report
 */
export interface DeterminismReport {
  operationHash: string;
  executionCount: number;
  consistentOutputs: number;
  inconsistencies: Array<{
    executionIndex: number;
    outputHash: string;
    expectedHash: string;
  }>;
  deterministicScore: number; // 0-1
  passed: boolean;
}

/**
 * Health status of a runtime adapter
 */
export interface HealthStatus {
  healthy: boolean;
  language: RuntimeLanguage;
  uptime: number;
  lastError?: {
    code: string;
    message: string;
    timestamp: number;
  };
  metrics: {
    totalOperations: number;
    failedOperations: number;
    averageExecutionTimeMs: number;
  };
}

/**
 * Z plane runtime coordinator
 */
export interface ZPlaneCoordinator {
  // Adapter management
  registerAdapter(adapter: ZPlaneAdapter): Promise<void>;
  getAdapter(language: RuntimeLanguage): Promise<ZPlaneAdapter | null>;
  listAdapters(): Promise<ZPlaneAdapter[]>;

  // Multi-language execution
  executeMultiLanguage(plan: ExecutionPlan): Promise<ExecutionPlanResult>;

  // Determinism guarantees
  verifyConsistency(eventSet: ZPlaneEvent[]): Promise<ConsistencyReport>;

  // Serialization
  serialize(
    value: unknown,
    format: SerializationFormat
  ): Promise<Uint8Array>;
  deserialize<T>(
    data: Uint8Array,
    format: SerializationFormat
  ): Promise<T>;
}

/**
 * Plan for coordinated multi-language execution
 */
export interface ExecutionPlan {
  id: string;
  steps: ExecutionStep[];
  parallelizableSteps?: number[][];
  timeout: number;
}

/**
 * Single step in an execution plan
 */
export interface ExecutionStep {
  id: string;
  operationName: string;
  language: RuntimeLanguage;
  input: Uint8Array;
  inputFormat: SerializationFormat;
  outputFormat: SerializationFormat;
  dependencies: string[]; // Step IDs
  retryPolicy?: RetryPolicy;
}

/**
 * Result of executing a plan
 */
export interface ExecutionPlanResult {
  planId: string;
  success: boolean;
  stepResults: Map<string, ZPlaneResult>;
  totalTimeMs: number;
  errors: Array<{
    stepId: string;
    error: string;
  }>;
}

/**
 * Consistency verification report
 */
export interface ConsistencyReport {
  eventSetHash: string;
  adapterCount: number;
  stateHashes: Map<RuntimeLanguage, string>;
  consistent: boolean;
  discrepancies: Array<{
    language1: RuntimeLanguage;
    language2: RuntimeLanguage;
    divergencePoint: number;
  }>;
}

/**
 * Z plane configuration
 */
export interface ZPlaneConfig {
  defaultSerializationFormat: SerializationFormat;
  defaultResourceLimits: ResourceLimits;
  defaultRetryPolicy: RetryPolicy;
  determinismCheckInterval: number; // milliseconds
  enableMetrics: boolean;
  enableProfiling: boolean;
  maxConcurrentExecutions: number;
  operationTimeout: number;
}

/**
 * Default configuration
 */
export const DEFAULT_ZPLANE_CONFIG: ZPlaneConfig = {
  defaultSerializationFormat: SerializationFormat.CBOR,
  defaultResourceLimits: {
    maxMemoryMB: 512,
    maxCPUTime: 30000,
    maxStackDepth: 10000,
    maxFileDescriptors: 100,
  },
  defaultRetryPolicy: {
    maxAttempts: 3,
    backoffMs: 100,
    backoffMultiplier: 2,
  },
  determinismCheckInterval: 5000,
  enableMetrics: true,
  enableProfiling: false,
  maxConcurrentExecutions: 16,
  operationTimeout: 30000,
};
