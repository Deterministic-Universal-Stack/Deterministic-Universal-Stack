# DUS Social

DUS Social is the DUS-native social media layer for the alternative internet stack.

## Core Idea

Instead of treating a social network as a centrally owned mutable database, DUS Social treats it as deterministic shared state derived from immutable events:

- profile creation
- follow edges
- posts
- replies
- reactions
- feed timelines

## Why It Belongs Here

Social media is one of the clearest examples of where internet centralization became culturally and economically dominant. If DUS is serious about an alternative internet, it needs a social layer that is not an afterthought.

## Current Baseline

The initial implementation lives in:

- [packages/social/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/packages/social/src/index.ts)
- [apps/social/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/apps/social/src/index.ts)

It currently models:

- user profiles
- follow relationships
- posts and replies
- HTML-rich post attachments
- like, boost, and witness reactions
- user timelines derived from follow state

## Run

```bash
npm run social
```

## Why This Matters

If Collab proves shared creation, Forge proves shared software coordination, and Navigator proves shared browsing context, then Social proves shared public discourse. That makes the alternative internet vision feel much more complete.
