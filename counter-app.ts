/**
 * Counter App - Simple DUS Application
 * 
 * Demonstrates:
 * - Basic event emission
 * - State management
 * - Metrics collection
 */

import { DUSRuntime, type State, type Event } from '../runtime/src/runtime.js';

// Define state type
interface CounterState {
  count: number;
  history: string[];
}

// Define reducer
const counterReducer = (state: State<CounterState>, event: Event): State<CounterState> => {
  const { value } = state;
  
  switch (event.type) {
    case 'increment': {
      const newValue = {
        count: value.count + 1,
        history: [...value.history, `increment at ${new Date(event.metadata.timestamp).toISOString()}`],
      };
      return {
        value: newValue,
        hash: JSON.stringify(newValue),
        eventCount: state.eventCount + 1n,
        metadata: {
          lastEventId: event.id,
          lastEventTimestamp: event.metadata.timestamp,
        },
      };
    }
    
    case 'decrement': {
      const newValue = {
        count: value.count - 1,
        history: [...value.history, `decrement at ${new Date(event.metadata.timestamp).toISOString()}`],
      };
      return {
        value: newValue,
        hash: JSON.stringify(newValue),
        eventCount: state.eventCount + 1n,
        metadata: {
          lastEventId: event.id,
          lastEventTimestamp: event.metadata.timestamp,
        },
      };
    }
    
    case 'reset': {
      const newValue = {
        count: 0,
        history: [...value.history, `reset at ${new Date(event.metadata.timestamp).toISOString()}`],
      };
      return {
        value: newValue,
        hash: JSON.stringify(newValue),
        eventCount: state.eventCount + 1n,
        metadata: {
          lastEventId: event.id,
          lastEventTimestamp: event.metadata.timestamp,
        },
      };
    }
    
    default:
      return state;
  }
};

// Run the app
async function main() {
  console.log('🔢 Counter App Starting...\n');
  
  // Create runtime
  const runtime = new DUSRuntime<CounterState>(
    'counter-node',
    counterReducer,
    { count: 0, history: [] },
    {
      enableMetrics: true,
      enableTracing: true,
      checkpointInterval: 3,
    }
  );
  
  // Listen to events
  runtime.on('event', (event) => {
    console.log(`📨 Event: ${event.type} (${event.id.slice(0, 8)}...)`);
  });
  
  runtime.on('checkpoint', (checkpoint) => {
    console.log(`💾 Checkpoint created at event ${checkpoint.eventId.slice(0, 8)}...`);
  });
  
  // Emit events
  console.log('▶️  Emitting events...\n');
  
  await runtime.emit('increment', {});
  await runtime.emit('increment', {});
  await runtime.emit('increment', {});
  await runtime.emit('decrement', {});
  await runtime.emit('increment', {});
  await runtime.emit('reset', {});
  await runtime.emit('increment', {});
  
  // Display final state
  const state = runtime.getState();
  console.log('\n📊 Final State:');
  console.log(`   Count: ${state.value.count}`);
  console.log(`   Events processed: ${state.eventCount}`);
  console.log(`   State hash: ${state.hash.slice(0, 16)}...`);
  
  console.log('\n📜 History:');
  state.value.history.forEach((entry, i) => {
    console.log(`   ${i + 1}. ${entry}`);
  });
  
  // Display metrics
  const metrics = runtime.getMetrics();
  console.log('\n⚡ Performance Metrics:');
  console.log(`   Events processed: ${metrics.eventsProcessed}`);
  console.log(`   Total time: ${metrics.totalExecutionTime}ms`);
  console.log(`   Avg latency: ${metrics.avgEventLatency.toFixed(3)}ms`);
  console.log(`   Peak memory: ${metrics.peakMemoryMB.toFixed(2)}MB`);
  console.log(`   Checkpoints: ${metrics.checkpointCount}`);
  
  // Display checkpoints
  const checkpoints = runtime.getCheckpoints();
  console.log('\n💾 Checkpoints:');
  checkpoints.forEach((cp, i) => {
    console.log(`   ${i + 1}. Event ${cp.eventId.slice(0, 8)}... → Count ${cp.state.value.count}`);
  });
  
  console.log('\n✅ Counter app completed successfully!');
}

main().catch(console.error);
