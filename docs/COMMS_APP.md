# DUS Communications App

This app is a DUS-native communication system built from the ideas in the `det-facetime.zip` prototype, but adapted into the canonical repository and made honest about its network model.

## What It Is

A browser-to-browser communication app with:

- local video and audio capture
- peer-to-peer WebRTC media transport
- peer-to-peer datachannel event synchronization
- deterministic DUS event log for session state
- local replayable chat and signaling history

## What It Is Not

It does **not** use a central signaling server or third-party relay as part of the app design.

Because browsers still need an initial handshake, the bootstrap is manual:

1. creator starts a session
2. creator copies an invite bundle
3. joiner pastes the invite and creates an answer bundle
4. creator pastes the answer bundle
5. after that, the peers communicate directly

That means the system is truly no-third-party and no-centralized-server, but the first rendezvous is human-assisted.

## Why This Tradeoff Is Real

Pure browser WebRTC cannot establish a session from nothing without exchanging offer/answer material somehow. If you reject a signaling server completely, then the remaining honest choices are:

- manual copy/paste
- QR codes
- local network discovery in specific environments
- a separate peer bootstrap channel you already control

This app chooses manual bundle exchange because it is simple, inspectable, and works today.

## Files

- [packages/comms/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/packages/comms/src/index.ts)
- [apps/comms/src/index.ts](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/apps/comms/src/index.ts)
- [apps/comms/public/index.html](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/apps/comms/public/index.html)
- [apps/comms/public/client.js](/Users/jameschapman/DeterministicUniversalStack/Deterministic-Universal-Stack/apps/comms/public/client.js)

## Run

```bash
npm run comms
```

Open:

```text
http://localhost:4545
```

Open the same page on both machines, use the same room name, and exchange the generated bundles manually.

## Relationship To The Zip Prototype

The zip was useful for:

- event vocabulary
- reducer shape
- Merkle log intuition
- video-call product framing

But it was not yet a genuinely working no-server communication system. This repository version keeps the DUS framing while replacing the simulated sync story with a real direct-browser handshake model.
