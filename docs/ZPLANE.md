# Z Plane: Polyglot Language Interoperability for DUS

## Overview

The Z plane is DUS's bridge to polyglot computation. It enables deterministic event-driven computation across TypeScript, Python, Go, Rust, and WebAssembly without requiring a single language monoculture.

**Core Thesis**: Language choice is an implementation detail, not a barrier. A polyglot engineer should be able to use the right tool for each job while maintaining deterministic guarantees across the entire system.

## Architecture

```
┌─────────────────────────────────────────────┐
│   DUS Core (Deterministic Event System)     │
│   - Causal history tracking                 │
│   - Deterministic replay                    │
│   - Event consensus                         │
└──────────────┬──────────────────────────────┘
               │
               │ ZPlaneEvent (language-agnostic)
               │
┌──────────────▼──────────────────────────────┐
│   Z Plane Coordinator                       │
│   - Adapter lifecycle management            │
│   - Multi-language execution planning       │
│   - Consistency verification                │
│   - Serialization routing                   │
└──────┬──────┬──────┬──────┬──────┬──────────┘
       │      │      │      │      │
┌──────▼────┬─────┬─────┬────┬──────┴─────────┐
│TypeScript │Python│ Go  │Rust│  WebAssembly │
└───────────┴─────┴─────┴────┴───────────────┘
```

## Core Components

### 1. Language Adapters

Each language runtime is represented by a `ZPlaneAdapter`:

```typescript
interface ZPlaneAdapter {
  language: RuntimeLanguage;
  registerOperation(name, handler, metadata): Promise<void>;
  execute(event: ZPlaneEvent): Promise<ZPlaneResult>;
  executeWithCheckpoint(event, checkpoint): Promise<ZPlaneResult>;
  verifyDeterminism(operationHash, count): Promise<DeterminismReport>;
  health(): Promise<HealthStatus>;
}
```

### 2. Event Model

All operations flow through a unified `ZPlaneEvent`:

```typescript
interface ZPlaneEvent {
  // Identity
  id: string;
  sourceLanguage: RuntimeLanguage;

  // Causality
  parents: string[];
  causationId?: string;

  // Computation
  operationName: string;
  operationLanguage: RuntimeLanguage;
  operationHash: string; // Determinism key

  // Input (serialized, format-agnostic)
  input: {
    format: SerializationFormat;
    data: Uint8Array;
    schema?: string;
  };

  // Execution constraints
  executionTimeout?: number;
  resourceLimits?: ResourceLimits;
  retryPolicy?: RetryPolicy;
}
```

### 3. Serialization

Four serialization formats enable language interop:

- **CBOR** (default): Binary, deterministic, compact
- **JSON**: Human-readable, slower
- **MessagePack**: Binary, fast
- **Protocol Buffers**: Strongly-typed binary

Each adapter chooses its native format; the coordinator translates automatically.

### 4. Execution Planning

Multi-language workflows are expressed as `ExecutionPlan`:

```typescript
interface ExecutionPlan {
  id: string;
  steps: ExecutionStep[];
  parallelizableSteps?: number[][];
  timeout: number;
}

interface ExecutionStep {
  id: string;
  operationName: string;
  language: RuntimeLanguage;
  input: Uint8Array;
  inputFormat: SerializationFormat;
  dependencies: string[]; // Step IDs
}
```

The coordinator respects dependencies and sequences execution.

### 5. Determinism Verification

Z plane audits deterministic correctness:

```typescript
interface DeterminismReport {
  operationHash: string;
  executionCount: number;
  consistentOutputs: number;
  deterministicScore: number; // 0-1
  passed: boolean;
}
```

Operations must produce **identical output** for identical input across multiple executions, regardless of language.

### 6. Consistency Guarantees

Across language boundaries, Z plane verifies:

```typescript
interface ConsistencyReport {
  eventSetHash: string;
  stateHashes: Map<RuntimeLanguage, string>;
  consistent: boolean;
  discrepancies: Array<{
    language1: RuntimeLanguage;
    language2: RuntimeLanguage;
    divergencePoint: number;
  }>;
}
```

If replicas in different languages see the same event set, their derived state must match byte-for-byte.

## Usage Examples

### Registering a TypeScript Operation

```typescript
import { typeScriptAdapter, RuntimeLanguage } from "@dus/zplane";

await typeScriptAdapter.registerOperation(
  "compress-data",
  async (input, format, context) => {
    const data = JSON.parse(new TextDecoder().decode(input));
    const compressed = Buffer.from(data).toString("base64");
    return new TextEncoder().encode(compressed);
  },
  {
    name: "compress-data",
    language: RuntimeLanguage.TYPESCRIPT,
    hash: "sha256:abc123...",
    deterministic: true,
    pure: true,
    version: "1.0.0",
    registeredAt: Date.now(),
  }
);
```

### Executing a Multi-Language Plan

```typescript
import { createZPlaneCoordinator, RuntimeLanguage, SerializationFormat } from "@dus/zplane";

const coordinator = createZPlaneCoordinator();
await coordinator.registerAdapter(typeScriptAdapter);
await coordinator.registerAdapter(pythonAdapter);

const plan = {
  id: "workflow-1",
  steps: [
    {
      id: "step-validate",
      operationName: "validate-input",
      language: RuntimeLanguage.PYTHON,
      input: inputData,
      inputFormat: SerializationFormat.CBOR,
      outputFormat: SerializationFormat.CBOR,
      dependencies: [],
    },
    {
      id: "step-process",
      operationName: "process-batch",
      language: RuntimeLanguage.GO,
      input: new Uint8Array(), // Will use step-validate output
      inputFormat: SerializationFormat.CBOR,
      outputFormat: SerializationFormat.CBOR,
      dependencies: ["step-validate"],
    },
  ],
  timeout: 30000,
};

const result = await coordinator.executeMultiLanguage(plan);
console.log(result.success); // true if all steps succeeded
```

### Verifying Consistency

```typescript
const events = [/* ZPlaneEvent[] */];

const report = await coordinator.verifyConsistency(events);
console.log(report.consistent); // true if all languages derived same state

if (!report.consistent) {
  for (const discrepancy of report.discrepancies) {
    console.error(
      `${discrepancy.language1} and ${discrepancy.language2} diverged at event ${discrepancy.divergencePoint}`
    );
  }
}
```

## Adapter Implementation Guide

### TypeScript

Native in-process execution. No FFI overhead.

```typescript
export class TypeScriptAdapter implements ZPlaneAdapter {
  async execute(event: ZPlaneEvent): Promise<ZPlaneResult> {
    const operation = this.operations.get(event.operationName);
    const output = await operation.handler(event.input.data, event.input.format, context);
    return { eventId: event.id, success: true, output, metrics };
  }
}
```

### Python

Via subprocess isolation or FFI binding (pyo3/ctypes):

```typescript
export class PythonAdapter implements ZPlaneAdapter {
  async execute(event: ZPlaneEvent): Promise<ZPlaneResult> {
    // Spawn Python interpreter in isolated container with:
    // - Input serialized as CBOR
    // - Output captured and returned
    // - Resource limits enforced via cgroups
    // - Determinism verified via hash replay
  }
}
```

### Go

Via IPC bridge or embedded runtime:

```typescript
export class GoAdapter implements ZPlaneAdapter {
  async execute(event: ZPlaneEvent): Promise<ZPlaneResult> {
    // Call Go binary via gRPC or HTTP with:
    // - Causal chain passed as metadata
    // - Input/output in canonical format
    // - Metrics returned alongside result
  }
}
```

### Rust

Via NAPI-rs bindings or WASM:

```typescript
export class RustAdapter implements ZPlaneAdapter {
  async execute(event: ZPlaneEvent): Promise<ZPlaneResult> {
    // Invoke native Rust function via NAPI with:
    // - Memory isolation if used as WASM
    // - Direct function calls if linked
    // - Type-safe serialization via bincode
  }
}
```

### WebAssembly

Via WASM runtime (wasmtime, v8):

```typescript
export class WasmAdapter implements ZPlaneAdapter {
  async execute(event: ZPlaneEvent): Promise<ZPlaneResult> {
    // Instantiate WASM module with:
    // - Deterministic memory initialization
    // - Resource-limited execution
    // - Import/export bindings for I/O
  }
}
```

## Determinism Guarantees

Z plane enforces determinism at multiple levels:

### Operation-Level Determinism

Each operation must produce **identical output** for identical input:

```
H(operation_code) || input → deterministic_output
```

Operations are marked `pure: true` only if they have no side effects.

### Causal Determinism

Parent events always execute before children:

```
∀ child ∈ events:
  ∀ parent ∈ child.parents:
    timestamp(parent) < timestamp(child)
    state_after(parent) ⊆ input_context(child)
```

### Cross-Language Determinism

Same event set, any language → same state hash:

```
∀ language1, language2:
  replay(events, language1) ≡ replay(events, language2)
  ⟹ state_hash(language1) = state_hash(language2)
```

## Resource Limits

Each execution has enforced constraints:

```typescript
interface ResourceLimits {
  maxMemoryMB: number;
  maxCPUTime: number; // milliseconds
  maxStackDepth: number;
  maxFileDescriptors: number;
}
```

Violations trigger immediate termination and error reporting.

## Metrics and Observability

Every execution generates comprehensive metrics:

```typescript
interface ExecutionMetrics {
  runtimeLanguage: RuntimeLanguage;
  executionTimeMs: number;
  cpuTimeMs: number;
  memoryPeakMB: number;
  allocations: number;
  syscalls: number;
  determinismScore: number;
}
```

Used for:
- Performance optimization
- Bottleneck identification
- Determinism auditing
- SLA compliance

## Error Handling

Z plane defines canonical error codes:

- `ADAPTER_NOT_FOUND`: Language not registered
- `OPERATION_NOT_FOUND`: Operation name not found in adapter
- `EXECUTION_ERROR`: Runtime exception during execution
- `TIMEOUT`: Exceeded `executionTimeout`
- `RESOURCE_EXHAUSTED`: Hit `resourceLimits`
- `DETERMINISM_VIOLATION`: Non-deterministic output detected
- `CONSISTENCY_ERROR`: Cross-language state divergence

## Integration with DUS

Z plane sits between DUS Core and language runtimes:

1. **Events from DUS Core** → Serialized into `ZPlaneEvent`
2. **Routing** → Coordinator selects appropriate adapter
3. **Execution** → Adapter runs operation with guarantees
4. **Result** → Serialized back to DUS event log
5. **Verification** → Consistency checked across language boundaries

## Best Practices

### For Operation Developers

1. **Write deterministically**
   - No random number generation without seeding
   - No time-dependent logic
   - No external I/O except through DUS

2. **Mark operations correctly**
   - `pure: true` only for side-effect-free functions
   - Accurate operation hash
   - Proper input/output schemas

3. **Handle serialization**
   - Know your format (CBOR default)
   - Test round-trip: serialize → deserialize

### For Z Plane Coordinator Users

1. **Plan dependencies carefully**
   - Explicit step dependencies enable parallelism
   - Unused dependencies hurt performance

2. **Use appropriate serialization**
   - CBOR for production (deterministic)
   - JSON for debugging (readable)

3. **Monitor health**
   - Check adapter health regularly
   - Alert on determinism violations
   - Track consistency reports

## Future Extensions

Planned Z plane enhancements:

- **Language SDKs**: Official bindings for Python, Go, Rust
- **Hot Reload**: Update operations without restart
- **Profiling Integration**: Flamegraph export per operation
- **Distributed Adapters**: Adapters running on remote nodes
- **Automatic Serialization**: Schema-driven format selection
- **Fault Recovery**: Checkpoint/restore across language boundaries

## Testing

Z plane includes comprehensive tests:

```bash
npm run test -- zplane.test.ts
```

Test categories:

- Adapter registration and lookup
- Single-language operation execution
- Multi-language execution plans
- Serialization/deserialization
- Determinism verification
- Consistency checking
- Error handling
- Configuration validation

## References

- **DUS Core**: `packages/core`
- **Event Model**: `packages/eventlog`
- **Serialization**: External libraries (cbor, msgpack, protobuf)
- **Tests**: `tests/zplane.test.ts`

## Contact

For Z plane questions or contributions:
- Review: `packages/zplane/src`
- Discussion: Issues tagged `z-plane`
- Design: See architectural diagrams in this document
