---- MODULE DeterministicReplay ----
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Events, Parents, Reducer, InitialState

ASSUME /\ Events /= {}
       /\ \A e \in Events : Parents[e] \subseteq Events

Closed(S) ==
  \A e \in S :
    Parents[e] \subseteq S

Topological(S, seq) ==
  /\ Len(seq) = Cardinality(S)
  /\ \A i, j \in 1..Len(seq) :
       i < j => ~(seq[j] \in Parents[seq[i]])

Replay(seq) ==
  FoldLeft(Reducer, InitialState, seq)

Deterministic ==
  \A S \in SUBSET Events :
    Closed(S) =>
      \A a, b :
        Topological(S, a) /\ Topological(S, b) =>
          Replay(a) = Replay(b)

=============================================================================
