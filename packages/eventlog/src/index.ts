import { canonicalHash, canonicalStringify, type Event } from "@dus/core";
import { merkleRoot } from "@dus/storage";

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

export class EventLog {
  private readonly events = new Map<string, Event>();

  append(event: Event): void {
    if (!this.events.has(event.id)) {
      this.events.set(event.id, event);
    }
  }

  appendMany(events: Iterable<Event>): void {
    for (const event of events) {
      this.append(event);
    }
  }

  list(): Event[] {
    return [...this.events.values()].sort((a, b) => {
      const byTime = a.metadata.timestamp - b.metadata.timestamp;
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
  }

  rootHash(): string {
    return merkleRoot(this.list());
  }

  segments(segmentSize = 128): LogSegment[] {
    const ordered = this.list();
    const segments: LogSegment[] = [];
    for (let startIndex = 0; startIndex < ordered.length; startIndex += segmentSize) {
      const slice = ordered.slice(startIndex, startIndex + segmentSize);
      segments.push({
        segmentId: canonicalHash(slice.map((event) => event.id)),
        startIndex,
        endIndex: startIndex + slice.length - 1,
        rootHash: merkleRoot(slice),
        eventIds: slice.map((event) => event.id)
      });
    }
    return segments;
  }

  snapshot(segmentSize = 128): EventLogSnapshot {
    return {
      eventCount: this.events.size,
      rootHash: this.rootHash(),
      segments: this.segments(segmentSize)
    };
  }

  exportLines(): string {
    return this.list().map((event) => canonicalStringify(event)).join("\n");
  }
}
