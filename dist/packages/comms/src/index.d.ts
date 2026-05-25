import { type Event, type Reducer } from "@dus/core";
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
export declare function createInitialCommunicationState(roomId: string): CommunicationState;
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
export declare const communicationReducer: Reducer<CommunicationState>;
export declare class CommunicationRuntime {
    private readonly dus;
    private readonly log;
    constructor(nodeId: string, roomId: string);
    emit(type: string, payload: unknown, timestamp?: number): Event;
    sync(events: Iterable<Event>): void;
    startSession(timestamp?: number): Event;
    peerJoined(payload: PeerJoinedPayload): Event;
    peerMedia(payload: PeerMediaPayload, timestamp?: number): Event;
    peerConnection(payload: PeerConnectionPayload, timestamp?: number): Event;
    signaling(payload: SignalingPayload): Event;
    chat(payload: ChatPayload): Event;
    endSession(timestamp?: number): Event;
    getState(): CommunicationState;
    getEvents(): Event[];
    snapshot(): import("@dus/core").Snapshot<CommunicationState>;
    logSnapshot(): import("@dus/eventlog").EventLogSnapshot;
}
export declare function encodeHandshakeBundle(events: Event[]): string;
export declare function decodeHandshakeBundle(bundle: string): Event[];
export {};
//# sourceMappingURL=index.d.ts.map