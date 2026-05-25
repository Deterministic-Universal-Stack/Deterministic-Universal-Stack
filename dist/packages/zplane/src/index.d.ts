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
export declare enum RuntimeLanguage {
    TYPESCRIPT = "typescript",
    PYTHON = "python",
    GO = "go",
    RUST = "rust",
    WASM = "wasm",
    NATIVE = "native"
}
/**
 * Serialization format for cross-language communication
 */
export declare enum SerializationFormat {
    CBOR = "cbor",// binary, deterministic, compact
    JSON = "json",// human-readable, slower
    MSGPACK = "msgpack",// binary, fast
    PROTOBUF = "protobuf"
}
/**
 * Z plane event - language-agnostic representation of computation
 */
export interface ZPlaneEvent {
    id: string;
    timestamp: number;
    sourceLanguage: RuntimeLanguage;
    causationId?: string;
    parents: string[];
    operationName: string;
    operationLanguage: RuntimeLanguage;
    operationHash: string;
    input: {
        format: SerializationFormat;
        data: Uint8Array;
        schema?: string;
    };
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
    maxCPUTime: number;
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
    determinismScore: number;
}
/**
 * Z plane adapter interface - implemented by each runtime
 */
export interface ZPlaneAdapter {
    language: RuntimeLanguage;
    version: string;
    registerOperation(name: string, handler: ZPlaneHandler, metadata: OperationMetadata): Promise<void>;
    getOperation(name: string): Promise<OperationMetadata | null>;
    listOperations(): Promise<OperationMetadata[]>;
    execute(event: ZPlaneEvent): Promise<ZPlaneResult>;
    executeWithCheckpoint(event: ZPlaneEvent, checkpoint: Uint8Array): Promise<ZPlaneResult>;
    verifyDeterminism(operationHash: string, executionCount: number): Promise<DeterminismReport>;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    health(): Promise<HealthStatus>;
}
/**
 * Handler function type for Z plane operations
 */
export type ZPlaneHandler = (input: Uint8Array, format: SerializationFormat, context: ExecutionContext) => Promise<Uint8Array>;
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
    pure: boolean;
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
    deterministicScore: number;
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
    registerAdapter(adapter: ZPlaneAdapter): Promise<void>;
    getAdapter(language: RuntimeLanguage): Promise<ZPlaneAdapter | null>;
    listAdapters(): Promise<ZPlaneAdapter[]>;
    executeMultiLanguage(plan: ExecutionPlan): Promise<ExecutionPlanResult>;
    verifyConsistency(eventSet: ZPlaneEvent[]): Promise<ConsistencyReport>;
    serialize(value: unknown, format: SerializationFormat): Promise<Uint8Array>;
    deserialize<T>(data: Uint8Array, format: SerializationFormat): Promise<T>;
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
    dependencies: string[];
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
    determinismCheckInterval: number;
    enableMetrics: boolean;
    enableProfiling: boolean;
    maxConcurrentExecutions: number;
    operationTimeout: number;
}
/**
 * Default configuration
 */
export declare const DEFAULT_ZPLANE_CONFIG: ZPlaneConfig;
//# sourceMappingURL=index.d.ts.map