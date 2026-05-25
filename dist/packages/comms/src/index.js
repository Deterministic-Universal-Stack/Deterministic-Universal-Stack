import { DUS, canonicalHash, stringifyWithBigInt } from "@dus/core";
import { EventLog } from "@dus/eventlog";
export function createInitialCommunicationState(roomId) {
    return {
        roomId,
        status: "idle",
        peers: {},
        signaling: [],
        chat: [],
        timelineHash: canonicalHash({ roomId, peers: {}, signaling: [], chat: [] })
    };
}
export const communicationReducer = (state, event) => {
    const next = {
        roomId: state.value.roomId,
        status: state.value.status,
        peers: Object.fromEntries(Object.entries(state.value.peers).map(([key, value]) => [key, { ...value }])),
        signaling: [...state.value.signaling],
        chat: [...state.value.chat],
        timelineHash: state.value.timelineHash
    };
    switch (event.type) {
        case "comms/session_started": {
            next.status = "negotiating";
            break;
        }
        case "comms/peer_joined": {
            const payload = event.payload;
            next.peers[payload.userId] = {
                userId: payload.userId,
                displayName: payload.displayName,
                joinedAt: payload.joinedAt,
                audioEnabled: true,
                videoEnabled: true,
                connectionState: "connecting"
            };
            if (next.status === "idle") {
                next.status = "negotiating";
            }
            break;
        }
        case "comms/peer_media": {
            const payload = event.payload;
            const existing = next.peers[payload.userId];
            if (existing) {
                next.peers[payload.userId] = {
                    ...existing,
                    audioEnabled: payload.audioEnabled,
                    videoEnabled: payload.videoEnabled
                };
            }
            break;
        }
        case "comms/peer_connection": {
            const payload = event.payload;
            const existing = next.peers[payload.userId];
            if (existing) {
                next.peers[payload.userId] = {
                    ...existing,
                    connectionState: payload.connectionState
                };
            }
            if (Object.values(next.peers).some((peer) => peer.connectionState === "connected")) {
                next.status = "connected";
            }
            break;
        }
        case "comms/signaling": {
            const payload = event.payload;
            next.signaling.push(payload);
            next.signaling = next.signaling.slice(-200);
            break;
        }
        case "comms/chat": {
            const payload = event.payload;
            next.chat.push(payload);
            next.chat = next.chat.slice(-100);
            break;
        }
        case "comms/session_ended": {
            next.status = "ended";
            break;
        }
        default:
            break;
    }
    next.timelineHash = canonicalHash({
        roomId: next.roomId,
        status: next.status,
        peers: next.peers,
        signaling: next.signaling,
        chat: next.chat
    });
    return {
        value: next,
        hash: canonicalHash(next),
        eventCount: state.eventCount + 1n
    };
};
export class CommunicationRuntime {
    dus;
    log = new EventLog();
    constructor(nodeId, roomId) {
        this.dus = new DUS(nodeId, communicationReducer, {
            reducerVersion: "dus-comms@1",
            initialValue: createInitialCommunicationState(roomId)
        });
    }
    emit(type, payload, timestamp = Date.now()) {
        const event = this.dus.emit(type, payload, { timestamp, sessionId: this.dus.getState().value.roomId });
        this.log.append(event);
        return event;
    }
    sync(events) {
        this.dus.sync(events);
        this.log.appendMany(events);
    }
    startSession(timestamp = Date.now()) {
        return this.emit("comms/session_started", {}, timestamp);
    }
    peerJoined(payload) {
        return this.emit("comms/peer_joined", payload, payload.joinedAt);
    }
    peerMedia(payload, timestamp = Date.now()) {
        return this.emit("comms/peer_media", payload, timestamp);
    }
    peerConnection(payload, timestamp = Date.now()) {
        return this.emit("comms/peer_connection", payload, timestamp);
    }
    signaling(payload) {
        return this.emit("comms/signaling", payload, payload.createdAt);
    }
    chat(payload) {
        return this.emit("comms/chat", payload, payload.createdAt);
    }
    endSession(timestamp = Date.now()) {
        return this.emit("comms/session_ended", {}, timestamp);
    }
    getState() {
        return this.dus.getState().value;
    }
    getEvents() {
        return this.dus.getEvents();
    }
    snapshot() {
        return this.dus.snapshot();
    }
    logSnapshot() {
        return this.log.snapshot(64);
    }
}
export function encodeHandshakeBundle(events) {
    return btoa(unescape(encodeURIComponent(stringifyWithBigInt({ events }, 0))));
}
export function decodeHandshakeBundle(bundle) {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(bundle))));
    return parsed.events;
}
//# sourceMappingURL=index.js.map