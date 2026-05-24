# Collaborative HTML App

This app is the first product-shaped wedge for DUS: a human-friendly collaborative HTML room with live preview, chat, and a local Ollama witness that is aware of the room state.

## What It Proves

It demonstrates a complete path from DUS theory to product behavior:

- immutable room events
- fast live synchronization
- state-derived document rendering
- collaborative chat sharing the same causal history
- a local model that reasons over the shared state instead of a private shadow copy

If one person types `hello` into the HTML editor, the other person in the same room sees the update because both clients converge on the same room event stream and derived state.

## Features

- shared room by URL and room name
- live HTML source editor
- live iframe preview
- presence list
- room chat
- GitHub HTML import bridge
- Chrome installable web app shell
- state hash, event count, frontier visibility
- Ollama witness chat and HTML suggestions
- one-click application of AI-proposed HTML when the witness returns a fenced `html` block

## Run

```bash
npm install
npm run collab
```

Open:

```text
http://localhost:4321
```

## Connect To A Friend

The app server binds to `0.0.0.0` by default. To collaborate across town or across states, run it on a reachable machine or VPS and expose port `4321`, or reverse proxy it behind your normal HTTPS domain.

Both people open the same server URL and use the same room name.

Example:

```text
https://your-server.example.com/?room=hello-town
```

## Ollama

The witness expects a local or reachable Ollama-compatible endpoint:

- default base URL: `http://127.0.0.1:11434`
- default model: `llama3.1`

Override if needed:

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434 OLLAMA_MODEL=llama3.1 npm run collab
```

## Witness Rules

The witness is prompted to stay inside DUS rules:

1. suggestions must be grounded in the current shared state
2. no hidden side effects or imaginary infrastructure
3. proposed edits should fit inside the collaborative HTML document unless asked otherwise
4. complete `html` blocks are preferred when suggesting direct changes

## Why This Is a Good Wedge

It is simple enough for a real human workflow, but deep enough to prove the substrate:

- messaging proves shared event flow
- HTML editing proves derived state synchronization
- preview proves product immediacy
- the witness proves local AI can operate as a state-aware participant rather than an external black box
- GitHub import proves the product can bridge today's internet and the alternative one you are building
- Chrome installability makes it feel like a real tool, not just a demo page
