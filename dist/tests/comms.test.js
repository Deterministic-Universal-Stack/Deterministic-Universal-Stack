import { describe, expect, it } from "vitest";
import { CommunicationRuntime } from "@dus/comms";
describe("dus communications runtime", () => {
    it("tracks peers, signaling, chat, and deterministic communication state", () => {
        const runtime = new CommunicationRuntime("node-a", "room-1");
        runtime.startSession(1);
        runtime.peerJoined({
            userId: "alice",
            displayName: "Alice",
            joinedAt: 2
        });
        runtime.peerJoined({
            userId: "bob",
            displayName: "Bob",
            joinedAt: 3
        });
        runtime.signaling({
            kind: "offer",
            fromUserId: "alice",
            toUserId: "bob",
            payload: "{\"type\":\"offer\"}",
            createdAt: 4
        });
        runtime.chat({
            id: "m1",
            fromUserId: "alice",
            body: "hello",
            createdAt: 5
        });
        runtime.peerConnection({
            userId: "bob",
            connectionState: "connected"
        }, 6);
        const state = runtime.getState();
        expect(state.status).toBe("connected");
        expect(state.peers.alice.displayName).toBe("Alice");
        expect(state.signaling).toHaveLength(1);
        expect(state.chat[0].body).toBe("hello");
        expect(state.timelineHash.length).toBe(64);
    });
});
//# sourceMappingURL=comms.test.js.map