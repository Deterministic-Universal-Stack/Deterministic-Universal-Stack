# Product Suite

The product direction now breaks into four complementary DUS-native applications:

## 1. DUS Collab

Current wedge product:

- collaborative HTML editing
- live preview
- room chat
- local Ollama witness
- GitHub import bridge
- Chrome-style installability

This is the most immediate human entrypoint.

## 2. DUS Forge

This is the DUS-native alternative to a GitHub-style system.

Core idea:

- repositories are event-derived state
- branches are explicit causal heads
- commits are immutable file-set events
- pull requests and reviews are first-class room-like collaborative state
- discussions are replayable threads, not opaque database rows

The initial implementation lives in:

- [packages/forge/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/packages/forge/src/index.ts)
- [apps/forge/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/apps/forge/src/index.ts)

## 3. DUS Navigator

This is the DUS-native alternative to a Chrome-style browser environment.

Core idea:

- windows, tabs, history, bookmarks, and downloads are event-derived state
- sessions are portable and replayable
- navigation history can sync across replicas without central ownership
- browser behavior can link directly into forge and collab spaces with `dus://` routes

The initial implementation lives in:

- [packages/navigator/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/packages/navigator/src/index.ts)
- [apps/navigator/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/apps/navigator/src/index.ts)

## 4. DUS Social

This is the DUS-native social media layer.

Core idea:

- profiles, follows, posts, and reactions are event-derived state
- timelines are deterministic feed views over shared history
- replies and media attachments can converge across replicas without giving one platform operator private ownership of truth

The initial implementation lives in:

- [packages/social/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/packages/social/src/index.ts)
- [apps/social/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/apps/social/src/index.ts)

## Local AI Models

The collab app now defaults to `llama3.2`, which matches your installed environment better. You can also point it at Mistral:

```bash
OLLAMA_MODEL=mistral npm run collab
```

## Why This Matters

Together these four products tell a stronger story:

- Collab proves person-to-person real-time shared state
- Forge proves software coordination without traditional centralized truth
- Navigator proves that user-facing computing surfaces can also be event-derived
- Social proves public posting, following, and discourse can also live inside the same model

That starts to look less like a single app and more like a real alternative internet stack.
