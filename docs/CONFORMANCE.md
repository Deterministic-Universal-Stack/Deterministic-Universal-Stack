# Conformance

A DUS implementation is conformant if it satisfies the following:

## Required

1. Events are immutable after publication.
2. Event identity is content-addressed.
3. Replay uses a deterministic topological order.
4. Reducers are versioned.
5. State hashes are canonical.
6. Duplicate event delivery is safe.
7. Parent references are checked during verification.
8. Snapshots include reducer version and state hash.

## Recommended

1. Signed events for authenticated domains.
2. Merkle-root-backed persistent logs.
3. Convergence tests across partitioned replicas.
4. Reducer validation in CI.
5. Formal proof notes shipped with the codebase.

## Current Repository Status

This repository implements every required item and every recommended item in a baseline form suitable for review, extension, and independent replication.
