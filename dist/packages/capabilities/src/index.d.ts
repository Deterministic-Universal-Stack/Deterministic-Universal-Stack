export type StackLayerId = "event" | "reduction" | "sync" | "persistence" | "runtime" | "verification" | "projection" | "polyglot";
export interface StackInvariant {
    id: string;
    statement: string;
    math: string;
    layer: StackLayerId;
}
export interface StackLayer {
    id: StackLayerId;
    name: string;
    capability: string;
    guarantee: string;
}
export interface StackAppCapability {
    id: string;
    name: string;
    kind: string;
    command: string;
    url: string;
    layers: StackLayerId[];
    invariantIds: string[];
}
export declare const stackLayers: StackLayer[];
export declare const stackInvariants: StackInvariant[];
export declare const stackApps: StackAppCapability[];
export declare const languageBindings: readonly [{
    readonly id: "typescript";
    readonly name: "TypeScript";
    readonly status: "canonical";
}, {
    readonly id: "browser-js";
    readonly name: "Browser JavaScript";
    readonly status: "integrated";
}, {
    readonly id: "json";
    readonly name: "Canonical JSON";
    readonly status: "canonical";
}, {
    readonly id: "future";
    readonly name: "Future Rust/Python/Swift/Solidity bindings";
    readonly status: "planned";
}];
export declare function describeSystemCapabilities(): {
    layers: StackLayer[];
    invariants: StackInvariant[];
    apps: StackAppCapability[];
    languages: readonly [{
        readonly id: "typescript";
        readonly name: "TypeScript";
        readonly status: "canonical";
    }, {
        readonly id: "browser-js";
        readonly name: "Browser JavaScript";
        readonly status: "integrated";
    }, {
        readonly id: "json";
        readonly name: "Canonical JSON";
        readonly status: "canonical";
    }, {
        readonly id: "future";
        readonly name: "Future Rust/Python/Swift/Solidity bindings";
        readonly status: "planned";
    }];
};
//# sourceMappingURL=index.d.ts.map