/**
 * Language-specific adapters
 *
 * These are production stubs that would be completed with actual language
 * interop bindings. Each adapter bridges DUS deterministic guarantees with
 * the foreign language runtime.
 */
import { ZPlaneAdapter, ZPlaneEvent, ZPlaneResult, ZPlaneHandler, OperationMetadata, RuntimeLanguage, DeterminismReport, HealthStatus } from "../index.js";
/**
 * Python runtime adapter
 * Integrates CPython/PyPy via FFI or subprocess isolation
 */
export declare class PythonAdapter implements ZPlaneAdapter {
    language: RuntimeLanguage;
    version: string;
    private operations;
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
}
/**
 * Go runtime adapter
 * Integrates Go via cgo or standalone Go binaries with IPC
 */
export declare class GoAdapter implements ZPlaneAdapter {
    language: RuntimeLanguage;
    version: string;
    private operations;
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
}
/**
 * Rust runtime adapter
 * Integrates Rust via wasm-bindgen or napi-rs bindings
 */
export declare class RustAdapter implements ZPlaneAdapter {
    language: RuntimeLanguage;
    version: string;
    private operations;
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
}
/**
 * WebAssembly runtime adapter
 * Executes WASM modules with DUS determinism guarantees
 */
export declare class WasmAdapter implements ZPlaneAdapter {
    language: RuntimeLanguage;
    version: string;
    private operations;
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
}
export declare const pythonAdapter: PythonAdapter;
export declare const goAdapter: GoAdapter;
export declare const rustAdapter: RustAdapter;
export declare const wasmAdapter: WasmAdapter;
//# sourceMappingURL=python.d.ts.map