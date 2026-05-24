import { canonicalEventOrder, type Event } from "@dus/core";

export function shannonEntropy(counts: Iterable<number>): number {
  const values = [...counts].filter((value) => value > 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return 0;
  }

  return values.reduce((entropy, count) => {
    const p = count / total;
    return entropy - p * Math.log2(p);
  }, 0);
}

export function leastUpperBound<T>(left: Set<T>, right: Set<T>): Set<T> {
  return new Set([...left, ...right]);
}

export function jaccardDistance<T>(left: Set<T>, right: Set<T>): number {
  if (left.size === 0 && right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : (union - intersection) / union;
}

export function verifyJoinSemilattice<T>(a: Set<T>, b: Set<T>, c: Set<T>): boolean {
  const ab = leastUpperBound(a, b);
  const ba = leastUpperBound(b, a);
  const leftAssoc = leastUpperBound(ab, c);
  const rightAssoc = leastUpperBound(a, leastUpperBound(b, c));
  const idem = leastUpperBound(a, a);

  return (
    sameSet(ab, ba) &&
    sameSet(leftAssoc, rightAssoc) &&
    sameSet(idem, a)
  );
}

export function sameSet<T>(left: Set<T>, right: Set<T>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

export function validCausalOrders(events: Event[]): Event[][] {
  const ordered = canonicalEventOrder(events);
  return [ordered, [...ordered].reverse().sort((a, b) => ordered.findIndex((candidate) => candidate.id === a.id) - ordered.findIndex((candidate) => candidate.id === b.id))];
}
