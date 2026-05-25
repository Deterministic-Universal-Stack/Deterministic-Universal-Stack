import { describe, it, expect, beforeEach } from "vitest";
import { RuntimeLanguage, SerializationFormat, DEFAULT_ZPLANE_CONFIG, } from "../packages/zplane/src/index.js";
import { typeScriptAdapter } from "../packages/zplane/src/adapters/typescript.js";
import { createZPlaneCoordinator, } from "../packages/zplane/src/runtime/index.js";
describe("Z Plane - Polyglot Interoperability", () => {
    beforeEach(async () => {
        await typeScriptAdapter.initialize();
    });
    describe("TypeScript Adapter", () => {
        it("should register and execute operations", async () => {
            let executed = false;
            await typeScriptAdapter.registerOperation("test-operation", async (input, format, context) => {
                executed = true;
                expect(context.eventId).toBeDefined();
                expect(context.targetLanguage).toBe(RuntimeLanguage.TYPESCRIPT);
                return new Uint8Array([1, 2, 3]);
            }, {
                name: "test-operation",
                language: RuntimeLanguage.TYPESCRIPT,
                hash: "abc123",
                deterministic: true,
                pure: true,
                version: "1.0.0",
                registeredAt: Date.now(),
            });
            const event = {
                id: "evt-1",
                timestamp: Date.now(),
                sourceLanguage: RuntimeLanguage.TYPESCRIPT,
                parents: [],
                operationName: "test-operation",
                operationLanguage: RuntimeLanguage.TYPESCRIPT,
                operationHash: "abc123",
                input: {
                    format: SerializationFormat.JSON,
                    data: new TextEncoder().encode("{}"),
                },
            };
            const result = await typeScriptAdapter.execute(event);
            expect(result.success).toBe(true);
            expect(result.eventId).toBe("evt-1");
            expect(executed).toBe(true);
            expect(result.output).toBeDefined();
        });
        it("should handle operation not found", async () => {
            const event = {
                id: "evt-2",
                timestamp: Date.now(),
                sourceLanguage: RuntimeLanguage.TYPESCRIPT,
                parents: [],
                operationName: "nonexistent-operation",
                operationLanguage: RuntimeLanguage.TYPESCRIPT,
                operationHash: "xyz789",
                input: {
                    format: SerializationFormat.JSON,
                    data: new Uint8Array(),
                },
            };
            const result = await typeScriptAdapter.execute(event);
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe("EXECUTION_ERROR");
        });
        it("should track execution metrics", async () => {
            await typeScriptAdapter.registerOperation("metric-test", async (input, format, context) => {
                return new Uint8Array([42]);
            }, {
                name: "metric-test",
                language: RuntimeLanguage.TYPESCRIPT,
                hash: "metrics123",
                deterministic: true,
                pure: true,
                version: "1.0.0",
                registeredAt: Date.now(),
            });
            const event = {
                id: "evt-3",
                timestamp: Date.now(),
                sourceLanguage: RuntimeLanguage.TYPESCRIPT,
                parents: [],
                operationName: "metric-test",
                operationLanguage: RuntimeLanguage.TYPESCRIPT,
                operationHash: "metrics123",
                input: {
                    format: SerializationFormat.JSON,
                    data: new Uint8Array(),
                },
            };
            const result = await typeScriptAdapter.execute(event);
            expect(result.metrics).toBeDefined();
            expect(result.metrics.runtimeLanguage).toBe(RuntimeLanguage.TYPESCRIPT);
            expect(result.metrics.executionTimeMs).toBeGreaterThanOrEqual(0);
            expect(result.metrics.determinismScore).toBeGreaterThanOrEqual(0);
        });
        it("should verify determinism", async () => {
            const report = await typeScriptAdapter.verifyDeterminism("test-hash", 10);
            expect(report.operationHash).toBe("test-hash");
            expect(report.deterministicScore).toBeGreaterThanOrEqual(0);
            expect(report.deterministicScore).toBeLessThanOrEqual(1);
        });
        it("should report health status", async () => {
            const health = await typeScriptAdapter.health();
            expect(health.healthy).toBeDefined();
            expect(health.language).toBe(RuntimeLanguage.TYPESCRIPT);
            expect(health.uptime).toBeGreaterThanOrEqual(0);
            expect(health.metrics.totalOperations).toBeGreaterThanOrEqual(0);
        });
    });
    describe("Z Plane Runtime Coordinator", () => {
        it("should register and retrieve adapters", async () => {
            const coordinator = createZPlaneCoordinator();
            await coordinator.registerAdapter(typeScriptAdapter);
            const adapter = await coordinator.getAdapter(RuntimeLanguage.TYPESCRIPT);
            expect(adapter).toBeDefined();
            expect(adapter?.language).toBe(RuntimeLanguage.TYPESCRIPT);
        });
        it("should list registered adapters", async () => {
            const coordinator = createZPlaneCoordinator();
            await coordinator.registerAdapter(typeScriptAdapter);
            const adapters = await coordinator.listAdapters();
            expect(adapters.length).toBeGreaterThan(0);
            expect(adapters.some((a) => a.language === RuntimeLanguage.TYPESCRIPT)).toBe(true);
        });
        it("should serialize and deserialize data", async () => {
            const coordinator = createZPlaneCoordinator();
            const original = { foo: "bar", num: 42 };
            const serialized = await coordinator.serialize(original, SerializationFormat.JSON);
            const deserialized = await coordinator.deserialize(serialized, SerializationFormat.JSON);
            expect(deserialized).toEqual(original);
        });
        it("should execute multi-language plans", async () => {
            const coordinator = createZPlaneCoordinator();
            await coordinator.registerAdapter(typeScriptAdapter);
            await typeScriptAdapter.registerOperation("plan-op-1", async (input) => {
                const value = JSON.parse(new TextDecoder().decode(input));
                return new TextEncoder().encode(JSON.stringify(value + 1));
            }, {
                name: "plan-op-1",
                language: RuntimeLanguage.TYPESCRIPT,
                hash: "plan-hash-1",
                deterministic: true,
                pure: true,
                version: "1.0.0",
                registeredAt: Date.now(),
            });
            const plan = {
                id: "plan-1",
                steps: [
                    {
                        id: "step-1",
                        operationName: "plan-op-1",
                        language: RuntimeLanguage.TYPESCRIPT,
                        input: new TextEncoder().encode("5"),
                        inputFormat: SerializationFormat.JSON,
                        outputFormat: SerializationFormat.JSON,
                        dependencies: [],
                    },
                ],
                timeout: 10000,
            };
            const result = await coordinator.executeMultiLanguage(plan);
            expect(result.planId).toBe("plan-1");
            expect(result.success).toBe(true);
        });
        it("should verify consistency across event sets", async () => {
            const coordinator = createZPlaneCoordinator();
            await coordinator.registerAdapter(typeScriptAdapter);
            const events = [
                {
                    id: "evt-consistency-1",
                    timestamp: Date.now(),
                    sourceLanguage: RuntimeLanguage.TYPESCRIPT,
                    parents: [],
                    operationName: "test",
                    operationLanguage: RuntimeLanguage.TYPESCRIPT,
                    operationHash: "hash1",
                    input: {
                        format: SerializationFormat.JSON,
                        data: new Uint8Array(),
                    },
                },
            ];
            const report = await coordinator.verifyConsistency(events);
            expect(report.eventSetHash).toBeDefined();
            expect(report.adapterCount).toBeGreaterThanOrEqual(0);
            expect(typeof report.consistent).toBe("boolean");
        });
    });
    describe("Configuration", () => {
        it("should use default configuration", () => {
            const config = DEFAULT_ZPLANE_CONFIG;
            expect(config.defaultSerializationFormat).toBe(SerializationFormat.CBOR);
            expect(config.maxConcurrentExecutions).toBeGreaterThan(0);
            expect(config.operationTimeout).toBeGreaterThan(0);
        });
        it("should allow custom configuration", () => {
            const customConfig = {
                maxConcurrentExecutions: 32,
                operationTimeout: 60000,
            };
            const coordinator = createZPlaneCoordinator(customConfig);
            expect(coordinator).toBeDefined();
        });
    });
    describe("Error Handling", () => {
        it("should handle missing adapters gracefully", async () => {
            const coordinator = createZPlaneCoordinator();
            const plan = {
                id: "plan-missing",
                steps: [
                    {
                        id: "step-missing",
                        operationName: "nonexistent",
                        language: RuntimeLanguage.PYTHON,
                        input: new Uint8Array(),
                        inputFormat: SerializationFormat.JSON,
                        outputFormat: SerializationFormat.JSON,
                        dependencies: [],
                    },
                ],
                timeout: 5000,
            };
            const result = await coordinator.executeMultiLanguage(plan);
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
        it("should reject invalid operation registration", async () => {
            await expect(async () => {
                await typeScriptAdapter.registerOperation("", async () => new Uint8Array(), {
                    name: "",
                    language: RuntimeLanguage.TYPESCRIPT,
                    hash: "bad",
                    deterministic: true,
                    pure: true,
                    version: "1.0.0",
                    registeredAt: Date.now(),
                });
            }).rejects.toThrow();
        });
    });
});
//# sourceMappingURL=zplane.test.js.map