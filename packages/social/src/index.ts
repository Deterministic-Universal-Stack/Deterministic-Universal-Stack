import { DUS, canonicalHash, type Event, type Reducer } from "@dus/core";

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

export function createInitialSocialState(networkId: string, name: string): SocialFeedState {
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

export const socialReducer: Reducer<SocialFeedState> = (state, event) => {
  const next: SocialFeedState = {
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
      const payload = event.payload as ProfilePayload;
      next.profiles[payload.userId] = payload;
      next.timelines[payload.userId] = next.timelines[payload.userId] ?? [];
      break;
    }
    case "social/follow": {
      const payload = event.payload as FollowPayload;
      next.follows[`${payload.followerId}:${payload.followeeId}`] = payload;
      next.timelines[payload.followerId] = next.timelines[payload.followerId] ?? [];
      break;
    }
    case "social/post": {
      const payload = event.payload as PostPayload;
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
      const payload = event.payload as ReactionPayload;
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
  private readonly dus: DUS<SocialFeedState>;

  constructor(nodeId: string, networkId: string, name: string) {
    this.dus = new DUS(nodeId, socialReducer, {
      reducerVersion: "dus-social@1",
      initialValue: createInitialSocialState(networkId, name)
    });
  }

  emit(type: string, payload: unknown, timestamp = Date.now()): Event {
    return this.dus.emit(type, payload, { timestamp, sessionId: this.dus.getState().value.networkId });
  }

  createProfile(payload: ProfilePayload): Event {
    return this.emit("social/create_profile", payload, payload.joinedAt);
  }

  follow(payload: FollowPayload): Event {
    return this.emit("social/follow", payload, payload.followedAt);
  }

  post(payload: PostPayload): Event {
    return this.emit("social/post", payload, payload.createdAt);
  }

  react(payload: ReactionPayload): Event {
    return this.emit("social/react", payload, payload.createdAt);
  }

  getState(): SocialFeedState {
    return this.dus.getState().value;
  }

  snapshot() {
    return this.dus.snapshot();
  }
}
