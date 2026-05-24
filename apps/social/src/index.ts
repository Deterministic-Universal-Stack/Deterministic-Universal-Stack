import { stringifyWithBigInt } from "@dus/core";
import { SocialRuntime } from "@dus/social";

const social = new SocialRuntime("social-node", "dus-social", "DUS Social");

social.createProfile({
  userId: "james",
  displayName: "James Chapman",
  bio: "Building a deterministic alternative internet.",
  joinedAt: 1
});

social.createProfile({
  userId: "friend",
  displayName: "Friend Across Town",
  bio: "Testing the shared network.",
  joinedAt: 2
});

social.follow({
  followerId: "friend",
  followeeId: "james",
  followedAt: 3
});

social.post({
  postId: "post-1",
  authorId: "james",
  body: "Hello from a DUS-native social feed.",
  createdAt: 4,
  attachmentHtml: "<article><h1>Hello</h1><p>This came from the alternative internet.</p></article>"
});

social.react({
  reactionId: "reaction-1",
  postId: "post-1",
  userId: "friend",
  kind: "like",
  createdAt: 5
});

social.post({
  postId: "post-2",
  authorId: "friend",
  body: "I can see your post in my replicated timeline.",
  createdAt: 6,
  replyToPostId: "post-1"
});

console.log(stringifyWithBigInt(social.snapshot(), 2));
