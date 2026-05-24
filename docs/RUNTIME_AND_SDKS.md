# Runtime, Replay, Event Logs, SDKs, and Demos

This repository now includes the missing execution-facing pieces needed to make DUS feel like a usable platform rather than only a foundation.

## Deterministic Runtime Prototype

The deterministic runtime prototype is implemented in the existing runtime package and demonstrated in:

- [packages/runtime/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/packages/runtime/src/index.ts)
- [apps/runtime-prototype/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/apps/runtime-prototype/src/index.ts)

It models a simple instruction machine where each step is an immutable event and the final machine state is replay-derived.

## Replay Engine

The replay engine is now split into its own package:

- [packages/replay/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/packages/replay/src/index.ts)

It supports:

- deterministic replay over a causal event set
- checkpoint generation
- replay from checkpoints

## Event Log Architecture

The event log architecture is now explicit:

- [packages/eventlog/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/packages/eventlog/src/index.ts)

It provides:

- append-only canonical event storage
- Merkle root derivation
- segmented snapshots for large histories
- exportable line-oriented history format

## SDKs

The SDK layer now lives in:

- [packages/sdk/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/packages/sdk/src/index.ts)

It re-exports the core DUS surfaces in one import path so application builders can use:

- core runtime
- replay engine
- event log
- deterministic runtimes
- network sync helpers
- storage utilities

## Benchmark Suite

A simple benchmark suite now exists in:

- [scripts/benchmarks.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/scripts/benchmarks.ts)

Run:

```bash
npm run bench
```

Current benchmark focus:

- event emission throughput
- replay cost
- checkpoint density

## Distributed Synchronization Demo

The distributed synchronization demo now lives in:

- [apps/sync-demo/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/apps/sync-demo/src/index.ts)

Run:

```bash
npm run sync-demo
```

It demonstrates three replicas starting with divergent local events and then converging by gossip exchange.
