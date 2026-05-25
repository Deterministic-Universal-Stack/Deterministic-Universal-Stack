import { RuntimeLanguage, SerializationFormat, } from "../index.js";
/**
 * TypeScript/JavaScript runtime adapter for Z plane
 * Enables native TS/JS functions to participate in deterministic DUS computation
 */
export class TypeScriptAdapter {
    language = RuntimeLanguage.TYPESCRIPT;
    version = "0.2.0";
    operations = new Map();
    executionMetrics = new Map();
    lastHealth = null;
    startTime = Date.now();
    totalOperations = 0;
    failedOperations = 0;
    async registerOperation(name, handler, metadata) {
        if (!name || typeof name !== "string" || name.length === 0) {
            throw new Error("Operation name must be a non-empty string");
        }
        if (!handler || typeof handler !== "function") {
            throw new Error("Handler must be a function");
        }
        this.operations.set(name, {
            ...metadata,
            handler,
            name,
            language: RuntimeLanguage.TYPESCRIPT,
            version: "0.2.0",
            registeredAt: Date.now(),
        });
        this.executionMetrics.set(name, []);
    }
    async getOperation(name) {
        const op = this.operations.get(name);
        if (!op)
            return null;
        const { handler, ...metadata } = op;
        return metadata;
    }
    async listOperations() {
        const ops = [];
        for (const [, op] of this.operations) {
            const { handler, ...metadata } = op;
            ops.push(metadata);
        }
        return ops;
    }
    async execute(event) {
        this.totalOperations++;
        const startTime = performance.now();
        try {
            const operation = this.operations.get(event.operationName);
            if (!operation) {
                throw new Error(`Operation not found: ${event.operationName}`);
            }
            // Verify operation hash for determinism
            if (operation.hash !== event.operationHash) {
                throw new Error(`Operation hash mismatch: expected ${operation.hash}, got ${event.operationHash}`);
            }
            // Create execution context
            const context = {
                eventId: event.id,
                sourceLanguage: event.sourceLanguage,
                targetLanguage: RuntimeLanguage.TYPESCRIPT,
                causationChain: event.parents,
                resources: event.resourceLimits || {
                    maxMemoryMB: 512,
                    maxCPUTime: 30000,
                    maxStackDepth: 10000,
                    maxFileDescriptors: 100,
                },
            };
            // Execute with timeout
            const timeout = event.executionTimeout || 30000;
            const result = await this.executeWithTimeout(operation.handler, event.input.data, event.input.format, context, timeout);
            const endTime = performance.now();
            const metrics = {
                runtimeLanguage: RuntimeLanguage.TYPESCRIPT,
                executionTimeMs: endTime - startTime,
                cpuTimeMs: endTime - startTime, // Approximate in JS
                memoryPeakMB: this.estimateMemoryUsage(),
                allocations: 1,
                syscalls: 0,
                determinismScore: 1.0, // TODO: implement actual determinism checking
            };
            this.recordMetrics(event.operationName, metrics);
            return {
                eventId: event.id,
                success: true,
                outputFormat: SerializationFormat.CBOR,
                output: result,
                metrics,
            };
        }
        catch (error) {
            this.failedOperations++;
            const endTime = performance.now();
            const metrics = {
                runtimeLanguage: RuntimeLanguage.TYPESCRIPT,
                executionTimeMs: endTime - startTime,
                cpuTimeMs: endTime - startTime,
                memoryPeakMB: this.estimateMemoryUsage(),
                allocations: 0,
                syscalls: 0,
                determinismScore: 0,
            };
            return {
                eventId: event.id,
                success: false,
                outputFormat: SerializationFormat.CBOR,
                error: {
                    code: "EXECUTION_ERROR",
                    message: error instanceof Error ? error.message : String(error),
                    language: RuntimeLanguage.TYPESCRIPT,
                    stack: error instanceof Error ? error.stack : undefined,
                },
                metrics,
            };
        }
    }
    async executeWithCheckpoint(event, checkpoint) {
        const context = {
            eventId: event.id,
            sourceLanguage: event.sourceLanguage,
            targetLanguage: RuntimeLanguage.TYPESCRIPT,
            causationChain: event.parents,
            resources: event.resourceLimits || {
                maxMemoryMB: 512,
                maxCPUTime: 30000,
                maxStackDepth: 10000,
                maxFileDescriptors: 100,
            },
            checkpoint,
        };
        const operation = this.operations.get(event.operationName);
        if (!operation) {
            throw new Error(`Operation not found: ${event.operationName}`);
        }
        const timeout = event.executionTimeout || 30000;
        const result = await this.executeWithTimeout(operation.handler, event.input.data, event.input.format, context, timeout);
        return {
            eventId: event.id,
            success: true,
            outputFormat: SerializationFormat.CBOR,
            output: result,
            metrics: {
                runtimeLanguage: RuntimeLanguage.TYPESCRIPT,
                executionTimeMs: 0,
                cpuTimeMs: 0,
                memoryPeakMB: 0,
                allocations: 0,
                syscalls: 0,
                determinismScore: 1.0,
            },
        };
    }
    async verifyDeterminism(operationHash, executionCount) {
        const metrics = Array.from(this.executionMetrics.values()).flat();
        if (metrics.length === 0) {
            return {
                operationHash,
                executionCount,
                consistentOutputs: 0,
                inconsistencies: [],
                deterministicScore: 0,
                passed: false,
            };
        }
        // Determinism check: all executions should produce same output hash
        // In a real implementation, we'd compare output hashes
        const deterministicScore = metrics.filter((m) => m.determinismScore === 1.0).length /
            metrics.length;
        return {
            operationHash,
            executionCount: Math.min(executionCount, metrics.length),
            consistentOutputs: metrics.filter((m) => m.determinismScore === 1.0)
                .length,
            inconsistencies: [],
            deterministicScore,
            passed: deterministicScore >= 0.95,
        };
    }
    async initialize() {
        this.startTime = Date.now();
        this.totalOperations = 0;
        this.failedOperations = 0;
    }
    async shutdown() {
        // Cleanup
        this.operations.clear();
        this.executionMetrics.clear();
    }
    async health() {
        const uptime = Date.now() - this.startTime;
        const avgExecutionTime = this.totalOperations > 0
            ? Array.from(this.executionMetrics.values())
                .flat()
                .reduce((sum, m) => sum + m.executionTimeMs, 0) /
                this.totalOperations
            : 0;
        this.lastHealth = {
            healthy: this.failedOperations === 0,
            language: RuntimeLanguage.TYPESCRIPT,
            uptime,
            metrics: {
                totalOperations: this.totalOperations,
                failedOperations: this.failedOperations,
                averageExecutionTimeMs: avgExecutionTime,
            },
        };
        return this.lastHealth;
    }
    // Private helpers
    async executeWithTimeout(handler, input, format, context, timeoutMs) {
        return Promise.race([
            handler(input, format, context),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms for ${context.eventId}`)), timeoutMs)),
        ]);
    }
    estimateMemoryUsage() {
        if (typeof process !== "undefined" && process.memoryUsage) {
            return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        }
        return 0;
    }
    recordMetrics(operationName, metrics) {
        const existing = this.executionMetrics.get(operationName) || [];
        existing.push(metrics);
        this.executionMetrics.set(operationName, existing);
    }
}
// Export singleton instance
export const typeScriptAdapter = new TypeScriptAdapter();
//# sourceMappingURL=typescript.js.map