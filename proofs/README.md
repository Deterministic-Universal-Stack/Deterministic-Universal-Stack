# Proofs

This directory holds lightweight formal artifacts that connect the implementation to explicit proof obligations.

Contents:

- `DeterministicReplay.tla` sketches the replay safety model
- the executable tests in `../tests` act as proof-carrying regression checks
- the markdown documents in `../docs` state the invariants in reviewable prose

This is not a claim of complete mechanized verification. It is a claim that the repository states its theorems clearly enough that deeper formalization can continue without rewriting the architecture first.
