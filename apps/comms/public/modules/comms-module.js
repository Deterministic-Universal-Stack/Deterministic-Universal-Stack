const canonicalStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const canonicalHash = async (value) => {
  const data = new TextEncoder().encode(canonicalStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export class CommunicationRuntime {
  constructor(nodeId, roomId) {
    this.nodeId = nodeId;
    this.roomId = roomId;
    this.events = [];
    this.state = {
      roomId,
      status: "idle",
      peers: {},
      signaling: [],
      chat: [],
      timelineHash: "pending"
    };
  }

  async emit(type, payload, timestamp = Date.now()) {
    const parents = this.events.length > 0 ? [this.events[this.events.length - 1].id] : [];
    const metadata = {
      timestamp,
      nodeId: this.nodeId,
      sessionId: this.roomId,
      lamport: this.events.length + 1,
      vectorClock: { [this.nodeId]: this.events.length + 1 }
    };
    const hash = await canonicalHash({ type, payload, parents, metadata });
    const event = { id: hash, type, payload, parents, metadata, hash };
    if (!this.events.some((existing) => existing.id === event.id)) {
      this.events.push(event);
      await this.recompute();
    }
    return event;
  }

  async sync(events) {
    for (const event of events) {
      if (!this.events.some((existing) => existing.id === event.id)) {
        this.events.push(event);
      }
    }
    this.events.sort((a, b) => a.metadata.timestamp - b.metadata.timestamp || a.id.localeCompare(b.id));
    await this.recompute();
  }

  async recompute() {
    const next = {
      roomId: this.roomId,
      status: "idle",
      peers: {},
      signaling: [],
      chat: [],
      timelineHash: "pending"
    };

    for (const event of this.events) {
      switch (event.type) {
        case "comms/session_started":
          next.status = "negotiating";
          break;
        case "comms/peer_joined":
          next.peers[event.payload.userId] = {
            userId: event.payload.userId,
            displayName: event.payload.displayName,
            joinedAt: event.payload.joinedAt,
            audioEnabled: true,
            videoEnabled: true,
            connectionState: "connecting"
          };
          break;
        case "comms/peer_media":
          if (next.peers[event.payload.userId]) {
            next.peers[event.payload.userId].audioEnabled = event.payload.audioEnabled;
            next.peers[event.payload.userId].videoEnabled = event.payload.videoEnabled;
          }
          break;
        case "comms/peer_connection":
          next.peers[event.payload.userId] = next.peers[event.payload.userId] || {
            userId: event.payload.userId,
            displayName: event.payload.userId,
            joinedAt: event.metadata.timestamp,
            audioEnabled: true,
            videoEnabled: true,
            connectionState: "connecting"
          };
          next.peers[event.payload.userId].connectionState = event.payload.connectionState;
          if (event.payload.connectionState === "connected") {
            next.status = "connected";
          }
          break;
        case "comms/signaling":
          next.signaling.push(event.payload);
          break;
        case "comms/chat":
          next.chat.push(event.payload);
          break;
        case "comms/session_ended":
          next.status = "ended";
          break;
      }
    }

    next.timelineHash = await canonicalHash({
      roomId: next.roomId,
      status: next.status,
      peers: next.peers,
      signaling: next.signaling,
      chat: next.chat
    });
    this.state = next;
  }

  async startSession(timestamp = Date.now()) { return this.emit("comms/session_started", {}, timestamp); }
  async peerJoined(payload) { return this.emit("comms/peer_joined", payload, payload.joinedAt); }
  async peerMedia(payload, timestamp = Date.now()) { return this.emit("comms/peer_media", payload, timestamp); }
  async peerConnection(payload, timestamp = Date.now()) { return this.emit("comms/peer_connection", payload, timestamp); }
  async signaling(payload) { return this.emit("comms/signaling", payload, payload.createdAt); }
  async chat(payload) { return this.emit("comms/chat", payload, payload.createdAt); }
  async endSession(timestamp = Date.now()) { return this.emit("comms/session_ended", {}, timestamp); }
  getState() { return this.state; }
  getEvents() { return [...this.events]; }
  snapshot() { return { eventCount: this.events.length, stateHash: this.state.timelineHash }; }
  logSnapshot() { return { eventIds: this.events.map((event) => event.id) }; }
}

export function encodeHandshakeBundle(events) {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ events }))));
}

export function decodeHandshakeBundle(bundle) {
  return JSON.parse(decodeURIComponent(escape(atob(bundle)))).events;
}
