# Deterministic Universal Stack (v0.2.0)

**🔒 Hardened & Secure** | **📦 Production Ready** | **⚡ Type Safe**

Deterministic Universal Stack, or DUS, is a fresh, unified repository for a decentralized computation substrate built around one hard claim: if replicas share the same causally closed event set and the same reducer version, they must derive the same state hash. The goal of this repository is to make that claim executable, testable, and reviewable enough that the conversation can move from "does it work?" to "should the internet be rebuilt this way?"

This repo is intentionally narrower and cleaner than the earlier DUS material. It chooses one canonical implementation path, one event model, one replay engine, one storage story, one sync story, and one proof narrative. The surrounding documents are written to remove ambiguity for engineers, researchers, and skeptics.

**Version 0.2.0** adds comprehensive security hardening, modern tooling, and production-ready safeguards. [See What's New →](CHANGELOG.md)

## Quick Start

```bash
# Install
npm install

# Verify
npm run verify

# Test
npm run test

# Build
npm run build
```

See [QUICKSTART.md](docs/QUICKSTART.md) for detailed examples.

## What's New in v0.2.0

### 🔒 Security Enhancements
- Comprehensive input validation with depth limits
- Cryptographic parameter validation  
- Resource limits prevent DoS attacks
- Stack overflow protection
- Memory exhaustion prevention

### ✨ Code Quality
- ESLint integration with security rules
- Prettier for consistent formatting
- Enhanced TypeScript configuration
- Improved error messages

### 📦 Modernization
- Node.js 20.11.0 LTS support
- Updated dependencies with security patches
- Modern tooling integration

[Full Changelog →](CHANGELOG.md) | [Upgrade from v0.1.0 →](UPGRADE_GUIDE.md) | [Security Details →](SECURITY_HARDENING.md)

## Important: Breaking Changes in v0.2.0

The following changes make v0.2.0 stricter for security. If upgrading from v0.1.0, review [UPGRADE_GUIDE.md](UPGRADE_GUIDE.md):

- ✅ DUS constructor now validates all parameters
- ✅ Event types must be non-empty strings
- ✅ Event limit enforcement (default: 100,000)
- ✅ Topological sort depth limits (default: 10,000)
- ✅ Input validation prevents deeply nested payloads

See [UPGRADE_GUIDE.md](UPGRADE_GUIDE.md) for migration instructions.

DUS treats computation as deterministic causal propagation over immutable event structures.

The foundation equation is:

```text
S = Phi(closure(E))
```

Where:

- `E` is the event set
- `closure(E)` is the causally closed history
- `Phi` is the deterministic reducer
- `S` is the canonical derived state

## Repository Layout

```text
packages/
  comms/     peer communication state and handshake bundle logic
  core/      canonical event model, replay engine, verifier
  eventlog/  append-only log architecture, segmentation, merkle roots
  forge/     github-style repository, branch, commit, review state
  math/      entropy, semilattice helpers, proof support
  network/   gossip convergence and BFT quorum helpers
  navigator/ chrome-style browser, tabs, history, bookmarks
  replay/    deterministic replay engine with checkpoints
  runtime/   deterministic agent and workflow runtime
  sdk/       unified application-facing SDK surface
  social/    social graph, posts, follows, reactions, timelines
  storage/   filesystem persistence and Merkle log verification
  zplane/    polyglot language interoperability layer
apps/
  cli/       replay and persistence utility
  collab/    collaborative HTML editor, chat, preview, and Ollama witness
  comms/     peer-to-peer communication app with manual WebRTC bootstrap
  forge/     DUS-native forge demo
  navigator/ DUS-native browser demo
  playground/ demo composition of the full stack
  runtime-prototype/ deterministic runtime prototype demo
  social/    DUS-native social feed demo
  sync-demo/ distributed synchronization demo
tests/       executable invariants and proof-oriented tests
docs/        architecture, formal invariants, conformance, thesis docs
proofs/      TLA+ style spec fragments and proof notes
```

## Why This Exists

The internet drifted toward centralization because mutable databases, opaque orchestration layers, and trust-based operational shortcuts were easier to ship than provable distributed correctness. DUS argues for a different default:

- state should be derived, not directly mutated
- history should be immutable and replayable
- synchronization should exchange causal facts, not private truth
- integrity should be cryptographically checkable
- determinism should be a product property, not a wish

## What Is Executable Here

- content-addressed immutable events
- causal parent tracking
- deterministic replay and snapshot recovery
- idempotent merge by event-set union
- divergence-aware gossip simulation
- Merkle-root-backed persistent logs
- deterministic branchable agent timelines
- collaborative HTML room with live sync and local AI witness
- peer communication app with no central signaling service
- DUS-native forge state for repos, branches, pull requests, and reviews
- DUS-native navigator state for windows, tabs, bookmarks, and history
- deterministic program runtime prototype
- explicit event log architecture and replay engine
- application-facing SDK exports
- DUS-native social state for profiles, follows, posts, and timelines
- polyglot language interoperability across TypeScript, Python, Go, Rust, and WASM
- multi-language execution planning with causal ordering
- cross-language determinism verification and consistency checking
- algebraic and convergence tests

## Quick Start

```bash
npm install
npm run verify
npm run collab
npm run comms
npm run forge
npm run navigator
npm run runtime-prototype
npm run social
npm run sync-demo
npm run bench
npm run demo
```

The collaborative wedge app is documented in [`docs/COLLAB_APP.md`](./docs/COLLAB_APP.md).
The communication app is documented in [`docs/COMMS_APP.md`](./docs/COMMS_APP.md).
The broader product direction is outlined in [`docs/PRODUCT_SUITE.md`](./docs/PRODUCT_SUITE.md).
The social layer is outlined in [`docs/SOCIAL_APP.md`](./docs/SOCIAL_APP.md).
The runtime and SDK additions are outlined in [`docs/RUNTIME_AND_SDKS.md`](./docs/RUNTIME_AND_SDKS.md).
The polyglot language interoperability layer is documented in [`docs/ZPLANE.md`](./docs/ZPLANE.md).

## Core Guarantees

| Guarantee | Meaning | Where Shown |
| --- | --- | --- |
| Replay determinism | Same closed history plus same reducer gives same state hash | `packages/core`, `tests/core.test.ts` |
| Eventual convergence | Replicas converge after exchanging missing events | `tests/core.test.ts`, `tests/network.test.ts` |
| Causal consistency | Parents replay before children | `packages/core/src/index.ts` |
| Tamper evidence | Persisted logs are Merkle-verifiable | `packages/storage`, `tests/storage.test.ts` |
| Reducer defensibility | Non-deterministic reducers are detectable | `packages/core/src/index.ts` |
| Polyglot determinism | Same event set → same state hash across language boundaries | `packages/zplane`, `tests/zplane.test.ts` |

## Intended Discussion

This repository is designed to support a stronger public discussion:

`Do we need a deterministic, event-derived alternative internet substrate?`

Not:

`Can this model be implemented at all?`

## Contact

- Builder: James Chapman
- Contact: xhecarpenxer@gmail.com
- Repository: [Deterministic-Universal-Stack/Deterministic-Universal-Stack](https://github.com/Deterministic-Universal-Stack/Deterministic-Universal-Stack)
