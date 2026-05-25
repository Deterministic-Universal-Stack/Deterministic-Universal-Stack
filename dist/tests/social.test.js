import { describe, expect, it } from "vitest";
import { SocialRuntime } from "@dus/social";
describe("dus social", () => {
    it("tracks profiles, follows, posts, reactions, and timelines deterministically", () => {
        const social = new SocialRuntime("node", "network-1", "Test Net");
        social.createProfile({
            userId: "alice",
            displayName: "Alice",
            bio: "Hello",
            joinedAt: 1
        });
        social.createProfile({
            userId: "bob",
            displayName: "Bob",
            bio: "World",
            joinedAt: 2
        });
        social.follow({
            followerId: "bob",
            followeeId: "alice",
            followedAt: 3
        });
        social.post({
            postId: "p1",
            authorId: "alice",
            body: "First post",
            createdAt: 4
        });
        social.react({
            reactionId: "r1",
            postId: "p1",
            userId: "bob",
            kind: "like",
            createdAt: 5
        });
        const state = social.getState();
        expect(state.postOrder[0]).toBe("p1");
        expect(state.posts.p1.likeCount).toBe(1);
        expect(state.timelines.bob).toContain("p1");
    });
});
//# sourceMappingURL=social.test.js.map