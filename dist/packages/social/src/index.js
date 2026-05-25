import { DUS, canonicalHash } from "@dus/core";
export function createInitialSocialState(networkId, name) {
    return {
        networkId,
        name,
        profiles: {},
        posts: {},
        postOrder: [],
        follows: {},
        reactions: {},
        timelines: {}
    };
}
export const socialReducer = (state, event) => {
    const next = {
        networkId: state.value.networkId,
        name: state.value.name,
        profiles: { ...state.value.profiles },
        posts: Object.fromEntries(Object.entries(state.value.posts).map(([key, value]) => [key, { ...value }])),
        postOrder: [...state.value.postOrder],
        follows: { ...state.value.follows },
        reactions: Object.fromEntries(Object.entries(state.value.reactions).map(([key, value]) => [key, [...value]])),
        timelines: Object.fromEntries(Object.entries(state.value.timelines).map(([key, value]) => [key, [...value]]))
    };
    switch (event.type) {
        case "social/create_profile": {
            const payload = event.payload;
            next.profiles[payload.userId] = payload;
            next.timelines[payload.userId] = next.timelines[payload.userId] ?? [];
            break;
        }
        case "social/follow": {
            const payload = event.payload;
            next.follows[`${payload.followerId}:${payload.followeeId}`] = payload;
            next.timelines[payload.followerId] = next.timelines[payload.followerId] ?? [];
            break;
        }
        case "social/post": {
            const payload = event.payload;
            next.posts[payload.postId] = {
                postId: payload.postId,
                authorId: payload.authorId,
                body: payload.body,
                createdAt: payload.createdAt,
                replyToPostId: payload.replyToPostId,
                attachmentHtml: payload.attachmentHtml,
                likeCount: 0
            };
            next.postOrder.unshift(payload.postId);
            for (const userId of Object.keys(next.profiles)) {
                const followsAuthor = payload.authorId === userId || !!next.follows[`${userId}:${payload.authorId}`];
                if (followsAuthor) {
                    next.timelines[userId] = [payload.postId, ...(next.timelines[userId] ?? [])].slice(0, 100);
                }
            }
            break;
        }
        case "social/react": {
            const payload = event.payload;
            const existing = next.reactions[payload.postId] ?? [];
            existing.push(payload);
            next.reactions[payload.postId] = existing;
            const post = next.posts[payload.postId];
            if (post && payload.kind === "like") {
                post.likeCount += 1;
            }
            break;
        }
        default:
            break;
    }
    return {
        value: next,
        hash: canonicalHash(next),
        eventCount: state.eventCount + 1n
    };
};
export class SocialRuntime {
    dus;
    constructor(nodeId, networkId, name) {
        this.dus = new DUS(nodeId, socialReducer, {
            reducerVersion: "dus-social@1",
            initialValue: createInitialSocialState(networkId, name)
        });
    }
    emit(type, payload, timestamp = Date.now()) {
        return this.dus.emit(type, payload, { timestamp, sessionId: this.dus.getState().value.networkId });
    }
    createProfile(payload) {
        return this.emit("social/create_profile", payload, payload.joinedAt);
    }
    follow(payload) {
        return this.emit("social/follow", payload, payload.followedAt);
    }
    post(payload) {
        return this.emit("social/post", payload, payload.createdAt);
    }
    react(payload) {
        return this.emit("social/react", payload, payload.createdAt);
    }
    getState() {
        return this.dus.getState().value;
    }
    snapshot() {
        return this.dus.snapshot();
    }
}
//# sourceMappingURL=index.js.map