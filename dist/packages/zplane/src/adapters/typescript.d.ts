import { ZPlaneAdapter, ZPlaneEvent, ZPlaneResult, ZPlaneHandler, OperationMetadata, RuntimeLanguage, DeterminismReport, HealthStatus } from "../index.js";
/**
 * TypeScript/JavaScript runtime adapter for Z plane
 * Enables native TS/JS functions to participate in deterministic DUS computation
 */
export declare class TypeScriptAdapter implements ZPlaneAdapter {
    language: RuntimeLanguage;
    version: string;
    private operations;
    private executionMetrics;
    private lastHealth;
    private startTime;
    private totalOperations;
    private failedOperations;
    registerOperation(name: string, handler: ZPlaneHandler, metadata: OperationMetadata): Promise<void>;
    getOperation(name: string): Promise<OperationMetadata | null>;
    listOperations(): Promise<OperationMetadata[]>;
    execute(event: ZPlaneEvent): Promise<ZPlaneResult>;
    executeWithCheckpoint(event: ZPlaneEvent, checkpoint: Uint8Array): Promise<ZPlaneResult>;
    verifyDeterminism(operationHash: string, executionCount: number): Promise<DeterminismReport>;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    health(): Promise<HealthStatus>;
    private executeWithTimeout;
    private estimateMemoryUsage;
    private recordMetrics;
}
export declare const typeScriptAdapter: TypeScriptAdapter;
//# sourceMappingURL=typescript.d.ts.map