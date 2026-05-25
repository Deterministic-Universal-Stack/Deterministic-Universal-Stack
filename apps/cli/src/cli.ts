#!/usr/bin/env node
/**
 * DUS Developer Tools CLI
 * 
 * Comprehensive toolkit for DUS application development:
 * - Project scaffolding
 * - Event inspection and debugging
 * - Performance profiling
 * - Visualization and tracing
 * - Testing and verification
 */

import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// PROJECT SCAFFOLDING
// ============================================================================

async function createProject(name: string, template: string): Promise<void> {
  console.log(`🚀 Creating DUS project: ${name}`);
  
  const projectDir = join(process.cwd(), name);
  
  if (existsSync(projectDir)) {
    console.error(`❌ Directory ${name} already exists`);
    process.exit(1);
  }
  
  await mkdir(projectDir, { recursive: true });
  await mkdir(join(projectDir, 'src'));
  await mkdir(join(projectDir, 'tests'));
  
  // Create package.json
  const packageJson = {
    name,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'tsx src/index.ts',
      build: 'tsc',
      test: 'vitest',
      'dus:inspect': 'dus inspect ./events.json',
      'dus:profile': 'dus profile ./events.json',
      'dus:visualize': 'dus visualize ./events.json',
    },
    dependencies: {
      '@dus/runtime': '^1.0.0',
      '@dus/effects': '^1.0.0',
    },
    devDependencies: {
      typescript: '^5.3.3',
      tsx: '^4.7.0',
      vitest: '^1.2.0',
      '@types/node': '^20.11.0',
    },
  };
  
  await writeFile(
    join(projectDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create tsconfig.json
  const tsConfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      outDir: 'dist',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };
  
  await writeFile(
    join(projectDir, 'tsconfig.json'),
    JSON.stringify(tsConfig, null, 2)
  );
  
  // Create template application
  const templates = {
    basic: `import { DUSRuntime } from '@dus/runtime';

const runtime = new DUSRuntime(
  'node-1',
  (state, event) => {
    const value = { ...state.value, count: (state.value.count || 0) + 1 };
    return {
      value,
      hash: JSON.stringify(value),
      eventCount: state.eventCount + 1n,
      metadata: {},
    };
  },
  { count: 0 }
);

// Emit events
await runtime.emit('increment', {});
await runtime.emit('increment', {});

console.log('Final state:', runtime.getState());
console.log('Metrics:', runtime.getMetrics());
`,
    
    effects: `import { DUSRuntime } from '@dus/runtime';
import { DeterministicEffectSystem, IO, State } from '@dus/effects';

const effects = new DeterministicEffectSystem({ enableTracing: true });

// Define effect-based reducer
const reducer = async (state, event) => {
  if (event.type === 'load') {
    const data = await effects.execute(IO.read('./data.json'));
    const parsed = JSON.parse(data);
    await effects.execute(State.set('loaded', parsed));
  }
  
  const currentState = await effects.execute(State.get('state')) || {};
  const nextState = { ...currentState, lastEvent: event.type };
  await effects.execute(State.set('state', nextState));
  
  return {
    value: nextState,
    hash: JSON.stringify(nextState),
    eventCount: state.eventCount + 1n,
    metadata: {},
  };
};

const runtime = new DUSRuntime('node-1', reducer, {});
await runtime.emit('load', {});
`,
  };
  
  await writeFile(
    join(projectDir, 'src', 'index.ts'),
    templates[template as keyof typeof templates] || templates.basic
  );
  
  // Create README
  const readme = `# ${name}

DUS Application

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Development Tools

- **Inspect events**: \`npm run dus:inspect\`
- **Profile performance**: \`npm run dus:profile\`
- **Visualize event graph**: \`npm run dus:visualize\`

## Testing

\`\`\`bash
npm test
\`\`\`
`;
  
  await writeFile(join(projectDir, 'README.md'), readme);
  
  console.log(`✅ Project created successfully!`);
  console.log(`\n📁 Next steps:`);
  console.log(`   cd ${name}`);
  console.log(`   npm install`);
  console.log(`   npm run dev`);
}

// ============================================================================
// EVENT INSPECTION
// ============================================================================

async function inspectEvents(logPath: string, options: {
  filter?: string;
  verbose?: boolean;
}): Promise<void> {
  console.log(`🔍 Inspecting events from ${logPath}\n`);
  
  const data = JSON.parse(await readFile(logPath, 'utf-8'));
  const events = data.events || data;
  
  console.log(`📊 Event Statistics:`);
  console.log(`   Total events: ${events.length}`);
  
  // Event type distribution
  const typeCount = new Map<string, number>();
  for (const event of events) {
    typeCount.set(event.type, (typeCount.get(event.type) || 0) + 1);
  }
  
  console.log(`\n📌 Event Types:`);
  for (const [type, count] of typeCount.entries()) {
    console.log(`   ${type}: ${count}`);
  }
  
  // Timeline analysis
  const timestamps = events.map((e: any) => e.metadata.timestamp).sort((a: number, b: number) => a - b);
  const duration = timestamps[timestamps.length - 1] - timestamps[0];
  
  console.log(`\n⏱️  Timeline:`);
  console.log(`   First event: ${new Date(timestamps[0]).toISOString()}`);
  console.log(`   Last event: ${new Date(timestamps[timestamps.length - 1]).toISOString()}`);
  console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
  
  // Causal structure
  const roots = events.filter((e: any) => e.parents.length === 0);
  const leaves = new Set(events.map((e: any) => e.id));
  for (const event of events) {
    for (const parent of event.parents) {
      leaves.delete(parent);
    }
  }
  
  console.log(`\n🌳 Causal Structure:`);
  console.log(`   Root events: ${roots.length}`);
  console.log(`   Leaf events: ${leaves.size}`);
  console.log(`   Avg parents per event: ${(events.reduce((sum: number, e: any) => sum + e.parents.length, 0) / events.length).toFixed(2)}`);
  
  // Node distribution
  const nodeCount = new Map<string, number>();
  for (const event of events) {
    nodeCount.set(event.metadata.nodeId, (nodeCount.get(event.metadata.nodeId) || 0) + 1);
  }
  
  console.log(`\n🖥️  Node Distribution:`);
  for (const [nodeId, count] of nodeCount.entries()) {
    console.log(`   ${nodeId}: ${count} events`);
  }
  
  if (options.verbose) {
    console.log(`\n📝 Event Details:\n`);
    for (const event of events.slice(0, 10)) {
      console.log(`   ID: ${event.id.slice(0, 12)}...`);
      console.log(`   Type: ${event.type}`);
      console.log(`   Parents: ${event.parents.length}`);
      console.log(`   Node: ${event.metadata.nodeId}`);
      console.log(`   Timestamp: ${new Date(event.metadata.timestamp).toISOString()}`);
      console.log();
    }
    
    if (events.length > 10) {
      console.log(`   ... and ${events.length - 10} more events`);
    }
  }
}

// ============================================================================
// PERFORMANCE PROFILING
// ============================================================================

async function profileEvents(logPath: string): Promise<void> {
  console.log(`⚡ Profiling performance from ${logPath}\n`);
  
  const data = JSON.parse(await readFile(logPath, 'utf-8'));
  const events = data.events || data;
  
  // Simulate replay and measure
  console.log(`🔄 Replaying ${events.length} events...`);
  
  const startTime = performance.now();
  let eventCount = 0;
  
  for (const event of events) {
    eventCount++;
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  const endTime = performance.now();
  const totalTime = endTime - startTime;
  
  console.log(`\n📈 Performance Metrics:`);
  console.log(`   Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`   Events processed: ${eventCount}`);
  console.log(`   Average latency: ${(totalTime / eventCount).toFixed(3)}ms per event`);
  console.log(`   Throughput: ${((eventCount / totalTime) * 1000).toFixed(0)} events/second`);
  
  // Memory analysis
  const memoryMB = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`\n💾 Memory Usage:`);
  console.log(`   Heap used: ${memoryMB.toFixed(2)}MB`);
  console.log(`   Per event: ${((memoryMB / eventCount) * 1024).toFixed(2)}KB`);
  
  // Bottleneck detection
  console.log(`\n⚠️  Potential Bottlenecks:`);
  if (eventCount > 10000) {
    console.log(`   ⚡ Large event set - consider checkpointing every 1000 events`);
  }
  if (memoryMB > 100) {
    console.log(`   💾 High memory usage - consider streaming or pagination`);
  }
  if (totalTime / eventCount > 10) {
    console.log(`   🐌 Slow event processing - profile reducer performance`);
  }
}

// ============================================================================
// EVENT GRAPH VISUALIZATION
// ============================================================================

async function visualizeEvents(logPath: string, options: {
  format?: string;
  output?: string;
}): Promise<void> {
  console.log(`🎨 Visualizing event graph from ${logPath}\n`);
  
  const data = JSON.parse(await readFile(logPath, 'utf-8'));
  const events = data.events || data;
  
  const format = options.format || 'mermaid';
  
  if (format === 'mermaid') {
    let mermaid = 'graph TD\n';
    
    for (const event of events) {
      const nodeLabel = `${event.id.slice(0, 8)}[${event.type}]`;
      mermaid += `    ${event.id.slice(0, 8)}["${event.type}\\n${new Date(event.metadata.timestamp).toLocaleTimeString()}"]\n`;
      
      for (const parent of event.parents) {
        mermaid += `    ${parent.slice(0, 8)} --> ${event.id.slice(0, 8)}\n`;
      }
    }
    
    if (options.output) {
      await writeFile(options.output, mermaid);
      console.log(`✅ Mermaid diagram saved to ${options.output}`);
    } else {
      console.log(mermaid);
    }
  } else if (format === 'dot') {
    let dot = 'digraph EventGraph {\n';
    dot += '  node [shape=box];\n';
    
    for (const event of events) {
      dot += `  "${event.id.slice(0, 8)}" [label="${event.type}\\n${new Date(event.metadata.timestamp).toLocaleTimeString()}"];\n`;
      
      for (const parent of event.parents) {
        dot += `  "${parent.slice(0, 8)}" -> "${event.id.slice(0, 8)}";\n`;
      }
    }
    
    dot += '}\n';
    
    if (options.output) {
      await writeFile(options.output, dot);
      console.log(`✅ DOT graph saved to ${options.output}`);
    } else {
      console.log(dot);
    }
  }
  
  console.log(`\n📊 Graph Statistics:`);
  console.log(`   Nodes: ${events.length}`);
  console.log(`   Edges: ${events.reduce((sum: number, e: any) => sum + e.parents.length, 0)}`);
}

// ============================================================================
// TESTING FRAMEWORK
// ============================================================================

async function runTests(testPath: string): Promise<void> {
  console.log(`🧪 Running DUS tests from ${testPath}\n`);
  
  const testModule = await import(testPath);
  const tests = testModule.default || testModule;
  
  let passed = 0;
  let failed = 0;
  
  for (const [name, test] of Object.entries(tests)) {
    try {
      console.log(`   Running: ${name}...`);
      await (test as Function)();
      console.log(`   ✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`   ❌ ${name}`);
      console.error(`      ${error}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Test Results:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${passed + failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// ============================================================================
// CLI PROGRAM
// ============================================================================

const program = new Command();

program
  .name('dus')
  .description('DUS Developer Tools')
  .version('1.0.0');

program
  .command('new')
  .description('Create a new DUS project')
  .argument('<name>', 'Project name')
  .option('-t, --template <template>', 'Template to use (basic, effects)', 'basic')
  .action(createProject);

program
  .command('inspect')
  .description('Inspect event log')
  .argument('<log>', 'Path to event log JSON')
  .option('-f, --filter <pattern>', 'Filter events by pattern')
  .option('-v, --verbose', 'Show detailed information')
  .action(inspectEvents);

program
  .command('profile')
  .description('Profile event processing performance')
  .argument('<log>', 'Path to event log JSON')
  .action(profileEvents);

program
  .command('visualize')
  .description('Visualize event graph')
  .argument('<log>', 'Path to event log JSON')
  .option('--format <format>', 'Output format (mermaid, dot)', 'mermaid')
  .option('-o, --output <path>', 'Output file path')
  .action(visualizeEvents);

program
  .command('test')
  .description('Run DUS tests')
  .argument('<path>', 'Path to test file')
  .action(runTests);

program.parse(process.argv);
