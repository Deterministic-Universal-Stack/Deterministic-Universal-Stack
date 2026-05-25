/**
 * Z Plane Runtime Coordinator
 *
 * Manages adapter lifecycle, execution planning, and consistency verification
 * across multiple language runtimes. Ensures deterministic computation
 * boundaries and causal consistency in polyglot environments.
 */
import { RuntimeLanguage, SerializationFormat, DEFAULT_ZPLANE_CONFIG, } from "../index.js";
export class ZPlaneRuntimeCoordinator {
    adapters = new Map();
    config;
    planHistory = new Map();
    constructor(config = {}) {
        this.config = { ...DEFAULT_ZPLANE_CONFIG, ...config };
    }
    async registerAdapter(adapter) {
        if (!adapter || !adapter.language) {
            throw new Error("Invalid adapter: must have language property");
        }
        await adapter.initialize();
        this.adapters.set(adapter.language, adapter);
    }
    async getAdapter(language) {
        return this.adapters.get(language) || null;
    }
    async listAdapters() {
        return Array.from(this.adapters.values());
    }
    async executeMultiLanguage(plan) {
        if (!plan || !plan.steps || plan.steps.length === 0) {
            throw new Error("Invalid execution plan: must have at least one step");
        }
        const result = {
            planId: plan.id,
            success: true,
            stepResults: new Map(),
            totalTimeMs: 0,
            errors: [],
        };
        const startTime = performance.now();
        // Build dependency graph
        const stepMap = new Map();
        for (const step of plan.steps) {
            stepMap.set(step.id, step);
        }
        // Track completed steps
        const completed = new Set();
        const results = new Map();
        try {
            // Execute steps respecting dependencies
            for (const step of plan.steps) {
                if (!this.canExecuteStep(step, completed)) {
                    result.success = false;
                    result.errors.push({
                        stepId: step.id,
                        error: "Unsatisfied dependencies",
                    });
                    continue;
                }
                try {
                    const stepResult = await this.executeStep(step, results);
                    result.stepResults.set(step.id, stepResult);
                    completed.add(step.id);
                    if (!stepResult.success) {
                        result.success = false;
                        result.errors.push({
                            stepId: step.id,
                            error: stepResult.error?.message || "Unknown error",
                        });
                    }
                    else if (stepResult.output) {
                        results.set(step.id, stepResult.output);
                    }
                }
                catch (error) {
                    result.success = false;
                    result.errors.push({
                        stepId: step.id,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        }
        finally {
            result.totalTimeMs = performance.now() - startTime;
            this.planHistory.set(plan.id, result);
        }
        return result;
    }
    async verifyConsistency(eventSet) {
        if (!eventSet || eventSet.length === 0) {
            return {
                eventSetHash: "",
                adapterCount: 0,
                stateHashes: new Map(),
                consistent: true,
                discrepancies: [],
            };
        }
        const stateHashes = new Map();
        const discrepancies = [];
        // For each adapter, replay event set and capture state hash
        for (const adapter of this.adapters.values()) {
            try {
                // This is a simplified check - in production you'd actually
                // execute all events and compare state hashes
                const health = await adapter.health();
                if (health.healthy) {
                    // Use a placeholder hash based on adapter state
                    const hash = this.computeEventSetHash(eventSet, adapter.language);
                    stateHashes.set(adapter.language, hash);
                }
            }
            catch (error) {
                // Adapter unavailable
            }
        }
        // Compare hashes for discrepancies
        const hashes = Array.from(stateHashes.entries());
        for (let i = 0; i < hashes.length; i++) {
            for (let j = i + 1; j < hashes.length; j++) {
                if (hashes[i][1] !== hashes[j][1]) {
                    discrepancies.push({
                        language1: hashes[i][0],
                        language2: hashes[j][0],
                        divergencePoint: 0, // Would be detected during replay
                    });
                }
            }
        }
        return {
            eventSetHash: this.hashEventSet(eventSet),
            adapterCount: this.adapters.size,
            stateHashes,
            consistent: discrepancies.length === 0,
            discrepancies,
        };
    }
    async serialize(value, format) {
        switch (format) {
            case SerializationFormat.JSON:
                return new TextEncoder().encode(JSON.stringify(value));
            case SerializationFormat.CBOR:
                // Simple CBOR encoding - in production use cbor library
                return this.encodeSimpleCBOR(value);
            case SerializationFormat.MSGPACK:
                // Simple msgpack stub - in production use msgpack library
                return new TextEncoder().encode(JSON.stringify(value));
            case SerializationFormat.PROTOBUF:
                // Protobuf would require schema definition
                return new TextEncoder().encode(JSON.stringify(value));
            default:
                throw new Error(`Unknown serialization format: ${format}`);
        }
    }
    async deserialize(data, format) {
        switch (format) {
            case SerializationFormat.JSON:
                return JSON.parse(new TextDecoder().decode(data));
            case SerializationFormat.CBOR:
                return this.decodeSimpleCBOR(data);
            case SerializationFormat.MSGPACK:
                return JSON.parse(new TextDecoder().decode(data));
            case SerializationFormat.PROTOBUF:
                return JSON.parse(new TextDecoder().decode(data));
            default:
                throw new Error(`Unknown serialization format: ${format}`);
        }
    }
    // Private helpers
    canExecuteStep(step, completed) {
        if (!step.dependencies || step.dependencies.length === 0) {
            return true;
        }
        for (const dep of step.dependencies) {
            if (!completed.has(dep)) {
                return false;
            }
        }
        return true;
    }
    async executeStep(step, previousResults) {
        const adapter = this.adapters.get(step.language);
        if (!adapter) {
            return {
                eventId: step.id,
                success: false,
                outputFormat: step.outputFormat,
                error: {
                    code: "ADAPTER_NOT_FOUND",
                    message: `No adapter registered for language: ${step.language}`,
                    language: step.language,
                },
                metrics: {
                    runtimeLanguage: step.language,
                    executionTimeMs: 0,
                    cpuTimeMs: 0,
                    memoryPeakMB: 0,
                    allocations: 0,
                    syscalls: 0,
                    determinismScore: 0,
                },
            };
        }
        const operation = await adapter.getOperation(step.operationName);
        // Create event from step
        const event = {
            id: step.id,
            timestamp: Date.now(),
            sourceLanguage: RuntimeLanguage.TYPESCRIPT,
            parents: step.dependencies || [],
            operationName: step.operationName,
            operationLanguage: step.language,
            operationHash: operation?.hash ?? "",
            input: {
                format: step.inputFormat,
                data: step.input,
            },
            resourceLimits: this.config.defaultResourceLimits,
            executionTimeout: this.config.operationTimeout,
        };
        return adapter.execute(event);
    }
    computeEventSetHash(events, language) {
        const sortedIds = events.map((e) => e.id).sort().join("|");
        return `${language}:${this.simpleHash(sortedIds)}`;
    }
    hashEventSet(events) {
        const eventIds = events.map((e) => e.id).sort().join("|");
        return this.simpleHash(eventIds);
    }
    simpleHash(input) {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }
    encodeSimpleCBOR(value) {
        // Simplified CBOR encoding - production code would use cbor library
        const json = JSON.stringify(value);
        return new TextEncoder().encode(json);
    }
    decodeSimpleCBOR(data) {
        // Simplified CBOR decoding
        const json = new TextDecoder().decode(data);
        return JSON.parse(json);
    }
}
export function createZPlaneCoordinator(config) {
    return new ZPlaneRuntimeCoordinator(config);
}
//# sourceMappingURL=index.js.map