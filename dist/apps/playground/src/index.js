import { DUS, canonicalHash, stringifyWithBigInt } from "@dus/core";
const reducer = (state, event) => {
    const next = {
        entities: { ...state.value.entities },
        edges: { ...state.value.edges }
    };
    const payload = event.payload;
    switch (event.type) {
        case "create_entity":
            next.entities[String(payload.id)] = {
                type: String(payload.entityType),
                properties: payload.properties ?? {}
            };
            break;
        case "link":
            next.edges[`${payload.src}:${payload.relation}:${payload.dst}`] = {
                src: String(payload.src),
                dst: String(payload.dst),
                relation: String(payload.relation)
            };
            break;
        default:
            break;
    }
    return {
        value: next,
        hash: canonicalHash(next),
        eventCount: state.eventCount + 1n
    };
};
const dus = new DUS("playground-node", reducer, {
    reducerVersion: "dus-universe@1",
    initialValue: { entities: {}, edges: {} }
});
dus.emit("create_entity", {
    id: "deterministic_universal_stack",
    entityType: "protocol",
    properties: {
        mission: "Alternative internet substrate"
    }
}, { timestamp: 1 });
dus.emit("create_entity", {
    id: "causal_log",
    entityType: "primitive",
    properties: {
        role: "source of truth"
    }
}, { timestamp: 2 });
dus.emit("link", {
    src: "deterministic_universal_stack",
    dst: "causal_log",
    relation: "depends_on"
}, { timestamp: 3 });
console.log(stringifyWithBigInt(dus.snapshot(), 2));
//# sourceMappingURL=index.js.map