import { type Event, type Reducer } from "@dus/core";
export interface SocialProfile {
    userId: string;
    displayName: string;
    bio: string;
    joinedAt: number;
}
export interface SocialPost {
    postId: string;
    authorId: string;
    body: string;
    createdAt: number;
    replyToPostId?: string;
    attachmentHtml?: string;
    likeCount: number;
}
export interface FollowEdge {
    followerId: string;
    followeeId: string;
    followedAt: number;
}
export interface Reaction {
    reactionId: string;
    postId: string;
    userId: string;
    kind: "like" | "boost" | "witness";
    createdAt: number;
}
export interface SocialFeedState {
    networkId: string;
    name: string;
    profiles: Record<string, SocialProfile>;
    posts: Record<string, SocialPost>;
    postOrder: string[];
    follows: Record<string, FollowEdge>;
    reactions: Record<string, Reaction[]>;
    timelines: Record<string, string[]>;
}
export declare function createInitialSocialState(networkId: string, name: string): SocialFeedState;
type ProfilePayload = SocialProfile;
type PostPayload = {
    postId: string;
    authorId: string;
    body: string;
    createdAt: number;
    replyToPostId?: string;
    attachmentHtml?: string;
};
type FollowPayload = FollowEdge;
type ReactionPayload = Reaction;
export declare const socialReducer: Reducer<SocialFeedState>;
export declare class SocialRuntime {
    private readonly dus;
    constructor(nodeId: string, networkId: string, name: string);
    emit(type: string, payload: unknown, timestamp?: number): Event;
    createProfile(payload: ProfilePayload): Event;
    follow(payload: FollowPayload): Event;
    post(payload: PostPayload): Event;
    react(payload: ReactionPayload): Event;
    getState(): SocialFeedState;
    snapshot(): import("@dus/core").Snapshot<SocialFeedState>;
}
export {};
//# sourceMappingURL=index.d.ts.map