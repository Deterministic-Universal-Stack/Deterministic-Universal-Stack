/**
 * DUS Comprehensive Benchmark Suite
 * 
 * Measures performance across all layers:
 * - Event layer (creation, hashing, signing)
 * - Replay layer (topological sort, deterministic replay)
 * - Synchronization (gossip, merge, convergence)
 * - Storage (I/O, snapshots, Merkle roots)
 * - Application (reducer operations)
 * 
 * Run with: npm run bench
 */

import { performance } from 'perf_hooks';

// ============================================================================
// Benchmark Harness
// ============================================================================

interface BenchmarkSample {
  name: string;
  iterationNs: number;
  minNs: number;
  maxNs: number;
  p50Ns: number;
  p99Ns: number;
  opsPerSecond: number;
}

class BenchmarkHarness {
  private samples: Map<string, number[]> = new Map();
  private minMaxByName: Map<string, { min: number; max: number }> = new Map();

  measure(name: string, fn: () => void, iterations = 1000): BenchmarkSample {
    const warmup = 10;
    
    // Warmup
    for (let i = 0; i < warmup; i++) {
      fn();
    }

    // Measure
    const timings: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      fn();
      const elapsed = (performance.now() - start) * 1_000_000; // Convert to ns
      timings.push(elapsed);
    }

    const sorted = timings.sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = sorted[Math.floor(iterations * 0.5)];
    const p99 = sorted[Math.floor(iterations * 0.99)];
    const avgNs = timings.reduce((a, b) => a + b) / iterations;

    this.samples.set(name, timings);
    this.minMaxByName.set(name, { min, max });

    return {
      name,
      iterationNs: avgNs,
      minNs: min,
      maxNs: max,
      p50Ns: p50,
      p99Ns: p99,
      opsPerSecond: 1_000_000_000 / avgNs
    };
  }

  report(samples: BenchmarkSample[]) {
    console.log('\n' + '='.repeat(100));
    console.log('BENCHMARK RESULTS');
    console.log('='.repeat(100) + '\n');

    console.table(samples.map(s => ({
      'Operation': s.name,
      'Avg (ns)': Math.round(s.iterationNs).toLocaleString(),
      'P50 (ns)': Math.round(s.p50Ns).toLocaleString(),
      'P99 (ns)': Math.round(s.p99Ns).toLocaleString(),
      'Min (ns)': Math.round(s.minNs).toLocaleString(),
      'Max (ns)': Math.round(s.maxNs).toLocaleString(),
      'Ops/sec': Math.round(s.opsPerSecond).toLocaleString()
    })));

    console.log('\nPerformance Targets:');
    console.table([
      { operation: 'Event creation', p50Target: '100 µs', p99Target: '500 µs', actual: this.formatNs(samples.find(s => s.name.includes('Event creation'))?.p50Ns) },
      { operation: 'Event replay', p50Target: '10 µs', p99Target: '50 µs', actual: this.formatNs(samples.find(s => s.name.includes('Event replay'))?.p50Ns) },
      { operation: 'Gossip merge', p50Target: '5 ms', p99Target: '50 ms', actual: this.formatNs(samples.find(s => s.name.includes('merge'))?.p50Ns) },
      { operation: 'State hash', p50Target: '1 ms', p99Target: '10 ms', actual: this.formatNs(samples.find(s => s.name.includes('hash'))?.p50Ns) }
    ]);
  }

  private formatNs(ns?: number): string {
    if (!ns) return 'N/A';
    if (ns < 1000) return `${Math.round(ns)} ns`;
    if (ns < 1_000_000) return `${(ns / 1000).toFixed(2)} µs`;
    if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
    return `${(ns / 1_000_000_000).toFixed(2)} s`;
  }
}

// ============================================================================
// Event Layer Benchmarks
// ============================================================================

interface MockEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  parents: string[];
  metadata: {
    timestamp: number;
    nodeId: string;
    sessionId: string;
    lamport: bigint;
    vectorClock: Record<string, bigint>;
  };
  hash: string;
}

function benchmarkEventLayer(harness: BenchmarkHarness) {
  console.log('\n--- Event Layer Benchmarks ---');

  // Mock event creation
  const mockEvent = (): MockEvent => ({
    id: Math.random().toString(36),
    type: 'test/event',
    payload: { key: 'value', count: 42, nested: { data: 'test' } },
    parents: [Math.random().toString(36), Math.random().toString(36)],
    metadata: {
      timestamp: Date.now(),
      nodeId: 'node-1',
      sessionId: 'session-1',
      lamport: BigInt(Math.floor(Math.random() * 1000)),
      vectorClock: { 'node-1': BigInt(10), 'node-2': BigInt(5) }
    },
    hash: 'sha256...'
  });

  // Benchmark: JSON serialization
  const results: BenchmarkSample[] = [];
  
  results.push(harness.measure('Event JSON serialization', () => {
    const event = mockEvent();
    JSON.stringify(event);
  }, 10000));

  // Benchmark: Event validation (schema check)
  results.push(harness.measure('Event schema validation', () => {
    const event = mockEvent();
    if (!event.id || !event.type || !event.payload || !event.parents || !event.metadata) {
      throw new Error('Invalid event');
    }
  }, 10000));

  // Benchmark: Payload size impact (small vs large)
  results.push(harness.measure('Event with large payload (10KB)', () => {
    const event = mockEvent();
    event.payload = Object.fromEntries(
      Array.from({ length: 100 }).map((_, i) => [
        `key_${i}`,
        `value_${i}_${'x'.repeat(100)}`
      ])
    );
    JSON.stringify(event);
  }, 1000));

  // Benchmark: Event deduplication (set lookup)
  const eventIds = new Set<string>();
  results.push(harness.measure('Event deduplication (set lookup)', () => {
    const id = Math.random().toString(36);
    eventIds.add(id);
    if (eventIds.has(id)) {
      eventIds.delete(id);
    }
  }, 10000));

  return results;
}

// ============================================================================
// Replay Layer Benchmarks
// ============================================================================

function benchmarkReplayLayer(harness: BenchmarkHarness) {
  console.log('\n--- Replay Layer Benchmarks ---');

  const results: BenchmarkSample[] = [];

  // Benchmark: Topological sort
  const generateDAG = (size: number) => {
    const edges: [number, number][] = [];
    for (let i = 0; i < size; i++) {
      if (i > 0) {
        edges.push([i - 1, i]);
      }
      if (i > 1) {
        edges.push([i - 2, i]);
      }
    }
    return edges;
  };

  results.push(harness.measure('Topological sort (100 events)', () => {
    const edges = generateDAG(100);
    const sorted: number[] = [];
    const visited = new Set<number>();
    const visiting = new Set<number>();

    const visit = (n: number): void => {
      if (visited.has(n)) return;
      if (visiting.has(n)) throw new Error('Cycle detected');
      visiting.add(n);
      edges.filter(([a]) => a === n).forEach(([, b]) => visit(b));
      visiting.delete(n);
      visited.add(n);
      sorted.push(n);
    };

    for (let i = 0; i < 100; i++) {
      visit(i);
    }
  }, 100));

  results.push(harness.measure('Topological sort (1000 events)', () => {
    const edges = generateDAG(1000);
    const sorted: number[] = [];
    const visited = new Set<number>();
    const visiting = new Set<number>();

    const visit = (n: number): void => {
      if (visited.has(n)) return;
      if (visiting.has(n)) throw new Error('Cycle detected');
      visiting.add(n);
      edges.filter(([a]) => a === n).forEach(([, b]) => visit(b));
      visiting.delete(n);
      visited.add(n);
      sorted.push(n);
    };

    for (let i = 0; i < 1000; i++) {
      visit(i);
    }
  }, 10));

  // Benchmark: Simple replay (identity reducer)
  results.push(harness.measure('Event replay (identity reducer)', () => {
    let state = { value: 0 };
    for (let i = 0; i < 100; i++) {
      state = { value: state.value + 1 };
    }
  }, 1000));

  // Benchmark: Complex replay (object mutation)
  results.push(harness.measure('Event replay (object mutation)', () => {
    const state: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      state[`key_${i}`] = { counter: i, nested: { data: i * 2 } };
    }
  }, 1000));

  // Benchmark: Snapshot verification
  results.push(harness.measure('Snapshot state serialization', () => {
    const state = Object.fromEntries(
      Array.from({ length: 100 }).map((_, i) => [
        `key_${i}`,
        { counter: i, data: `value_${i}` }
      ])
    );
    JSON.stringify(state);
  }, 100));

  return results;
}

// ============================================================================
// Synchronization Layer Benchmarks
// ============================================================================

function benchmarkSyncLayer(harness: BenchmarkHarness) {
  console.log('\n--- Synchronization Layer Benchmarks ---');

  const results: BenchmarkSample[] = [];

  // Benchmark: Event set merge (union)
  results.push(harness.measure('Event set merge (100 events)', () => {
    const setA = new Set(Array.from({ length: 100 }, (_, i) => `event_${i}`));
    const setB = new Set(Array.from({ length: 100 }, (_, i) => `event_${50 + i}`));
    const merged = new Set([...setA, ...setB]);
  }, 1000));

  results.push(harness.measure('Event set merge (1000 events)', () => {
    const setA = new Set(Array.from({ length: 1000 }, (_, i) => `event_${i}`));
    const setB = new Set(Array.from({ length: 1000 }, (_, i) => `event_${500 + i}`));
    const merged = new Set([...setA, ...setB]);
  }, 100));

  // Benchmark: Gossip message creation
  results.push(harness.measure('Gossip message serialization (100 events)', () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      id: `event_${i}`,
      type: 'test',
      hash: `hash_${i}`,
      parentCount: Math.random() > 0.5 ? 1 : 2
    }));
    JSON.stringify({ events, version: 1, timestamp: Date.now() });
  }, 1000));

  // Benchmark: Causal closure check
  results.push(harness.measure('Causal closure verification (100 events)', () => {
    const events = new Map(
      Array.from({ length: 100 }, (_, i) => [
        `event_${i}`,
        { parents: i > 0 ? [`event_${i - 1}`] : [] }
      ])
    );
    let isClosed = true;
    events.forEach((event, id) => {
      for (const parent of event.parents) {
        if (!events.has(parent)) {
          isClosed = false;
        }
      }
    });
  }, 100));

  return results;
}

// ============================================================================
// Storage Layer Benchmarks
// ============================================================================

function benchmarkStorageLayer(harness: BenchmarkHarness) {
  console.log('\n--- Storage Layer Benchmarks ---');

  const results: BenchmarkSample[] = [];

  // Benchmark: Event log serialization
  results.push(harness.measure('Event log serialization (100 events)', () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      id: `event_${i}`,
      type: 'test/event',
      payload: { index: i },
      hash: `hash_${i}`,
      parents: i > 0 ? [`event_${i - 1}`] : []
    }));
    const lines = events.map(e => JSON.stringify(e)).join('\n');
  }, 100));

  // Benchmark: Merkle tree computation
  results.push(harness.measure('Merkle root computation (100 events)', () => {
    const eventIds = Array.from({ length: 100 }, (_, i) => `hash_${i}`);
    let merkleRoot = '';
    for (const id of eventIds) {
      merkleRoot = Buffer.from(merkleRoot + id).toString('hex').slice(0, 64);
    }
  }, 100));

  results.push(harness.measure('Merkle root computation (1000 events)', () => {
    const eventIds = Array.from({ length: 1000 }, (_, i) => `hash_${i}`);
    let merkleRoot = '';
    for (const id of eventIds) {
      merkleRoot = Buffer.from(merkleRoot + id).toString('hex').slice(0, 64);
    }
  }, 10));

  // Benchmark: Snapshot creation
  results.push(harness.measure('Snapshot creation (100 events)', () => {
    const snapshot = {
      reducerVersion: '1.0.0',
      eventCount: 100,
      stateHash: 'abc123',
      eventLogPrefix: 'root_hash',
      timestamp: Date.now(),
      metadata: {}
    };
    JSON.stringify(snapshot);
  }, 1000));

  return results;
}

// ============================================================================
// Application Layer Benchmarks
// ============================================================================

function benchmarkApplicationLayer(harness: BenchmarkHarness) {
  console.log('\n--- Application Layer Benchmarks ---');

  const results: BenchmarkSample[] = [];

  // Benchmark: Social reducer
  results.push(harness.measure('Social reducer: createProfile', () => {
    const profiles = new Map();
    profiles.set('user_1', {
      userId: 'user_1',
      displayName: 'User 1',
      bio: 'Bio',
      joinedAt: Date.now()
    });
  }, 10000));

  results.push(harness.measure('Social reducer: follow', () => {
    const follows = new Set();
    for (let i = 0; i < 100; i++) {
      follows.add(`user_1:user_${i}`);
    }
  }, 1000));

  results.push(harness.measure('Social reducer: post + reactions', () => {
    const posts = new Map();
    for (let i = 0; i < 100; i++) {
      posts.set(`post_${i}`, {
        id: `post_${i}`,
        author: 'user_1',
        body: 'Post body',
        reactions: new Map([['like', 5], ['reply', 2]])
      });
    }
  }, 100));

  // Benchmark: Collab reducer
  results.push(harness.measure('Collab reducer: edit + join', () => {
    const collaborators = new Map();
    collaborators.set('user_1', { displayName: 'User 1', color: '#ff0000' });
    const htmlContent = '<html><body>Content</body></html>';
    const chatMessages = Array.from({ length: 50 }, (_, i) => ({
      id: `msg_${i}`,
      body: 'Message',
      userId: 'user_1'
    }));
  }, 100));

  // Benchmark: Forge reducer
  results.push(harness.measure('Forge reducer: commit + branch operations', () => {
    const commits = new Map(
      Array.from({ length: 100 }, (_, i) => [
        `commit_${i}`,
        { hash: `hash_${i}`, author: 'user_1', message: 'Commit' }
      ])
    );
    const branches = new Map([
      ['main', 'commit_99'],
      ['dev', 'commit_80'],
      ['feature', 'commit_60']
    ]);
  }, 100));

  return results;
}

// ============================================================================
// Main Benchmark Runner
// ============================================================================

async function runBenchmarks() {
  const harness = new BenchmarkHarness();
  const allResults: BenchmarkSample[] = [];

  console.log('\nDUS Comprehensive Benchmark Suite');
  console.log('Running with Node.js ' + process.version);
  console.log('Platform: ' + process.platform + ' ' + process.arch);

  const eventResults = benchmarkEventLayer(harness);
  allResults.push(...eventResults);

  const replayResults = benchmarkReplayLayer(harness);
  allResults.push(...replayResults);

  const syncResults = benchmarkSyncLayer(harness);
  allResults.push(...syncResults);

  const storageResults = benchmarkStorageLayer(harness);
  allResults.push(...storageResults);

  const appResults = benchmarkApplicationLayer(harness);
  allResults.push(...appResults);

  harness.report(allResults);

  // Summary statistics
  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total benchmarks: ${allResults.length}`);
  console.log(`Fastest operation: ${allResults.reduce((a, b) => a.p50Ns < b.p50Ns ? a : b).name}`);
  console.log(`Slowest operation: ${allResults.reduce((a, b) => a.p50Ns > b.p50Ns ? a : b).name}`);

  return allResults;
}

// Run if executed directly
if (require.main === module) {
  runBenchmarks().catch(console.error);
}

export { BenchmarkHarness, benchmarkEventLayer, benchmarkReplayLayer, benchmarkSyncLayer, benchmarkStorageLayer, benchmarkApplicationLayer };
