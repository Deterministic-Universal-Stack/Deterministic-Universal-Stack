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
export var RuntimeLanguage;
(function (RuntimeLanguage) {
    RuntimeLanguage["TYPESCRIPT"] = "typescript";
    RuntimeLanguage["PYTHON"] = "python";
    RuntimeLanguage["GO"] = "go";
    RuntimeLanguage["RUST"] = "rust";
    RuntimeLanguage["WASM"] = "wasm";
    RuntimeLanguage["NATIVE"] = "native";
})(RuntimeLanguage || (RuntimeLanguage = {}));
/**
 * Serialization format for cross-language communication
 */
export var SerializationFormat;
(function (SerializationFormat) {
    SerializationFormat["CBOR"] = "cbor";
    SerializationFormat["JSON"] = "json";
    SerializationFormat["MSGPACK"] = "msgpack";
    SerializationFormat["PROTOBUF"] = "protobuf";
})(SerializationFormat || (SerializationFormat = {}));
/**
 * Default configuration
 */
export const DEFAULT_ZPLANE_CONFIG = {
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
//# sourceMappingURL=index.js.map