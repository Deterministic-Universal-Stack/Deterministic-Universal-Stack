export const stackLayers = [
    { id: "event", name: "Event Layer", capability: "Immutable content-addressed facts with causal parents.", guarantee: "No hidden mutable state is required." },
    { id: "reduction", name: "Reduction Layer", capability: "Pure reducers derive state from canonical event order.", guarantee: "Equal closed histories produce equal hashes." },
    { id: "sync", name: "Synchronization Layer", capability: "Replicas merge event sets by union.", guarantee: "Partitions heal through semilattice merge." },
    { id: "persistence", name: "Persistence Layer", capability: "Logs and roots attest persisted history.", guarantee: "State can be reconstructed from durable events." },
    { id: "runtime", name: "Runtime Layer", capability: "Programs and agents emit ordinary DUS events.", guarantee: "Workflows stay replayable and branchable." },
    { id: "verification", name: "Verification Layer", capability: "Proof harnesses exercise randomized distributed histories.", guarantee: "Correctness claims are executable." },
    { id: "projection", name: "Projection Layer", capability: "Apps and GUIs are derived views.", guarantee: "Interfaces do not become secret sources of truth." },
    { id: "polyglot", name: "Polyglot Layer", capability: "Bindings share event schema, canonical serialization, and replay rules.", guarantee: "Different runtimes interoperate without redefining truth." }
];
export const stackInvariants = [
    { id: "derived-state", statement: "State is derived, never privately mutated.", math: "S = Phi(closure(E))", layer: "reduction" },
    { id: "causal-closure", statement: "Applied events include causal dependencies.", math: "e in closure(E) implies parents(e) subset closure(E)", layer: "event" },
    { id: "join-merge", statement: "Replica sync is least-upper-bound merge over event sets.", math: "merge(E1,E2)=E1 union E2", layer: "sync" },
    { id: "replay-equivalence", statement: "Canonical replay regenerates the same state hash.", math: "replay(Phi,order(E))=S.hash", layer: "verification" },
    { id: "polyglot-contract", statement: "Every binding preserves canonical event semantics.", math: "decode_L(encode(E))=E", layer: "polyglot" }
];
export const stackApps = [
    { id: "proof", name: "Deterministic Proof Suite", kind: "legitimacy harness", command: "npm run prove", url: "/replay.html", layers: ["verification", "sync", "reduction"], invariantIds: ["derived-state", "join-merge", "replay-equivalence"] },
    { id: "collab", name: "Collab", kind: "event-derived editor", command: "npm run collab", url: "/app.html?id=collab", layers: ["event", "reduction", "runtime", "projection"], invariantIds: ["derived-state", "replay-equivalence"] },
    { id: "comms", name: "Comms", kind: "causal peer channel", command: "npm run comms", url: "/app.html?id=comms", layers: ["event", "sync", "projection"], invariantIds: ["causal-closure", "join-merge"] },
    { id: "forge", name: "Forge", kind: "branch algebra", command: "npm run forge", url: "/app.html?id=forge", layers: ["event", "reduction", "verification"], invariantIds: ["derived-state", "replay-equivalence"] },
    { id: "navigator", name: "Navigator", kind: "history projection", command: "npm run navigator", url: "/app.html?id=navigator", layers: ["event", "reduction", "projection"], invariantIds: ["derived-state"] },
    { id: "runtime", name: "Runtime Prototype", kind: "deterministic runtime", command: "npm run runtime-prototype", url: "/app.html?id=runtime", layers: ["runtime", "event", "verification"], invariantIds: ["derived-state", "replay-equivalence"] },
    { id: "social", name: "Social", kind: "graph reducer", command: "npm run social", url: "/app.html?id=social", layers: ["event", "reduction", "sync"], invariantIds: ["derived-state", "join-merge"] },
    { id: "sync", name: "Sync Demo", kind: "convergence proof", command: "npm run sync-demo", url: "/app.html?id=sync", layers: ["sync", "verification"], invariantIds: ["join-merge", "replay-equivalence"] },
    { id: "playground", name: "Playground", kind: "full-stack composition", command: "npm run demo", url: "/app.html?id=playground", layers: ["event", "reduction", "sync", "runtime", "projection", "polyglot"], invariantIds: ["derived-state", "causal-closure", "join-merge", "polyglot-contract"] }
];
export const languageBindings = [
    { id: "typescript", name: "TypeScript", status: "canonical" },
    { id: "browser-js", name: "Browser JavaScript", status: "integrated" },
    { id: "json", name: "Canonical JSON", status: "canonical" },
    { id: "future", name: "Future Rust/Python/Swift/Solidity bindings", status: "planned" }
];
export function describeSystemCapabilities() {
    return { layers: stackLayers, invariants: stackInvariants, apps: stackApps, languages: languageBindings };
}
//# sourceMappingURL=index.js.map