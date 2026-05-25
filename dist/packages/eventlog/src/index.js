import { canonicalHash, canonicalStringify } from "@dus/core";
import { merkleRoot } from "@dus/storage";
export class EventLog {
    events = new Map();
    append(event) {
        if (!this.events.has(event.id)) {
            this.events.set(event.id, event);
        }
    }
    appendMany(events) {
        for (const event of events) {
            this.append(event);
        }
    }
    list() {
        return [...this.events.values()].sort((a, b) => {
            const byTime = a.metadata.timestamp - b.metadata.timestamp;
            if (byTime !== 0)
                return byTime;
            return a.id.localeCompare(b.id);
        });
    }
    rootHash() {
        return merkleRoot(this.list());
    }
    segments(segmentSize = 128) {
        const ordered = this.list();
        const segments = [];
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
    snapshot(segmentSize = 128) {
        return {
            eventCount: this.events.size,
            rootHash: this.rootHash(),
            segments: this.segments(segmentSize)
        };
    }
    exportLines() {
        return this.list().map((event) => canonicalStringify(event)).join("\n");
    }
}
//# sourceMappingURL=index.js.map