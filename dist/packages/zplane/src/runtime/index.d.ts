/**
 * Z Plane Runtime Coordinator
 *
 * Manages adapter lifecycle, execution planning, and consistency verification
 * across multiple language runtimes. Ensures deterministic computation
 * boundaries and causal consistency in polyglot environments.
 */
import { ZPlaneAdapter, ZPlaneCoordinator, ExecutionPlan, ExecutionPlanResult, ZPlaneEvent, ConsistencyReport, RuntimeLanguage, SerializationFormat, ZPlaneConfig } from "../index.js";
export declare class ZPlaneRuntimeCoordinator implements ZPlaneCoordinator {
    private adapters;
    private config;
    private planHistory;
    constructor(config?: Partial<ZPlaneConfig>);
    registerAdapter(adapter: ZPlaneAdapter): Promise<void>;
    getAdapter(language: RuntimeLanguage): Promise<ZPlaneAdapter | null>;
    listAdapters(): Promise<ZPlaneAdapter[]>;
    executeMultiLanguage(plan: ExecutionPlan): Promise<ExecutionPlanResult>;
    verifyConsistency(eventSet: ZPlaneEvent[]): Promise<ConsistencyReport>;
    serialize(value: unknown, format: SerializationFormat): Promise<Uint8Array>;
    deserialize<T>(data: Uint8Array, format: SerializationFormat): Promise<T>;
    private canExecuteStep;
    private executeStep;
    private computeEventSetHash;
    private hashEventSet;
    private simpleHash;
    private encodeSimpleCBOR;
    private decodeSimpleCBOR;
}
export declare function createZPlaneCoordinator(config?: Partial<ZPlaneConfig>): ZPlaneCoordinator;
//# sourceMappingURL=index.d.ts.map