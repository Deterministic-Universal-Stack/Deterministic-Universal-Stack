import { describe, expect, it } from "vitest";
import { createState } from "@dus/core";
import { collaborationReducer, createInitialCollaborationState, defaultHtml, extractHtmlBlock, normalizeGitHubContentUrl } from "../apps/collab/src/shared.js";
describe("collaborative html room reducer", () => {
    it("tracks joins, edits, chat, and witness suggestions deterministically", () => {
        let state = createState(createInitialCollaborationState("hello"));
        state = collaborationReducer(state, {
            id: "1",
            type: "collab/join",
            payload: {
                userId: "a",
                displayName: "James",
                color: "#b55d32",
                joinedAt: 1
            },
            parents: [],
            metadata: {
                timestamp: 1,
                nodeId: "n",
                sessionId: "hello",
                lamport: 1n,
                vectorClock: { n: 1n }
            },
            hash: "1"
        });
        state = collaborationReducer(state, {
            id: "2",
            type: "doc/set_html",
            payload: {
                userId: "a",
                displayName: "James",
                html: "<html><body>Hello</body></html>",
                title: "Greeting",
                editedAt: 2
            },
            parents: ["1"],
            metadata: {
                timestamp: 2,
                nodeId: "n",
                sessionId: "hello",
                lamport: 2n,
                vectorClock: { n: 2n }
            },
            hash: "2"
        });
        state = collaborationReducer(state, {
            id: "3",
            type: "chat/post",
            payload: {
                id: "chat1",
                userId: "a",
                displayName: "James",
                body: "hello friend",
                timestamp: 3
            },
            parents: ["2"],
            metadata: {
                timestamp: 3,
                nodeId: "n",
                sessionId: "hello",
                lamport: 3n,
                vectorClock: { n: 3n }
            },
            hash: "3"
        });
        expect(state.value.collaborators.a.displayName).toBe("James");
        expect(state.value.title).toBe("Greeting");
        expect(state.value.chat).toHaveLength(1);
        expect(state.hash.length).toBe(64);
    });
    it("provides a friendly default html bootstrap", () => {
        expect(defaultHtml("lobby")).toContain("Hello from DUS");
        expect(defaultHtml("lobby")).toContain("lobby");
    });
    it("extracts suggested html from witness responses", () => {
        const html = extractHtmlBlock("Here you go:\n```html\n<div>Hello</div>\n```");
        expect(html).toBe("<div>Hello</div>");
    });
    it("normalizes GitHub blob URLs into raw content URLs", () => {
        expect(normalizeGitHubContentUrl("https://github.com/acme/site/blob/main/index.html")).toBe("https://raw.githubusercontent.com/acme/site/main/index.html");
    });
});
//# sourceMappingURL=collab.test.js.map