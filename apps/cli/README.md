# DUS CLI - Comprehensive Control Surface

The DUS CLI is a unified command-line interface that serves as the complete control surface for the Deterministic Universal Stack. It acts as:

1. **Canonical Event Entrypoint** - Emit and ingest events into the system
2. **Deterministic Executor** - Execute event sequences with verification
3. **Replay Surface** - Replay historical events with checkpointing and diffing
4. **Projection Controller** - Transform event logs into custom projections
5. **Scheduler Interface** - Manage agent and program runtime timelines
6. **Graph Manipulator** - Visualize and manipulate causal event graphs
7. **Semantic Inspector** - Query and analyze event semantics

## Installation

```bash
cd apps/cli
npm install
```

## Usage

```bash
# Run with tsx
tsx src/index.ts <command> [options]

# Or use the npm script
npm start -- <command> [options]
```

---

## 1. Canonical Event Entrypoint

Emit events as the primary entry point into the system.

### Emit a Single Event

```bash
tsx src/index.ts emit \
  --node-id "node-1" \
  --reducer-version "v1.0" \
  --type "set" \
  --payload '{"key":"system","value":"active"}' \
  --persist "./.tmp"
```

### Emit with Signing

```bash
tsx src/index.ts emit \
  --node-id "node-1" \
  --reducer-version "v1.0" \
  --type "transfer" \
  --payload '{"from":"alice","to":"bob","amount":100}' \
  --sign "my-secret-key" \
  --persist "./.tmp"
```

### Emit with Custom Timestamp and Parents

```bash
tsx src/index.ts emit \
  --node-id "node-1" \
  --reducer-version "v1.0" \
  --type "merge" \
  --payload '{"source":"branch-a"}' \
  --timestamp 1234567890 \
  --parents "abc123..." "def456..." \
  --session-id "session-42"
```

---

## 2. Deterministic Executor

Execute event sequences with optional checkpointing and verification.

### Create an Execution Plan

```json
// execution-plan.json
{
  "nodeId": "executor-1",
  "reducerVersion": "v1.0",
  "reducer": "(state, event) => ({ value: {...state.value, [event.type]: event.payload}, hash: require('@dus/core').canonicalHash({...state.value, [event.type]: event.payload}), eventCount: state.eventCount + 1n })",
  "events": "./events.json",
  "initialValue": {}
}
```

### Execute the Plan

```bash
tsx src/index.ts execute execution-plan.json --verify
```

### Execute with Checkpoints

```bash
tsx src/index.ts execute execution-plan.json \
  --checkpoint 10 \
  --verify
```

**Output:**
- Execution time
- Final state hash
- Event count
- Verification results
- Checkpoints (if enabled)
- Final state

---

## 3. Replay Surface

Replay historical events from persisted logs.

### Basic Replay

```bash
tsx src/index.ts replay .tmp/node-1.json
```

### Replay with Range

```bash
tsx src/index.ts replay .tmp/node-1.json \
  --from 10 \
  --to 50
```

### Replay with Trace

```bash
tsx src/index.ts replay .tmp/node-1.json \
  --trace \
  --diff
```

### Replay from Checkpoint

```bash
# First, save a checkpoint
tsx src/index.ts execute plan.json --checkpoint 100

# Then replay from it
tsx src/index.ts replay .tmp/node-1.json \
  --checkpoint ./checkpoint-100.json \
  --from 100
```

**Features:**
- Full replay trace visualization
- State diff between checkpoints
- Range-based replay
- Checkpoint-based resume
- Final state output

---

## 4. Projection Controller

Transform event logs into custom views and projections.

### Create a Projection Config

```json
// projection-config.json
{
  "name": "user-activity",
  "sourceLog": "./.tmp/node-1.json",
  "projection": "(events) => events.filter(e => e.type === 'user_action').map(e => ({ user: e.payload.userId, action: e.payload.action, timestamp: e.metadata.timestamp }))",
  "outputPath": "./user-activity.json"
}
```

### Run the Projection

```bash
tsx src/index.ts project projection-config.json
```

### Example Projections

**Timeline Projection:**
```json
{
  "name": "timeline",
  "sourceLog": "./.tmp/events.json",
  "projection": "(events) => events.sort((a,b) => a.metadata.timestamp - b.metadata.timestamp).map(e => ({ time: e.metadata.timestamp, type: e.type, hash: e.id.slice(0,8) }))"
}
```

**Aggregation Projection:**
```json
{
  "name": "event-counts",
  "sourceLog": "./.tmp/events.json",
  "projection": "(events) => events.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] || 0) + 1 }), {})"
}
```

---

## 5. Scheduler Interface

Manage deterministic agent and program runtime timelines.

### Schedule Agent Runtime

Create agent steps:
```json
// agent-steps.json
[
  {
    "agentId": "agent-alpha",
    "kind": "input",
    "content": "analyze market data",
    "timestamp": 1000
  },
  {
    "agentId": "agent-alpha",
    "kind": "plan",
    "content": "retrieve latest prices",
    "timestamp": 1001
  },
  {
    "agentId": "agent-alpha",
    "kind": "action",
    "content": "fetch API data",
    "timestamp": 1002
  },
  {
    "agentId": "agent-alpha",
    "kind": "observation",
    "content": { "prices": [100, 102, 99] },
    "timestamp": 1003
  },
  {
    "agentId": "agent-alpha",
    "kind": "result",
    "content": "analysis complete",
    "timestamp": 1004
  }
]
```

Run the agent:
```bash
tsx src/index.ts schedule agent \
  --node-id "scheduler-1" \
  --run-id "run-001" \
  --branch "main" \
  --steps ./agent-steps.json \
  --persist ./agent-timeline.json
```

### Schedule Program Runtime

Create program instructions:
```json
// program-instructions.json
[
  { "op": "set", "key": "counter", "value": 0, "timestamp": 1000 },
  { "op": "increment", "key": "counter", "value": 5, "timestamp": 1001 },
  { "op": "append", "key": "log", "value": "step-1", "timestamp": 1002 },
  { "op": "increment", "key": "counter", "value": 3, "timestamp": 1003 },
  { "op": "append", "key": "log", "value": "step-2", "timestamp": 1004 }
]
```

Run the program:
```bash
tsx src/index.ts schedule program \
  --node-id "scheduler-1" \
  --run-id "run-002" \
  --steps ./program-instructions.json \
  --persist ./program-timeline.json
```

### Branch Agent Timelines

```bash
# Create main timeline
tsx src/index.ts schedule agent -n node-1 -r run-1 -b main -s steps.json

# Create alternate branch
tsx src/index.ts schedule agent -n node-1 -r run-1 -b experimental -s alt-steps.json
```

---

## 6. Graph Manipulator

Visualize and manipulate causal event graphs.

### Visualize as Mermaid

```bash
tsx src/index.ts graph .tmp/node-1.json visualize \
  --format mermaid \
  --output graph.mmd
```

### Visualize as Graphviz DOT

```bash
tsx src/index.ts graph .tmp/node-1.json visualize \
  --format dot \
  --output graph.dot

# Then render with Graphviz
dot -Tpng graph.dot -o graph.png
```

### Compute Topological Sort

```bash
tsx src/index.ts graph .tmp/node-1.json topology \
  --output sorted-events.json
```

### Extract Frontier

```bash
tsx src/index.ts graph .tmp/node-1.json frontier \
  --output frontier.json
```

### Filter Events

```bash
# Filter by event type
tsx src/index.ts graph .tmp/node-1.json filter \
  --filter "(evt) => evt.type === 'set'" \
  --output filtered.json

# Filter by timestamp range
tsx src/index.ts graph .tmp/node-1.json filter \
  --filter "(evt) => evt.metadata.timestamp > 1000 && evt.metadata.timestamp < 2000" \
  --output recent.json
```

---

## 7. Semantic Inspector

Perform semantic queries and analysis on event logs.

### Causal Path Query

Find the causal path between two events:

```json
// causal-query.json
{
  "type": "causal-path",
  "params": {
    "from": "abc123...",
    "to": "def456..."
  }
}
```

```bash
tsx src/index.ts inspect .tmp/node-1.json causal-query.json
```

### Event Pattern Matching

Find all events matching a pattern:

```json
// pattern-query.json
{
  "type": "event-pattern",
  "params": {
    "pattern": "{\"type\":\"transfer\",\"payload\":{\"amount\":100}}"
  }
}
```

```bash
tsx src/index.ts inspect .tmp/node-1.json pattern-query.json --verbose
```

### Temporal Range Query

Find events in a time range:

```json
// temporal-query.json
{
  "type": "temporal-range",
  "params": {
    "start": 1000000000,
    "end": 2000000000
  }
}
```

```bash
tsx src/index.ts inspect .tmp/node-1.json temporal-query.json
```

### State Invariant Checking

Verify an invariant holds across all states:

```json
// invariant-query.json
{
  "type": "state-invariant",
  "params": {
    "invariant": "(state) => state.value.counter >= 0"
  }
}
```

```bash
tsx src/index.ts inspect .tmp/node-1.json invariant-query.json
```

---

## Complete Workflow Example

```bash
# 1. Emit some events
tsx src/index.ts emit -n node-1 -r v1 -t set -p '{"key":"counter","value":0}' --persist .tmp
tsx src/index.ts emit -n node-1 -r v1 -t set -p '{"key":"counter","value":5}' --persist .tmp
tsx src/index.ts emit -n node-1 -r v1 -t set -p '{"key":"status","value":"active"}' --persist .tmp

# 2. Replay with trace
tsx src/index.ts replay .tmp/node-1.json --trace --diff

# 3. Visualize the graph
tsx src/index.ts graph .tmp/node-1.json visualize --format mermaid

# 4. Create a projection
cat > projection.json << 'EOF'
{
  "name": "counter-timeline",
  "sourceLog": "./.tmp/node-1.json",
  "projection": "(events) => events.filter(e => e.payload.key === 'counter').map(e => ({ timestamp: e.metadata.timestamp, value: e.payload.value }))"
}
EOF

tsx src/index.ts project projection.json

# 5. Schedule a program runtime
cat > instructions.json << 'EOF'
[
  { "op": "set", "key": "total", "value": 0 },
  { "op": "increment", "key": "total", "value": 10 },
  { "op": "increment", "key": "total", "value": 20 }
]
EOF

tsx src/index.ts schedule program -n node-2 -r run-1 -s instructions.json -p timeline.json

# 6. Inspect for invariants
cat > invariant.json << 'EOF'
{
  "type": "state-invariant",
  "params": {
    "invariant": "(state) => Object.values(state.value).every(v => typeof v !== 'number' || v >= 0)"
  }
}
EOF

tsx src/index.ts inspect .tmp/node-1.json invariant.json
```

---

## Advanced Features

### Combining Commands with Unix Pipes

```bash
# Extract frontier, then visualize just those events
tsx src/index.ts graph .tmp/node-1.json frontier --output frontier.json
# Filter events to just frontier
tsx src/index.ts graph .tmp/node-1.json filter \
  --filter "(evt) => $(cat frontier.json | jq -r '.[]' | paste -sd,).includes(evt.id)" \
  --output frontier-events.json
```

### Multi-Node Synchronization Workflow

```bash
# Node 1 emits events
tsx src/index.ts emit -n node-1 -r v1 -t set -p '{"key":"a","value":1}' --persist .tmp

# Node 2 emits events
tsx src/index.ts emit -n node-2 -r v1 -t set -p '{"key":"b","value":2}' --persist .tmp

# Merge logs (manual merge for now, or use DUS sync)
# Then replay the merged log
tsx src/index.ts replay merged.json --trace
```

### Checkpoint-based Incremental Replay

```bash
# Execute with checkpoints every 100 events
tsx src/index.ts execute plan.json --checkpoint 100

# Later, resume from checkpoint 500
tsx src/index.ts replay .tmp/node-1.json \
  --checkpoint checkpoint-500.json \
  --from 500
```

---

## Configuration and Environment

### Environment Variables

```bash
export DUS_DEFAULT_NODE_ID="my-node"
export DUS_DEFAULT_REDUCER_VERSION="v1.0"
export DUS_STORAGE_DIR="./.dus-storage"
```

### Config File (Future)

```json
// dus.config.json
{
  "nodeId": "default-node",
  "reducerVersion": "v1.0",
  "storage": {
    "type": "filesystem",
    "rootDir": "./.dus-storage"
  },
  "signing": {
    "enabled": true,
    "keyPath": "./signing-key.pem"
  }
}
```

---

## Command Reference

| Command | Purpose | Key Options |
|---------|---------|------------|
| `emit` | Emit canonical events | `--node-id`, `--type`, `--payload`, `--persist` |
| `execute` | Execute event sequences | `--checkpoint`, `--verify` |
| `replay` | Replay event logs | `--from`, `--to`, `--trace`, `--diff` |
| `project` | Apply projections | Config file with `projection` function |
| `schedule` | Run agent/program runtimes | `--node-id`, `--run-id`, `--steps` |
| `graph` | Manipulate event graphs | `visualize`, `topology`, `frontier`, `filter` |
| `inspect` | Semantic inspection | Query file with `type` and `params` |

---

## Contributing

To extend the CLI:

1. Add new command handlers in `src/index.ts`
2. Register commands with Commander.js
3. Update this documentation
4. Add tests in `tests/cli.test.ts`

---

## Architecture

The CLI is built on:
- **Commander.js** for argument parsing
- **@dus/sdk** for all DUS functionality
- **Node.js** filesystem APIs for persistence
- **TypeScript** for type safety

Each command is self-contained and can be tested independently.

---

## Troubleshooting

### Event Hash Mismatch
- Ensure reducer is deterministic
- Check that all nodes use the same reducer version

### Replay Failures
- Verify event log is not corrupted
- Check for missing parent events
- Ensure reducer logic matches original

### Graph Cycles Detected
- Event parents may reference future events
- Check for bidirectional parent relationships

---

## Next Steps

1. Add network sync commands (`sync`, `gossip`, `converge`)
2. Add TUI mode for interactive exploration
3. Add watch mode for live event streaming
4. Add diff visualization between replicas
5. Add performance profiling commands
6. Add batch processing for large logs
