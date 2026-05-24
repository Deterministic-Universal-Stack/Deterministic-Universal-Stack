# Architecture

## One Canonical Stack

This repository intentionally collapses DUS into one clean, reviewable stack:

1. Event Layer
2. Reduction Layer
3. Synchronization Layer
4. Persistence Layer
5. Runtime Layer
6. Verification Layer

The earlier repository variants mixed specification, demos, mirrored source trees, and speculative layers. This repository replaces that with one source of truth.

## Event Layer

Events are immutable, content-addressed records:

```ts
type Event = {
  id: string;
  type: string;
  payload: unknown;
  parents: string[];
  metadata: {
    timestamp: number;
    nodeId: string;
    sessionId: string;
    lamport: bigint;
    vectorClock: Record<string, bigint>;
  };
  hash: string;
  signature?: string;
};
```

Properties:

- append-only
- parent-linked by causal dependency
- canonically serialized before hashing
- optionally signed

## Reduction Layer

Reducers are pure functions:

```ts
Reducer(state, event) -> nextState
```

A valid reducer must satisfy:

- determinism
- replay equivalence
- no hidden mutable dependencies
- stable state hashing

## Synchronization Layer

Replicas exchange missing events, not private rewritten state. Sync is semilattice merge over event sets:

```text
merge(E1, E2) = E1 union E2
```

When each replica then computes `Phi(closure(E))`, convergence follows from:

- identical event IDs
- identical causal parents
- identical topological replay rule
- identical reducer version

## Persistence Layer

Storage is split conceptually into two responsibilities:

- durable event log persistence
- integrity attestation over persisted history

This repo uses a filesystem-backed persisted log plus a Merkle root over the canonical event order.

## Runtime Layer

The runtime package demonstrates that higher-order systems can still be built on this substrate. The included deterministic agent runtime records planning and action traces as ordinary DUS events, which means even AI workflow state remains replayable and branchable.

## Verification Layer

The repository treats verification as product code:

- unit tests for deterministic replay
- convergence tests for replica sync
- storage verification tests
- proof-oriented algebraic tests
- documented formal invariants and proof sketches

## Enterprise Reading

For enterprise adoption, the important point is not that DUS replaces every service immediately. It is that DUS creates a narrower and more auditable correctness core than conventional mutable service stacks. That gives operators and auditors a concrete trust surface:

- event schema
- replay algorithm
- reducer versioning
- integrity roots
- conformance tests
