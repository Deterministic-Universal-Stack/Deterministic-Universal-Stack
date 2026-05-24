import { type Event } from "@dus/core";
export declare function shannonEntropy(counts: Iterable<number>): number;
export declare function leastUpperBound<T>(left: Set<T>, right: Set<T>): Set<T>;
export declare function jaccardDistance<T>(left: Set<T>, right: Set<T>): number;
export declare function verifyJoinSemilattice<T>(a: Set<T>, b: Set<T>, c: Set<T>): boolean;
export declare function sameSet<T>(left: Set<T>, right: Set<T>): boolean;
export declare function validCausalOrders(events: Event[]): Event[][];
//# sourceMappingURL=index.d.ts.map