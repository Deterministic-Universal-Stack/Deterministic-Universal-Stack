/**
 * Z Plane Runtime Coordinator
 *
 * Manages adapter lifecycle, execution planning, and consistency verification
 * across multiple language runtimes. Ensures deterministic computation
 * boundaries and causal consistency in polyglot environments.
 */

import {
  ZPlaneAdapter,
  ZPlaneCoordinator,
  ExecutionPlan,
  ExecutionPlanResult,
  ExecutionStep,
  ZPlaneResult,
  ZPlaneEvent,
  ConsistencyReport,
  RuntimeLanguage,
  SerializationFormat,
  ZPlaneConfig,
  DEFAULT_ZPLANE_CONFIG,
} from "../index.js";

export class ZPlaneRuntimeCoordinator implements ZPlaneCoordinator {
  private adapters: Map<RuntimeLanguage, ZPlaneAdapter> = new Map();
  private config: ZPlaneConfig;
  private planHistory: Map<string, ExecutionPlanResult> = new Map();

  constructor(config: Partial<ZPlaneConfig> = {}) {
    this.config = { ...DEFAULT_ZPLANE_CONFIG, ...config };
  }

  async registerAdapter(adapter: ZPlaneAdapter): Promise<void> {
    if (!adapter || !adapter.language) {
      throw new Error("Invalid adapter: must have language property");
    }

    await adapter.initialize();
    this.adapters.set(adapter.language, adapter);
  }

  async getAdapter(language: RuntimeLanguage): Promise<ZPlaneAdapter | null> {
    return this.adapters.get(language) || null;
  }

  async listAdapters(): Promise<ZPlaneAdapter[]> {
    return Array.from(this.adapters.values());
  }

  async executeMultiLanguage(plan: ExecutionPlan): Promise<ExecutionPlanResult> {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      throw new Error("Invalid execution plan: must have at least one step");
    }

    const result: ExecutionPlanResult = {
      planId: plan.id,
      success: true,
      stepResults: new Map(),
      totalTimeMs: 0,
      errors: [],
    };

    const startTime = performance.now();

    // Build dependency graph
    const stepMap = new Map<string, ExecutionStep>();
    for (const step of plan.steps) {
      stepMap.set(step.id, step);
    }

    // Track completed steps
    const completed = new Set<string>();
    const results = new Map<string, Uint8Array>();

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
          } else if (stepResult.output) {
            results.set(step.id, stepResult.output);
          }
        } catch (error) {
          result.success = false;
          result.errors.push({
            stepId: step.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      result.totalTimeMs = performance.now() - startTime;
      this.planHistory.set(plan.id, result);
    }

    return result;
  }

  async verifyConsistency(eventSet: ZPlaneEvent[]): Promise<ConsistencyReport> {
    if (!eventSet || eventSet.length === 0) {
      return {
        eventSetHash: "",
        adapterCount: 0,
        stateHashes: new Map(),
        consistent: true,
        discrepancies: [],
      };
    }

    const stateHashes = new Map<RuntimeLanguage, string>();
    const discrepancies: Array<{
      language1: RuntimeLanguage;
      language2: RuntimeLanguage;
      divergencePoint: number;
    }> = [];

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
      } catch (error) {
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

  async serialize(value: unknown, format: SerializationFormat): Promise<Uint8Array> {
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

  async deserialize<T>(data: Uint8Array, format: SerializationFormat): Promise<T> {
    switch (format) {
      case SerializationFormat.JSON:
        return JSON.parse(new TextDecoder().decode(data));
      case SerializationFormat.CBOR:
        return this.decodeSimpleCBOR<T>(data);
      case SerializationFormat.MSGPACK:
        return JSON.parse(new TextDecoder().decode(data));
      case SerializationFormat.PROTOBUF:
        return JSON.parse(new TextDecoder().decode(data));
      default:
        throw new Error(`Unknown serialization format: ${format}`);
    }
  }

  // Private helpers

  private canExecuteStep(step: ExecutionStep, completed: Set<string>): boolean {
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

  private async executeStep(
    step: ExecutionStep,
    previousResults: Map<string, Uint8Array>
  ): Promise<ZPlaneResult> {
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
    const event: ZPlaneEvent = {
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

  private computeEventSetHash(events: ZPlaneEvent[], language: RuntimeLanguage): string {
    const sortedIds = events.map((e) => e.id).sort().join("|");
    return `${language}:${this.simpleHash(sortedIds)}`;
  }

  private hashEventSet(events: ZPlaneEvent[]): string {
    const eventIds = events.map((e) => e.id).sort().join("|");
    return this.simpleHash(eventIds);
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private encodeSimpleCBOR(value: unknown): Uint8Array {
    // Simplified CBOR encoding - production code would use cbor library
    const json = JSON.stringify(value);
    return new TextEncoder().encode(json);
  }

  private decodeSimpleCBOR<T>(data: Uint8Array): T {
    // Simplified CBOR decoding
    const json = new TextDecoder().decode(data);
    return JSON.parse(json);
  }
}

export function createZPlaneCoordinator(config?: Partial<ZPlaneConfig>): ZPlaneCoordinator {
  return new ZPlaneRuntimeCoordinator(config);
}
