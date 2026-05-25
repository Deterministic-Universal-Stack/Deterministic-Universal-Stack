/**
 * DUS Comprehensive Error Handling System
 * 
 * This module provides:
 * - Typed error hierarchy with severity levels
 * - Context-preserving error construction
 * - Automatic error classification and recovery strategies
 * - Audit logging and metrics
 */

// ============================================================================
// Error Type Hierarchy
// ============================================================================

export type ErrorSeverity = 'transient' | 'recoverable' | 'fatal';
export type ErrorCode = string;

/**
 * Context object attached to every error for debugging and recovery
 */
export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * Base error class for all DUS errors
 * 
 * All DUS errors extend this to ensure:
 * - Consistent severity classification
 * - Context preservation
 * - Audit trail capability
 */
export abstract class DUSError extends Error {
  abstract readonly severity: ErrorSeverity;
  abstract readonly code: ErrorCode;
  readonly timestamp = new Date().toISOString();
  readonly stackTrace = new Error().stack;

  constructor(
    message: string,
    public readonly context: ErrorContext = {}
  ) {
    super(message);
    Object.setPrototypeOf(this, DUSError.prototype);
  }

  toJSON() {
    return {
      name: this.constructor.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp,
      context: this.context,
      stackTrace: this.stackTrace
    };
  }
}

// ============================================================================
// Validation Errors (Recoverable)
// ============================================================================

/**
 * ValidationError: Event schema, payload, or structure validation failed
 * Severity: recoverable (reject the event, continue)
 */
export class ValidationError extends DUSError {
  readonly severity = 'recoverable' as const;
  readonly code = 'VALIDATION_ERROR' as const;

  constructor(
    message: string,
    public readonly field: string,
    public readonly expectedType?: string,
    public readonly receivedValue?: unknown
  ) {
    super(message, { field, expectedType, receivedValue });
  }
}

/**
 * InvalidEventError: Event ID, hash, or parents are invalid
 */
export class InvalidEventError extends DUSError {
  readonly severity = 'recoverable' as const;
  readonly code = 'INVALID_EVENT_ERROR' as const;

  constructor(
    message: string,
    public readonly eventId: string,
    public readonly computedHash: string,
    public readonly providedHash: string
  ) {
    super(message, { eventId, computedHash, providedHash });
  }
}

/**
 * SignatureVerificationError: Event signature doesn't match
 */
export class SignatureVerificationError extends DUSError {
  readonly severity = 'recoverable' as const;
  readonly code = 'SIGNATURE_VERIFICATION_ERROR' as const;

  constructor(
    message: string,
    public readonly eventId: string,
    public readonly signingKey?: string
  ) {
    super(message, { eventId });
  }
}

// ============================================================================
// Causality Errors (Transient)
// ============================================================================

/**
 * CausalityError: Parent events are missing (transient; will retry)
 */
export class CausalityError extends DUSError {
  readonly severity = 'transient' as const;
  readonly code = 'CAUSALITY_ERROR' as const;

  constructor(
    message: string,
    public readonly eventId: string,
    public readonly missingParents: string[],
    public readonly requiredByTime?: number
  ) {
    super(message, { eventId, missingParents, requiredByTime });
  }
}

/**
 * CyclicDependencyError: Event causality graph has cycles
 */
export class CyclicDependencyError extends DUSError {
  readonly severity = 'fatal' as const;
  readonly code = 'CYCLIC_DEPENDENCY_ERROR' as const;

  constructor(
    message: string,
    public readonly cycle: string[]
  ) {
    super(message, { cycle });
  }
}

/**
 * OrphanedEventError: Parent events were deleted or are unreachable
 */
export class OrphanedEventError extends DUSError {
  readonly severity = 'recoverable' as const;
  readonly code = 'ORPHANED_EVENT_ERROR' as const;

  constructor(
    message: string,
    public readonly eventId: string,
    public readonly orphanedParents: string[]
  ) {
    super(message, { eventId, orphanedParents });
  }
}

// ============================================================================
// Determinism Errors (Fatal)
// ============================================================================

/**
 * DeterminismError: Reducer produces different hashes for same event set
 */
export class DeterminismError extends DUSError {
  readonly severity = 'fatal' as const;
  readonly code = 'DETERMINISM_ERROR' as const;

  constructor(
    message: string,
    public readonly reducerVersion: string,
    public readonly hashA: string,
    public readonly hashB: string,
    public readonly topologyA?: string,
    public readonly topologyB?: string
  ) {
    super(message, { reducerVersion, hashA, hashB, topologyA, topologyB });
  }
}

/**
 * ReducerTypeError: Reducer doesn't conform to type signature
 */
export class ReducerTypeError extends DUSError {
  readonly severity = 'recoverable' as const;
  readonly code = 'REDUCER_TYPE_ERROR' as const;

  constructor(
    message: string,
    public readonly reducerVersion: string,
    public readonly issue: string
  ) {
    super(message, { reducerVersion, issue });
  }
}

/**
 * NonDeterministicReducerError: Reducer has side effects or hidden state
 */
export class NonDeterministicReducerError extends DUSError {
  readonly severity = 'fatal' as const;
  readonly code = 'NON_DETERMINISTIC_REDUCER_ERROR' as const;

  constructor(
    message: string,
    public readonly reducerVersion: string,
    public readonly detectionMethod: 'replay_mismatch' | 'topology_variance' | 'external_call'
  ) {
    super(message, { reducerVersion, detectionMethod });
  }
}

// ============================================================================
// Convergence Errors (Fatal)
// ============================================================================

/**
 * ConvergenceError: Honest replicas have diverged
 */
export class ConvergenceError extends DUSError {
  readonly severity = 'fatal' as const;
  readonly code = 'CONVERGENCE_ERROR' as const;

  constructor(
    message: string,
    public readonly replicaA: string,
    public readonly replicaB: string,
    public readonly stateHashA: string,
    public readonly stateHashB: string,
    public readonly eventSetSize: number
  ) {
    super(message, { replicaA, replicaB, stateHashA, stateHashB, eventSetSize });
  }
}

/**
 * StateMachineViolationError: Event transitions are invalid
 */
export class StateMachineViolationError extends DUSError {
  readonly severity = 'fatal' as const;
  readonly code = 'STATE_MACHINE_VIOLATION_ERROR' as const;

  constructor(
    message: string,
    public readonly currentState: string,
    public readonly attemptedTransition: string,
    public readonly allowedTransitions: string[]
  ) {
    super(message, { currentState, attemptedTransition, allowedTransitions });
  }
}

// ============================================================================
// Storage Errors (Recoverable -> Fatal)
// ============================================================================

/**
 * SnapshotError: Snapshot is corrupted or invalid
 */
export class SnapshotError extends DUSError {
  readonly severity: ErrorSeverity;
  readonly code = 'SNAPSHOT_ERROR' as const;

  constructor(
    message: string,
    severity: ErrorSeverity = 'recoverable',
    public readonly snapshotId?: string,
    public readonly expectedHash?: string,
    public readonly computedHash?: string
  ) {
    super(message, { snapshotId, expectedHash, computedHash });
    this.severity = severity;
  }
}

/**
 * MerkleRootError: Event log tampering detected
 */
export class MerkleRootError extends DUSError {
  readonly severity = 'fatal' as const;
  readonly code = 'MERKLE_ROOT_ERROR' as const;

  constructor(
    message: string,
    public readonly expectedRoot: string,
    public readonly computedRoot: string,
    public readonly eventCount: number
  ) {
    super(message, { expectedRoot, computedRoot, eventCount });
  }
}

/**
 * StorageIOError: Disk read/write failure
 */
export class StorageIOError extends DUSError {
  readonly severity: ErrorSeverity;
  readonly code = 'STORAGE_IO_ERROR' as const;

  constructor(
    message: string,
    public readonly operation: 'read' | 'write' | 'fsync',
    public readonly filePath: string,
    public readonly osError?: NodeJS.ErrnoException
  ) {
    const isTransient = osError?.code === 'ENOSPC' || osError?.code === 'EAGAIN';
    super(message, { operation, filePath, osError: osError?.message });
    this.severity = isTransient ? 'transient' : 'recoverable';
  }
}

// ============================================================================
// Network Errors (Transient)
// ============================================================================

/**
 * GossipError: Peer communication failure
 */
export class GossipError extends DUSError {
  readonly severity = 'transient' as const;
  readonly code = 'GOSSIP_ERROR' as const;

  constructor(
    message: string,
    public readonly peerId: string,
    public readonly endpoint: string,
    public readonly timeoutMs?: number
  ) {
    super(message, { peerId, endpoint, timeoutMs });
  }
}

/**
 * NetworkPartitionError: Cluster is partitioned
 */
export class NetworkPartitionError extends DUSError {
  readonly severity = 'transient' as const;
  readonly code = 'NETWORK_PARTITION_ERROR' as const;

  constructor(
    message: string,
    public readonly reachablePeers: string[],
    public readonly unreachablePeers: string[],
    public readonly durationMs?: number
  ) {
    super(message, { reachablePeers, unreachablePeers, durationMs });
  }
}

/**
 * SyncError: Synchronization with peer failed
 */
export class SyncError extends DUSError {
  readonly severity = 'transient' as const;
  readonly code = 'SYNC_ERROR' as const;

  constructor(
    message: string,
    public readonly peerId: string,
    public readonly phase: 'request' | 'transfer' | 'verification',
    public readonly lastEventReceived?: string
  ) {
    super(message, { peerId, phase, lastEventReceived });
  }
}

// ============================================================================
// Clock Errors (Transient)
// ============================================================================

/**
 * ClockError: Time-related inconsistency detected
 */
export class ClockError extends DUSError {
  readonly severity = 'transient' as const;
  readonly code = 'CLOCK_ERROR' as const;

  constructor(
    message: string,
    public readonly nodeId: string,
    public readonly skewMs: number,
    public readonly lamportTimestamp?: bigint
  ) {
    super(message, { nodeId, skewMs, lamportTimestamp: lamportTimestamp?.toString() });
  }
}

/**
 * TimeRewindError: Local time moved backward
 */
export class TimeRewindError extends DUSError {
  readonly severity = 'transient' as const;
  readonly code = 'TIME_REWIND_ERROR' as const;

  constructor(
    message: string,
    public readonly previousTime: number,
    public readonly currentTime: number,
    public readonly rewindMs: number
  ) {
    super(message, { previousTime, currentTime, rewindMs });
  }
}

// ============================================================================
// Recovery Strategies
// ============================================================================

export type RecoveryAction = 
  | { action: 'retry'; delayMs: number; maxAttempts?: number }
  | { action: 'fallback'; fallbackValue: unknown }
  | { action: 'skip'; reason: string }
  | { action: 'buffer'; bufferId: string }
  | { action: 'request_sync'; peerId?: string }
  | { action: 'rollback'; snapshotId: string }
  | { action: 'halt'; reason: string };

/**
 * Error recovery handler with configurable strategies
 */
export class ErrorRecoveryHandler {
  private retryAttempts = new Map<string, number>();
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 100;

  async handle(error: DUSError): Promise<RecoveryAction> {
    switch (error.code) {
      // Transient errors -> retry with backoff
      case 'CAUSALITY_ERROR':
      case 'GOSSIP_ERROR':
      case 'SYNC_ERROR':
      case 'NETWORK_PARTITION_ERROR':
      case 'CLOCK_ERROR':
      case 'TIME_REWIND_ERROR':
        return this.retryTransient(error);

      // Recoverable errors -> fallback or skip
      case 'VALIDATION_ERROR':
      case 'INVALID_EVENT_ERROR':
      case 'SIGNATURE_VERIFICATION_ERROR':
      case 'ORPHANED_EVENT_ERROR':
      case 'REDUCER_TYPE_ERROR':
        return { action: 'skip', reason: error.message };

      case 'STORAGE_IO_ERROR':
        if (error.severity === 'transient') {
          return this.retryTransient(error);
        }
        return { action: 'halt', reason: 'Persistent storage failure' };

      case 'SNAPSHOT_ERROR':
        return { action: 'rollback', snapshotId: (error as SnapshotError).snapshotId || 'latest' };

      // Fatal errors -> halt
      case 'DETERMINISM_ERROR':
      case 'NON_DETERMINISTIC_REDUCER_ERROR':
      case 'CYCLIC_DEPENDENCY_ERROR':
      case 'CONVERGENCE_ERROR':
      case 'STATE_MACHINE_VIOLATION_ERROR':
      case 'MERKLE_ROOT_ERROR':
        return { action: 'halt', reason: error.message };

      default:
        return { action: 'halt', reason: `Unknown error: ${error.code}` };
    }
  }

  private retryTransient(error: DUSError): RecoveryAction {
    const key = error.code;
    const attempts = (this.retryAttempts.get(key) ?? 0) + 1;

    if (attempts > this.maxRetries) {
      return { action: 'halt', reason: `Max retries exceeded for ${error.code}` };
    }

    this.retryAttempts.set(key, attempts);
    const delayMs = this.baseDelayMs * Math.pow(2, attempts - 1);

    return { 
      action: 'retry', 
      delayMs,
      maxAttempts: this.maxRetries - attempts + 1
    };
  }

  resetRetries(code: ErrorCode) {
    this.retryAttempts.delete(code);
  }
}

// ============================================================================
// Audit and Metrics
// ============================================================================

export interface ErrorMetrics {
  totalErrors: number;
  byCode: Record<string, number>;
  bySeverity: Record<ErrorSeverity, number>;
  lastError?: DUSError;
  lastErrorTime?: string;
}

/**
 * Error auditor for operational visibility
 */
export class ErrorAuditor {
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    byCode: {},
    bySeverity: { transient: 0, recoverable: 0, fatal: 0 }
  };

  private readonly errorLog: DUSError[] = [];
  private readonly maxLogSize = 1000;

  record(error: DUSError) {
    this.metrics.totalErrors++;
    this.metrics.byCode[error.code] = (this.metrics.byCode[error.code] ?? 0) + 1;
    this.metrics.bySeverity[error.severity]++;
    this.metrics.lastError = error;
    this.metrics.lastErrorTime = error.timestamp;

    this.errorLog.push(error);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }

  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  getRecentErrors(count = 10): DUSError[] {
    return this.errorLog.slice(-count);
  }

  getCriticalErrors(): DUSError[] {
    return this.errorLog.filter(e => e.severity === 'fatal');
  }

  exportJSON() {
    return {
      metrics: this.metrics,
      recentErrors: this.errorLog.slice(-20),
      criticalErrors: this.getCriticalErrors()
    };
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isDUSError(value: unknown): value is DUSError {
  return value instanceof DUSError;
}

export function isTransient(error: DUSError): boolean {
  return error.severity === 'transient';
}

export function isRecoverable(error: DUSError): boolean {
  return error.severity === 'recoverable';
}

export function isFatal(error: DUSError): boolean {
  return error.severity === 'fatal';
}
