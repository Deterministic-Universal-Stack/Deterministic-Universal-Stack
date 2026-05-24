import { type Event } from "@dus/core";
export interface StoreConfig {
    rootDir: string;
}
export interface PersistedLog {
    reducerVersion: string;
    events: Event[];
    rootHash: string;
}
export declare function merkleRoot(events: Event[]): string;
export declare class FileSystemEventStore {
    private readonly config;
    constructor(config: StoreConfig);
    saveLog(name: string, reducerVersion: string, events: Event[]): Promise<PersistedLog>;
    loadLog(name: string): Promise<PersistedLog>;
    listLogs(): Promise<string[]>;
    verifyLog(name: string): Promise<boolean>;
}
//# sourceMappingURL=index.d.ts.map