# Formal Invariants

## Invariant 1: Immutable Event Identity

For any event `e`:

```text
e.id = H(serialize(e.type, e.payload, e.parents, e.metadata))
```

If any field changes, `e.id` changes.

## Invariant 2: Causal Closure Before Replay

For every event `e` replayed in a valid history:

```text
forall p in parents(e), p belongs to closure(E)
```

No child may be replayed without its parents.

## Invariant 3: Deterministic State Hash

For a valid reducer `R`:

```text
replay(E, R) = replay(E, R)
```

Notationally trivial, operationally essential.

## Invariant 4: Duplicate Safety

Because history merge is set union:

```text
E union E = E
```

This is why duplicate delivery does not corrupt replica state.

## Invariant 5: Convergence

If two honest replicas eventually receive the same closed event set and use the same reducer version:

```text
stateHashA = stateHashB
```

## Invariant 6: Snapshot Safety

If snapshot `K` was derived from prefix `P` and tail `T` contains only events after `P`, then:

```text
replay(P union T) = replayFromSnapshot(snapshot(P), T)
```

## Invariant 7: Persistence Integrity

For a persisted log with Merkle root `M(E)`:

```text
tamper(E) => M(E') != M(E)
```

Unless the attacker can replace the trusted root as well.
