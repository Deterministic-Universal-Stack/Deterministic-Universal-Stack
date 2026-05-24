# Deterministic Universal Stack

Deterministic Universal Stack, or DUS, is a fresh, unified repository for a decentralized computation substrate built around one hard claim: if replicas share the same causally closed event set and the same reducer version, they must derive the same state hash. The goal of this repository is to make that claim executable, testable, and reviewable enough that the conversation can move from "does it work?" to "should the internet be rebuilt this way?"

This repo is intentionally narrower and cleaner than the earlier DUS material. It chooses one canonical implementation path, one event model, one replay engine, one storage story, one sync story, and one proof narrative. The surrounding documents are written to remove ambiguity for engineers, researchers, and skeptics.

## Design Position

DUS treats computation as deterministic causal propagation over immutable event structures.

The foundation equation is:

```text
S = Phi(closure(E))
```

Where:

- `E` is the event set
- `closure(E)` is the causally closed history
- `Phi` is the deterministic reducer
- `S` is the canonical derived state

## Repository Layout

```text
packages/
  core/      canonical event model, replay engine, verifier
  math/      entropy, semilattice helpers, proof support
  network/   gossip convergence and BFT quorum helpers
  runtime/   deterministic agent and workflow runtime
  storage/   filesystem persistence and Merkle log verification
apps/
  cli/       replay and persistence utility
  playground/ demo composition of the full stack
tests/       executable invariants and proof-oriented tests
docs/        architecture, formal invariants, conformance, thesis docs
proofs/      TLA+ style spec fragments and proof notes
```

## Why This Exists

The internet drifted toward centralization because mutable databases, opaque orchestration layers, and trust-based operational shortcuts were easier to ship than provable distributed correctness. DUS argues for a different default:

- state should be derived, not directly mutated
- history should be immutable and replayable
- synchronization should exchange causal facts, not private truth
- integrity should be cryptographically checkable
- determinism should be a product property, not a wish

## What Is Executable Here

- content-addressed immutable events
- causal parent tracking
- deterministic replay and snapshot recovery
- idempotent merge by event-set union
- divergence-aware gossip simulation
- Merkle-root-backed persistent logs
- deterministic branchable agent timelines
- algebraic and convergence tests

## Quick Start

```bash
npm install
npm run verify
npm run demo
```

## Core Guarantees

| Guarantee | Meaning | Where Shown |
| --- | --- | --- |
| Replay determinism | Same closed history plus same reducer gives same state hash | `packages/core`, `tests/core.test.ts` |
| Eventual convergence | Replicas converge after exchanging missing events | `tests/core.test.ts`, `tests/network.test.ts` |
| Causal consistency | Parents replay before children | `packages/core/src/index.ts` |
| Tamper evidence | Persisted logs are Merkle-verifiable | `packages/storage`, `tests/storage.test.ts` |
| Reducer defensibility | Non-deterministic reducers are detectable | `packages/core/src/index.ts` |

## Intended Discussion

This repository is designed to support a stronger public discussion:

`Do we need a deterministic, event-derived alternative internet substrate?`

Not:

`Can this model be implemented at all?`

## Contact

- Builder: James Chapman
- Contact: xhecarpenxer@gmail.com
- Repository: [Deterministic-Universal-Stack/Deterministic-Universal-Stack](https://github.com/Deterministic-Universal-Stack/Deterministic-Universal-Stack)
