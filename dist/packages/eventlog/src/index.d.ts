import { type Event } from "@dus/core";
export interface LogSegment {
    segmentId: string;
    startIndex: number;
    endIndex: number;
    rootHash: string;
    eventIds: string[];
}
export interface EventLogSnapshot {
    eventCount: number;
    rootHash: string;
    segments: LogSegment[];
}
export declare class EventLog {
    private readonly events;
    append(event: Event): void;
    appendMany(events: Iterable<Event>): void;
    list(): Event[];
    rootHash(): string;
    segments(segmentSize?: number): LogSegment[];
    snapshot(segmentSize?: number): EventLogSnapshot;
    exportLines(): string;
}
//# sourceMappingURL=index.d.ts.map