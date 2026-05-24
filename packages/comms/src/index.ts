import { DUS, canonicalHash, stringifyWithBigInt, type Event, type Reducer } from "@dus/core";
import { EventLog } from "@dus/eventlog";

export interface PeerProfile {
  userId: string;
  displayName: string;
  joinedAt: number;
  audioEnabled: boolean;
  videoEnabled: boolean;
  connectionState: "idle" | "connecting" | "connected" | "disconnected";
}

export interface SignalingEnvelope {
  kind: "offer" | "answer" | "ice";
  fromUserId: string;
  toUserId?: string;
  payload: string;
  createdAt: number;
}

export interface ChatEnvelope {
  id: string;
  fromUserId: string;
  body: string;
  createdAt: number;
}

export interface CommunicationState {
  roomId: string;
  status: "idle" | "negotiating" | "connected" | "ended";
  peers: Record<string, PeerProfile>;
  signaling: SignalingEnvelope[];
  chat: ChatEnvelope[];
  timelineHash: string;
}

export function createInitialCommunicationState(roomId: string): CommunicationState {
  return {
    roomId,
    status: "idle",
    peers: {},
    signaling: [],
    chat: [],
    timelineHash: canonicalHash({ roomId, peers: {}, signaling: [], chat: [] })
  };
}

type PeerJoinedPayload = {
  userId: string;
  displayName: string;
  joinedAt: number;
};

type PeerMediaPayload = {
  userId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
};

type PeerConnectionPayload = {
  userId: string;
  connectionState: PeerProfile["connectionState"];
};

type SignalingPayload = SignalingEnvelope;
type ChatPayload = ChatEnvelope;

export const communicationReducer: Reducer<CommunicationState> = (state, event) => {
  const next: CommunicationState = {
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
      const payload = event.payload as PeerJoinedPayload;
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
      const payload = event.payload as PeerMediaPayload;
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
      const payload = event.payload as PeerConnectionPayload;
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
      const payload = event.payload as SignalingPayload;
      next.signaling.push(payload);
      next.signaling = next.signaling.slice(-200);
      break;
    }
    case "comms/chat": {
      const payload = event.payload as ChatPayload;
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
  private readonly dus: DUS<CommunicationState>;
  private readonly log = new EventLog();

  constructor(nodeId: string, roomId: string) {
    this.dus = new DUS(nodeId, communicationReducer, {
      reducerVersion: "dus-comms@1",
      initialValue: createInitialCommunicationState(roomId)
    });
  }

  emit(type: string, payload: unknown, timestamp = Date.now()): Event {
    const event = this.dus.emit(type, payload, { timestamp, sessionId: this.dus.getState().value.roomId });
    this.log.append(event);
    return event;
  }

  sync(events: Iterable<Event>): void {
    this.dus.sync(events);
    this.log.appendMany(events);
  }

  startSession(timestamp = Date.now()): Event {
    return this.emit("comms/session_started", {}, timestamp);
  }

  peerJoined(payload: PeerJoinedPayload): Event {
    return this.emit("comms/peer_joined", payload, payload.joinedAt);
  }

  peerMedia(payload: PeerMediaPayload, timestamp = Date.now()): Event {
    return this.emit("comms/peer_media", payload, timestamp);
  }

  peerConnection(payload: PeerConnectionPayload, timestamp = Date.now()): Event {
    return this.emit("comms/peer_connection", payload, timestamp);
  }

  signaling(payload: SignalingPayload): Event {
    return this.emit("comms/signaling", payload, payload.createdAt);
  }

  chat(payload: ChatPayload): Event {
    return this.emit("comms/chat", payload, payload.createdAt);
  }

  endSession(timestamp = Date.now()): Event {
    return this.emit("comms/session_ended", {}, timestamp);
  }

  getState(): CommunicationState {
    return this.dus.getState().value;
  }

  getEvents(): Event[] {
    return this.dus.getEvents();
  }

  snapshot() {
    return this.dus.snapshot();
  }

  logSnapshot() {
    return this.log.snapshot(64);
  }
}

export function encodeHandshakeBundle(events: Event[]): string {
  return btoa(unescape(encodeURIComponent(stringifyWithBigInt({ events }, 0))));
}

export function decodeHandshakeBundle(bundle: string): Event[] {
  const parsed = JSON.parse(decodeURIComponent(escape(atob(bundle)))) as { events: Event[] };
  return parsed.events;
}
