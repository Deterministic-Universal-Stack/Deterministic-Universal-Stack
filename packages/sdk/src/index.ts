#!/usr/bin/env node
import { Command } from "commander";
import {
  DUS,
  canonicalHash,
  stringifyWithBigInt,
  topologicalSort,
  createState,
  type Event,
  type Reducer,
  type State,
} from "@dus/core";
import { replayEvents } from "@dus/replay";
import {
  DeterministicAgentRuntime,
  DeterministicProgramRuntime,
} from "@dus/runtime";
import { FileSystemEventStore } from "@dus/storage";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// ==============================================================================
// CANONICAL EVENT ENTRYPOINT
// ==============================================================================

interface CanonicalEventInput {
  type: string;
  payload: unknown;
  parents?: string[];
  timestamp?: number;
  sessionId?: string;
}

async function handleEventEmit(
  nodeId: string,
  reducerVersion: string,
  eventInput: CanonicalEventInput,
  options: { persist?: string; sign?: string }
): Promise<void> {
  const reducer: Reducer = (state, event) => {
    const value = { ...state.value, lastEvent: event.type };
    return {
      value,
      hash: canonicalHash(value),
      eventCount: state.eventCount + 1n,
    };
  };

  const runtime = new DUS(nodeId, reducer, {
    reducerVersion,
    initialValue: {},
    signingKey: options.sign,
  });

  const event = runtime.emit(eventInput.type, eventInput.payload, {
    parents: eventInput.parents,
    timestamp: eventInput.timestamp,
    sessionId: eventInput.sessionId,
  });

  console.log("✓ Event emitted:");
  console.log(stringifyWithBigInt(event, 2));

  if (options.persist) {
    const store = new FileSystemEventStore({ rootDir: options.persist });
    await store.saveLog(nodeId, reducerVersion, runtime.getEvents());
    console.log(`\n✓ Persisted to ${options.persist}/${nodeId}.json`);
  }
}

// ==============================================================================
// DETERMINISTIC EXECUTOR
// ==============================================================================

interface ExecutionPlan {
  nodeId: string;
  reducerVersion: string;
  reducer: string; // Path to reducer module or inline code
  events: Event[] | string; // Events array or path to events file
  initialValue?: unknown;
}

async function handleExecute(
  planPath: string,
  options: { checkpoint?: number; verify?: boolean }
): Promise<void> {
  const planRaw = await readFile(planPath, "utf8");
  const plan: ExecutionPlan = JSON.parse(planRaw);

  // Load reducer (simplified - in production, use dynamic import or eval with sandbox)
  const reducer: Reducer<Record<string, unknown>> = eval(plan.reducer);

  // Load events
  const events =
    typeof plan.events === "string"
      ? (JSON.parse(await readFile(plan.events, "utf8")) as Event[])
      : plan.events;

  const runtime = new DUS<Record<string, unknown>>(plan.nodeId, reducer, {
    reducerVersion: plan.reducerVersion,
    initialValue: (plan.initialValue ?? {}) as Record<string, unknown>,
  });

  console.log(`⚙ Executing ${events.length} events...`);

  const startTime = performance.now();
  runtime.sync(events);
  const endTime = performance.now();

  console.log(`✓ Execution completed in ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`✓ Final state hash: ${runtime.getState().hash}`);
  console.log(`✓ Event count: ${runtime.getState().eventCount}`);

  if (options.verify) {
    console.log("\n🔍 Verifying execution...");
    const verification = runtime.verify();
    if (verification.isValid) {
      console.log("✓ Verification passed");
    } else {
      console.error("✗ Verification failed:");
      verification.errors.forEach((err) => console.error(`  - ${err}`));
      process.exit(1);
    }
  }

  if (options.checkpoint) {
    const trace = replayEvents(
      createState<Record<string, unknown>>((plan.initialValue ?? {}) as Record<string, unknown>),
      events,
      reducer,
      options.checkpoint
    );
    console.log(`\n✓ Generated ${trace.checkpoints.length} checkpoints`);
    console.log(stringifyWithBigInt(trace.checkpoints, 2));
  }

  console.log("\n📊 Final State:");
  console.log(stringifyWithBigInt(runtime.getState(), 2));
}

// ==============================================================================
// REPLAY SURFACE
// ==============================================================================

async function handleReplay(
  logPath: string,
  options: {
    from?: number;
    to?: number;
    checkpoint?: string;
    trace?: boolean;
    diff?: boolean;
  }
): Promise<void> {
  const logRaw = await readFile(logPath, "utf8");
  const log = JSON.parse(logRaw);

  const events: Event[] = log.events;
  const filteredEvents = events.slice(options.from ?? 0, options.to);

  console.log(`🔄 Replaying ${filteredEvents.length} events...`);

  // Simple KV reducer for demo
  const reducer: Reducer = (state, event) => {
    const payload = event.payload as Record<string, unknown>;
    const value = { ...state.value };
    if (event.type === "set") {
      value[String(payload.key)] = payload.value;
    }
    return {
      value,
      hash: canonicalHash(value),
      eventCount: state.eventCount + 1n,
    };
  };

  const initialState = options.checkpoint
    ? (JSON.parse(await readFile(options.checkpoint, "utf8")) as State)
    : createState({});

  const trace = replayEvents(initialState, filteredEvents, reducer, options.trace ? 1 : 999999);

  console.log(`✓ Replay complete`);
  console.log(`✓ Final hash: ${trace.finalState.hash}`);
  console.log(`✓ Event count: ${trace.finalState.eventCount}`);

  if (options.trace) {
    console.log(`\n📈 Replay Trace (${trace.checkpoints.length} checkpoints):`);
    trace.checkpoints.forEach((cp, idx) => {
      console.log(`  [${idx}] Event ${cp.eventId.slice(0, 12)}... → Hash ${cp.state.hash.slice(0, 12)}...`);
    });
  }

  if (options.diff && trace.checkpoints.length > 1) {
    console.log("\n🔍 State Diffs:");
    for (let i = 1; i < trace.checkpoints.length; i++) {
      const prev = trace.checkpoints[i - 1];
      const curr = trace.checkpoints[i];
      console.log(`\n  [${i - 1}] → [${i}]:`);
      console.log(`    Hash: ${prev.state.hash.slice(0, 12)}... → ${curr.state.hash.slice(0, 12)}...`);
      console.log(`    Events: ${prev.state.eventCount} → ${curr.state.eventCount}`);
    }
  }

  console.log("\n📊 Final State:");
  console.log(stringifyWithBigInt(trace.finalState, 2));
}

// ==============================================================================
// PROJECTION CONTROLLER
// ==============================================================================

interface ProjectionConfig {
  name: string;
  sourceLog: string;
  projection: string; // Transform function
  outputPath?: string;
}

async function handleProject(configPath: string): Promise<void> {
  const configRaw = await readFile(configPath, "utf8");
  const config: ProjectionConfig = JSON.parse(configRaw);

  const logRaw = await readFile(config.sourceLog, "utf8");
  const log = JSON.parse(logRaw);
  const events: Event[] = log.events;

  console.log(`📽 Projecting ${events.length} events through ${config.name}...`);

  // Load projection function (simplified)
  const projectFn: (events: Event[]) => unknown = eval(config.projection);
  const projected = projectFn(events);

  console.log(`✓ Projection complete`);
  console.log(stringifyWithBigInt(projected, 2));

  if (config.outputPath) {
    await writeFile(config.outputPath, stringifyWithBigInt(projected), "utf8");
    console.log(`✓ Saved to ${config.outputPath}`);
  }
}

// ==============================================================================
// SCHEDULER INTERFACE
// ==============================================================================

async function handleSchedule(
  runtimeType: "agent" | "program",
  options: {
    nodeId: string;
    runId: string;
    branch?: string;
    steps?: string;
    persist?: string;
  }
): Promise<void> {
  console.log(`🗓 Initializing ${runtimeType} runtime...`);

  if (runtimeType === "agent") {
    const runtime = new DeterministicAgentRuntime(
      options.nodeId,
      options.runId,
      options.branch ?? "main"
    );

    if (options.steps) {
      const stepsRaw = await readFile(options.steps, "utf8");
      const steps = JSON.parse(stepsRaw);

      for (const step of steps) {
        runtime.record(step, step.timestamp ?? Date.now());
        console.log(`  ✓ Recorded ${step.kind}: ${step.agentId}`);
      }
    }

    const timeline = runtime.timeline();
    console.log(`\n✓ Timeline: ${timeline.events.length} events`);
    console.log(`✓ State hash: ${timeline.state.hash}`);

    if (options.persist) {
      await writeFile(options.persist, stringifyWithBigInt(timeline), "utf8");
      console.log(`✓ Persisted to ${options.persist}`);
    }

    console.log("\n📊 Timeline State:");
    console.log(stringifyWithBigInt(timeline.state, 2));
  } else {
    const runtime = new DeterministicProgramRuntime(options.nodeId, options.runId);

    if (options.steps) {
      const instructionsRaw = await readFile(options.steps, "utf8");
      const instructions = JSON.parse(instructionsRaw);

      for (const instruction of instructions) {
        runtime.step(instruction, instruction.timestamp ?? Date.now());
        console.log(`  ✓ Executed ${instruction.op} on ${instruction.key}`);
      }
    }

    const timeline = runtime.timeline();
    console.log(`\n✓ Timeline: ${timeline.events.length} events`);
    console.log(`✓ State hash: ${timeline.state.hash}`);

    if (options.persist) {
      await writeFile(options.persist, stringifyWithBigInt(timeline), "utf8");
      console.log(`✓ Persisted to ${options.persist}`);
    }

    console.log("\n📊 Program State:");
    console.log(stringifyWithBigInt(timeline.state, 2));
  }
}

// ==============================================================================
// GRAPH MANIPULATOR
// ==============================================================================

async function handleGraph(
  logPath: string,
  operation: string,
  options: {
    output?: string;
    filter?: string;
    format?: "dot" | "json" | "mermaid";
  }
): Promise<void> {
  const logRaw = await readFile(logPath, "utf8");
  const log = JSON.parse(logRaw);
  const events: Event[] = log.events;

  console.log(`🕸 Graph operation: ${operation} on ${events.length} events...`);

  if (operation === "visualize") {
    const format = options.format ?? "mermaid";

    if (format === "mermaid") {
      let output = "graph TD\n";
      for (const event of events) {
        const nodeLabel = `${event.type}[${event.id.slice(0, 8)}]`;
        output += `  ${event.id.slice(0, 8)}["${event.type}"]\n`;
        for (const parent of event.parents) {
          output += `  ${parent.slice(0, 8)} --> ${event.id.slice(0, 8)}\n`;
        }
      }
      console.log("\n" + output);

      if (options.output) {
        await writeFile(options.output, output, "utf8");
        console.log(`✓ Saved to ${options.output}`);
      }
    } else if (format === "dot") {
      let output = "digraph EventGraph {\n";
      for (const event of events) {
        output += `  "${event.id.slice(0, 8)}" [label="${event.type}"];\n`;
        for (const parent of event.parents) {
          output += `  "${parent.slice(0, 8)}" -> "${event.id.slice(0, 8)}";\n`;
        }
      }
      output += "}\n";
      console.log("\n" + output);

      if (options.output) {
        await writeFile(options.output, output, "utf8");
        console.log(`✓ Saved to ${options.output}`);
      }
    }
  } else if (operation === "topology") {
    const sorted = topologicalSort(events);
    console.log(`✓ Topologically sorted ${sorted.length} events`);
    console.log("\nTopological Order:");
    sorted.forEach((evt, idx) => {
      console.log(`  [${idx}] ${evt.id.slice(0, 12)}... (${evt.type})`);
    });

    if (options.output) {
      await writeFile(options.output, stringifyWithBigInt(sorted), "utf8");
      console.log(`✓ Saved to ${options.output}`);
    }
  } else if (operation === "frontier") {
    const frontier = new Set<string>();
    const referenced = new Set<string>();

    for (const event of events) {
      frontier.add(event.id);
      for (const parent of event.parents) {
        referenced.add(parent);
      }
    }

    for (const parent of referenced) {
      frontier.delete(parent);
    }

    console.log(`✓ Frontier contains ${frontier.size} events:`);
    for (const id of frontier) {
      const evt = events.find((e) => e.id === id);
      console.log(`  - ${id.slice(0, 12)}... (${evt?.type ?? "unknown"})`);
    }

    if (options.output) {
      await writeFile(options.output, JSON.stringify([...frontier], null, 2), "utf8");
      console.log(`✓ Saved to ${options.output}`);
    }
  } else if (operation === "filter" && options.filter) {
    const filterFn: (evt: Event) => boolean = eval(options.filter);
    const filtered = events.filter(filterFn);

    console.log(`✓ Filtered to ${filtered.length} events`);

    if (options.output) {
      await writeFile(options.output, stringifyWithBigInt({ events: filtered }), "utf8");
      console.log(`✓ Saved to ${options.output}`);
    }
  }
}

// ==============================================================================
// SEMANTIC INSPECTOR
// ==============================================================================

interface SemanticQuery {
  type: "causal-path" | "event-pattern" | "state-invariant" | "temporal-range";
  params: Record<string, unknown>;
}

async function handleInspect(
  logPath: string,
  queryPath: string,
  options: { verbose?: boolean }
): Promise<void> {
  const logRaw = await readFile(logPath, "utf8");
  const log = JSON.parse(logRaw);
  const events: Event[] = log.events;

  const queryRaw = await readFile(queryPath, "utf8");
  const query: SemanticQuery = JSON.parse(queryRaw);

  console.log(`🔍 Semantic inspection: ${query.type}...`);

  if (query.type === "causal-path") {
    const { from, to } = query.params as { from: string; to: string };

    // Build ancestor map
    const ancestors = new Map<string, Set<string>>();
    const buildAncestors = (eventId: string): Set<string> => {
      if (ancestors.has(eventId)) {
        return ancestors.get(eventId)!;
      }
      const evt = events.find((e) => e.id === eventId);
      if (!evt) return new Set();

      const anc = new Set<string>();
      for (const parent of evt.parents) {
        anc.add(parent);
        for (const ancestor of buildAncestors(parent)) {
          anc.add(ancestor);
        }
      }
      ancestors.set(eventId, anc);
      return anc;
    };

    const path = buildAncestors(to);
    if (path.has(from)) {
      console.log(`✓ Causal path exists from ${from.slice(0, 12)}... to ${to.slice(0, 12)}...`);

      // Reconstruct path
      const pathEvents: Event[] = [];
      let current = to;
      while (current !== from) {
        const evt = events.find((e) => e.id === current);
        if (!evt) break;
        pathEvents.unshift(evt);
        current = evt.parents.find((p) => buildAncestors(p).has(from) || p === from) ?? "";
      }

      console.log("\nCausal Path:");
      pathEvents.forEach((evt, idx) => {
        console.log(`  [${idx}] ${evt.id.slice(0, 12)}... (${evt.type}) @ ${evt.metadata.timestamp}`);
      });
    } else {
      console.log(`✗ No causal path from ${from.slice(0, 12)}... to ${to.slice(0, 12)}...`);
    }
  } else if (query.type === "event-pattern") {
    const { pattern } = query.params as { pattern: string };
    const matches = events.filter((evt) => {
      const patternObj = JSON.parse(pattern);
      return Object.entries(patternObj).every(([key, value]) => {
        const eventValue = (evt as any)[key];
        if (typeof value === "object" && value !== null) {
          return JSON.stringify(eventValue) === JSON.stringify(value);
        }
        return eventValue === value;
      });
    });

    console.log(`✓ Found ${matches.length} matching events`);
    if (options.verbose) {
      matches.forEach((evt, idx) => {
        console.log(`\n[${idx}] ${evt.id.slice(0, 12)}...`);
        console.log(stringifyWithBigInt(evt, 2));
      });
    } else {
      matches.forEach((evt) => {
        console.log(`  - ${evt.id.slice(0, 12)}... (${evt.type})`);
      });
    }
  } else if (query.type === "temporal-range") {
    const { start, end } = query.params as { start: number; end: number };
    const inRange = events.filter((evt) => evt.metadata.timestamp >= start && evt.metadata.timestamp <= end);

    console.log(`✓ Found ${inRange.length} events in temporal range [${start}, ${end}]`);
    inRange.forEach((evt) => {
      console.log(`  - ${evt.id.slice(0, 12)}... (${evt.type}) @ ${evt.metadata.timestamp}`);
    });
  } else if (query.type === "state-invariant") {
    const { invariant } = query.params as { invariant: string };
    const checkFn: (state: State) => boolean = eval(invariant);

    // Replay and check invariant at each step
    const reducer: Reducer = (state, event) => {
      const payload = event.payload as Record<string, unknown>;
      const value = { ...state.value };
      if (event.type === "set") {
        value[String(payload.key)] = payload.value;
      }
      return {
        value,
        hash: canonicalHash(value),
        eventCount: state.eventCount + 1n,
      };
    };

    const trace = replayEvents(createState({}), events, reducer, 1);
    const violations: number[] = [];

    trace.checkpoints.forEach((cp, idx) => {
      if (!checkFn(cp.state)) {
        violations.push(idx);
      }
    });

    if (violations.length === 0) {
      console.log("✓ Invariant holds across all states");
    } else {
      console.log(`✗ Invariant violated at ${violations.length} checkpoints:`);
      violations.forEach((idx) => {
        console.log(`  - Checkpoint ${idx} (event ${trace.checkpoints[idx].eventId.slice(0, 12)}...)`);
      });
    }
  }
}

// ==============================================================================
// CLI PROGRAM
// ==============================================================================

const program = new Command();

program
  .name("dus-cli")
  .description("DUS CLI - Canonical event entrypoint, executor, replay surface, projection controller, scheduler, graph manipulator, and semantic inspector")
  .version("1.0.0");

// Canonical Event Entrypoint
program
  .command("emit")
  .description("Emit a canonical event")
  .requiredOption("-n, --node-id <id>", "Node ID")
  .requiredOption("-r, --reducer-version <version>", "Reducer version")
  .requiredOption("-t, --type <type>", "Event type")
  .requiredOption("-p, --payload <json>", "Event payload (JSON)")
  .option("--parents <ids...>", "Parent event IDs")
  .option("--timestamp <ts>", "Event timestamp")
  .option("--session-id <id>", "Session ID")
  .option("--persist <dir>", "Persist to directory")
  .option("--sign <key>", "Signing key")
  .action(async (opts) => {
    await handleEventEmit(
      opts.nodeId,
      opts.reducerVersion,
      {
        type: opts.type,
        payload: JSON.parse(opts.payload),
        parents: opts.parents,
        timestamp: opts.timestamp ? parseInt(opts.timestamp) : undefined,
        sessionId: opts.sessionId,
      },
      {
        persist: opts.persist,
        sign: opts.sign,
      }
    );
  });

// Deterministic Executor
program
  .command("execute")
  .description("Execute a deterministic execution plan")
  .argument("<plan>", "Path to execution plan JSON")
  .option("-c, --checkpoint <interval>", "Checkpoint interval")
  .option("-v, --verify", "Verify execution")
  .action(async (planPath, opts) => {
    await handleExecute(planPath, {
      checkpoint: opts.checkpoint ? parseInt(opts.checkpoint) : undefined,
      verify: opts.verify,
    });
  });

// Replay Surface
program
  .command("replay")
  .description("Replay events from a log")
  .argument("<log>", "Path to event log JSON")
  .option("--from <index>", "Start from event index")
  .option("--to <index>", "End at event index")
  .option("--checkpoint <path>", "Start from checkpoint state")
  .option("--trace", "Show full replay trace")
  .option("--diff", "Show state diffs between checkpoints")
  .action(async (logPath, opts) => {
    await handleReplay(logPath, {
      from: opts.from ? parseInt(opts.from) : undefined,
      to: opts.to ? parseInt(opts.to) : undefined,
      checkpoint: opts.checkpoint,
      trace: opts.trace,
      diff: opts.diff,
    });
  });

// Projection Controller
program
  .command("project")
  .description("Apply a projection to an event log")
  .argument("<config>", "Path to projection config JSON")
  .action(async (configPath) => {
    await handleProject(configPath);
  });

// Scheduler Interface
program
  .command("schedule")
  .description("Schedule and execute agent or program runtime")
  .argument("<type>", "Runtime type: agent or program")
  .requiredOption("-n, --node-id <id>", "Node ID")
  .requiredOption("-r, --run-id <id>", "Run ID")
  .option("-b, --branch <name>", "Branch name (agent only)")
  .option("-s, --steps <path>", "Path to steps/instructions JSON")
  .option("-p, --persist <path>", "Persist timeline to path")
  .action(async (type, opts) => {
    await handleSchedule(type as "agent" | "program", {
      nodeId: opts.nodeId,
      runId: opts.runId,
      branch: opts.branch,
      steps: opts.steps,
      persist: opts.persist,
    });
  });

// Graph Manipulator
program
  .command("graph")
  .description("Manipulate event graph")
  .argument("<log>", "Path to event log JSON")
  .argument("<operation>", "Operation: visualize, topology, frontier, filter")
  .option("-o, --output <path>", "Output path")
  .option("-f, --filter <expr>", "Filter expression for filter operation")
  .option("--format <format>", "Output format: dot, json, mermaid")
  .action(async (logPath, operation, opts) => {
    await handleGraph(logPath, operation, {
      output: opts.output,
      filter: opts.filter,
      format: opts.format,
    });
  });

// Semantic Inspector
program
  .command("inspect")
  .description("Perform semantic inspection on event log")
  .argument("<log>", "Path to event log JSON")
  .argument("<query>", "Path to semantic query JSON")
  .option("-v, --verbose", "Verbose output")
  .action(async (logPath, queryPath, opts) => {
    await handleInspect(logPath, queryPath, {
      verbose: opts.verbose,
    });
  });

const isCliEntrypoint = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliEntrypoint) {
  program.parse(process.argv);
}


// SDK surface exports
export { DUS, createState } from "@dus/core";
export type { Event, Reducer, State } from "@dus/core";
export { replayEvents } from "@dus/replay";
export { EventLog } from "@dus/eventlog";
export { DeterministicProgramRuntime, programReducer } from "@dus/runtime";
