# Math Foundations

## Foundation Equation

```text
S = Phi(closure(E))
```

This equation is the entire architecture in compressed form.

- `E` is the known event set
- `closure(E)` is the causally closed set containing every dependency required for replay
- `Phi` is the deterministic reduction homomorphism
- `S` is the canonical state

## Structure 1: Event Histories as a Join-Semilattice

Let histories be modeled as finite sets of events ordered by subset inclusion.

Join:

```text
H1 join H2 = H1 union H2
```

Semilattice laws:

```text
H1 join H2 = H2 join H1
(H1 join H2) join H3 = H1 join (H2 join H3)
H join H = H
```

Meaning:

- merge is commutative
- merge is associative
- duplicate delivery is harmless

## Structure 2: Causality as a Poset

Define `e1 <= e2` iff `e1` is an ancestor of `e2` in the parent DAG.

This yields:

- reflexivity
- antisymmetry
- transitivity

If the graph is acyclic, causal order is well-defined.

## Structure 3: State as a Deterministic Fold

Let `R` be a reducer and `tau(E)` be a deterministic topological order of a causally closed event set. Then:

```text
Phi(E) = fold(R, S0, tau(E))
```

If `R` is pure and `tau` is deterministic, then `Phi` is deterministic.

## Structure 4: Replay Defensibility

For any two replicas `A` and `B`, if:

```text
closure(EA) = closure(EB)
reducerVersionA = reducerVersionB
```

then:

```text
Phi(EA) = Phi(EB)
stateHashA = stateHashB
```

This is the key system theorem.

## Divergence Metric

The sync layer uses Jaccard distance over known frontier IDs:

```text
D(A, B) = |FA union FB - FA intersection FB| / |FA union FB|
```

Where `FA` and `FB` are frontiers or known event sets.

Properties:

- `D = 0` means identical knowledge
- `D = 1` means disjoint knowledge

## Entropy

For any categorical state distribution:

```text
H = - sum(p_i log2 p_i)
```

Entropy is included because a decentralized substrate eventually has to care about organization cost, compression, and locality. In this repository it remains a measured quantity, not a magical optimization oracle.
