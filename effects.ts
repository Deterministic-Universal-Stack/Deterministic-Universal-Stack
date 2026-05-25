/**
 * DUS Effect System
 * 
 * Algebraic effect handlers for managing side effects in a deterministic way:
 * - I/O effects (file, network, console)
 * - State effects (get, set, update)
 * - Async effects (promises, timers)
 * - Resource effects (acquire, release)
 * - Error effects (try, catch, recover)
 */

import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

// ============================================================================
// EFFECT TYPES
// ============================================================================

export type Effect<T = unknown> = {
  type: string;
  payload: unknown;
  continuation: (result: T) => Effect<unknown> | T;
};

export type EffectHandler<T = unknown> = (
  effect: Effect<T>
) => Promise<T> | T;

export interface EffectHandlers {
  [key: string]: EffectHandler;
}

// ============================================================================
// CORE EFFECTS
// ============================================================================

// IO Effects
export const IO = {
  read: (path: string): Effect<string> => ({
    type: 'io.read',
    payload: { path },
    continuation: (content) => content,
  }),
  
  write: (path: string, content: string): Effect<void> => ({
    type: 'io.write',
    payload: { path, content },
    continuation: () => undefined,
  }),
  
  http: (url: string, options?: RequestInit): Effect<Response> => ({
    type: 'io.http',
    payload: { url, options },
    continuation: (response) => response,
  }),
  
  log: (message: string, level: 'info' | 'warn' | 'error' = 'info'): Effect<void> => ({
    type: 'io.log',
    payload: { message, level },
    continuation: () => undefined,
  }),
};

// State Effects
export const State = {
  get: <T>(key: string): Effect<T> => ({
    type: 'state.get',
    payload: { key },
    continuation: (value) => value,
  }),
  
  set: <T>(key: string, value: T): Effect<void> => ({
    type: 'state.set',
    payload: { key, value },
    continuation: () => undefined,
  }),
  
  update: <T>(key: string, fn: (current: T) => T): Effect<T> => ({
    type: 'state.update',
    payload: { key, fn },
    continuation: (newValue) => newValue,
  }),
  
  delete: (key: string): Effect<void> => ({
    type: 'state.delete',
    payload: { key },
    continuation: () => undefined,
  }),
};

// Async Effects
export const Async = {
  delay: (ms: number): Effect<void> => ({
    type: 'async.delay',
    payload: { ms },
    continuation: () => undefined,
  }),
  
  timeout: <T>(ms: number, effect: Effect<T>): Effect<T> => ({
    type: 'async.timeout',
    payload: { ms, effect },
    continuation: (result) => result,
  }),
  
  parallel: <T>(effects: Effect<T>[]): Effect<T[]> => ({
    type: 'async.parallel',
    payload: { effects },
    continuation: (results) => results,
  }),
  
  race: <T>(effects: Effect<T>[]): Effect<T> => ({
    type: 'async.race',
    payload: { effects },
    continuation: (result) => result,
  }),
};

// Resource Effects
export const Resource = {
  acquire: <T>(name: string, factory: () => T): Effect<T> => ({
    type: 'resource.acquire',
    payload: { name, factory },
    continuation: (resource) => resource,
  }),
  
  release: (name: string): Effect<void> => ({
    type: 'resource.release',
    payload: { name },
    continuation: () => undefined,
  }),
  
  use: <T, R>(
    name: string,
    factory: () => T,
    fn: (resource: T) => Effect<R>
  ): Effect<R> => ({
    type: 'resource.use',
    payload: { name, factory, fn },
    continuation: (result) => result,
  }),
};

// Error Effects
export const Err = {
  throw: (error: Error): Effect<never> => ({
    type: 'error.throw',
    payload: { error },
    continuation: () => {
      throw error;
    },
  }),
  
  try: <T>(effect: Effect<T>): Effect<T | Error> => ({
    type: 'error.try',
    payload: { effect },
    continuation: (result) => result,
  }),
  
  catch: <T>(
    effect: Effect<T>,
    handler: (error: Error) => Effect<T>
  ): Effect<T> => ({
    type: 'error.catch',
    payload: { effect, handler },
    continuation: (result) => result,
  }),
  
  recover: <T>(
    effect: Effect<T>,
    fallback: T
  ): Effect<T> => ({
    type: 'error.recover',
    payload: { effect, fallback },
    continuation: (result) => result,
  }),
};

// ============================================================================
// EFFECT INTERPRETER
// ============================================================================

export class EffectInterpreter extends EventEmitter {
  private handlers: EffectHandlers = {};
  private state: Map<string, unknown> = new Map();
  private resources: Map<string, unknown> = new Map();
  private trace: EffectTrace[] = [];
  
  constructor(private config: {
    enableTracing?: boolean;
    maxStackDepth?: number;
  } = {}) {
    super();
    this.registerDefaultHandlers();
  }
  
  // Register effect handler
  register(type: string, handler: EffectHandler): void {
    this.handlers[type] = handler;
  }
  
  // Run effect
  async run<T>(effect: Effect<T>): Promise<T> {
    const startTime = Date.now();
    const traceEntry: EffectTrace = {
      type: effect.type,
      payload: effect.payload,
      timestamp: startTime,
      result: null,
      error: null,
      duration: 0,
    };
    
    try {
      const handler = this.handlers[effect.type];
      
      if (!handler) {
        throw new Error(`No handler registered for effect type: ${effect.type}`);
      }
      
      const result = await handler(effect);
      
      traceEntry.result = result;
      traceEntry.duration = Date.now() - startTime;
      
      if (this.config.enableTracing) {
        this.trace.push(traceEntry);
        this.emit('trace', traceEntry);
      }
      
      return effect.continuation(result) as T;
      
    } catch (error) {
      traceEntry.error = error;
      traceEntry.duration = Date.now() - startTime;
      
      if (this.config.enableTracing) {
        this.trace.push(traceEntry);
      }
      
      throw error;
    }
  }
  
  // Run multiple effects in sequence
  async sequence<T>(effects: Effect<T>[]): Promise<T[]> {
    const results: T[] = [];
    
    for (const effect of effects) {
      results.push(await this.run(effect));
    }
    
    return results;
  }
  
  // Get execution trace
  getTrace(): EffectTrace[] {
    return [...this.trace];
  }
  
  // Clear trace
  clearTrace(): void {
    this.trace = [];
  }
  
  // Default handlers
  private registerDefaultHandlers(): void {
    // IO handlers
    this.register('io.read', async (effect) => {
      const { path } = effect.payload as { path: string };
      const { readFile } = await import('node:fs/promises');
      return readFile(path, 'utf-8');
    });
    
    this.register('io.write', async (effect) => {
      const { path, content } = effect.payload as { path: string; content: string };
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path, content, 'utf-8');
    });
    
    this.register('io.http', async (effect) => {
      const { url, options } = effect.payload as { url: string; options?: RequestInit };
      return fetch(url, options);
    });
    
    this.register('io.log', (effect) => {
      const { message, level } = effect.payload as { message: string; level: string };
      console[level as 'log'](message);
    });
    
    // State handlers
    this.register('state.get', (effect) => {
      const { key } = effect.payload as { key: string };
      return this.state.get(key);
    });
    
    this.register('state.set', (effect) => {
      const { key, value } = effect.payload as { key: string; value: unknown };
      this.state.set(key, value);
    });
    
    this.register('state.update', (effect) => {
      const { key, fn } = effect.payload as { key: string; fn: (current: unknown) => unknown };
      const current = this.state.get(key);
      const newValue = fn(current);
      this.state.set(key, newValue);
      return newValue;
    });
    
    this.register('state.delete', (effect) => {
      const { key } = effect.payload as { key: string };
      this.state.delete(key);
    });
    
    // Async handlers
    this.register('async.delay', (effect) => {
      const { ms } = effect.payload as { ms: number };
      return new Promise(resolve => setTimeout(resolve, ms));
    });
    
    this.register('async.timeout', async (effect) => {
      const { ms, effect: innerEffect } = effect.payload as { ms: number; effect: Effect };
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), ms);
      });
      
      return Promise.race([
        this.run(innerEffect),
        timeoutPromise,
      ]);
    });
    
    this.register('async.parallel', async (effect) => {
      const { effects } = effect.payload as { effects: Effect[] };
      return Promise.all(effects.map(e => this.run(e)));
    });
    
    this.register('async.race', async (effect) => {
      const { effects } = effect.payload as { effects: Effect[] };
      return Promise.race(effects.map(e => this.run(e)));
    });
    
    // Resource handlers
    this.register('resource.acquire', (effect) => {
      const { name, factory } = effect.payload as { name: string; factory: () => unknown };
      
      if (this.resources.has(name)) {
        return this.resources.get(name);
      }
      
      const resource = factory();
      this.resources.set(name, resource);
      return resource;
    });
    
    this.register('resource.release', (effect) => {
      const { name } = effect.payload as { name: string };
      this.resources.delete(name);
    });
    
    this.register('resource.use', async (effect) => {
      const { name, factory, fn } = effect.payload as {
        name: string;
        factory: () => unknown;
        fn: (resource: unknown) => Effect;
      };
      
      const resource = factory();
      this.resources.set(name, resource);
      
      try {
        return await this.run(fn(resource));
      } finally {
        this.resources.delete(name);
      }
    });
    
    // Error handlers
    this.register('error.throw', (effect) => {
      const { error } = effect.payload as { error: Error };
      throw error;
    });
    
    this.register('error.try', async (effect) => {
      const { effect: innerEffect } = effect.payload as { effect: Effect };
      
      try {
        return await this.run(innerEffect);
      } catch (error) {
        return error as Error;
      }
    });
    
    this.register('error.catch', async (effect) => {
      const { effect: innerEffect, handler } = effect.payload as {
        effect: Effect;
        handler: (error: Error) => Effect;
      };
      
      try {
        return await this.run(innerEffect);
      } catch (error) {
        return await this.run(handler(error as Error));
      }
    });
    
    this.register('error.recover', async (effect) => {
      const { effect: innerEffect, fallback } = effect.payload as {
        effect: Effect;
        fallback: unknown;
      };
      
      try {
        return await this.run(innerEffect);
      } catch {
        return fallback;
      }
    });
  }
}

// ============================================================================
// EFFECT TRACE
// ============================================================================

interface EffectTrace {
  type: string;
  payload: unknown;
  timestamp: number;
  result: unknown;
  error: unknown;
  duration: number;
}

// ============================================================================
// EFFECT COMBINATORS
// ============================================================================

export const Effects = {
  // Map over effect result
  map: <A, B>(effect: Effect<A>, fn: (a: A) => B): Effect<B> => ({
    type: 'effect.map',
    payload: { effect, fn },
    continuation: (result) => fn(result as A),
  }),
  
  // Chain effects
  flatMap: <A, B>(
    effect: Effect<A>,
    fn: (a: A) => Effect<B>
  ): Effect<B> => ({
    type: 'effect.flatMap',
    payload: { effect, fn },
    continuation: (result) => result,
  }),
  
  // Pure value
  pure: <T>(value: T): Effect<T> => ({
    type: 'effect.pure',
    payload: { value },
    continuation: () => value,
  }),
  
  // Sequence effects
  sequence: <T>(effects: Effect<T>[]): Effect<T[]> => ({
    type: 'effect.sequence',
    payload: { effects },
    continuation: (results) => results,
  }),
  
  // Traverse with effects
  traverse: <A, B>(
    items: A[],
    fn: (item: A) => Effect<B>
  ): Effect<B[]> => ({
    type: 'effect.traverse',
    payload: { items, fn },
    continuation: (results) => results,
  }),
};

// ============================================================================
// DETERMINISTIC EFFECT SYSTEM
// ============================================================================

export class DeterministicEffectSystem {
  private interpreter: EffectInterpreter;
  private eventLog: EffectEvent[] = [];
  
  constructor(config: {
    enableTracing?: boolean;
    enableReplay?: boolean;
  } = {}) {
    this.interpreter = new EffectInterpreter({
      enableTracing: config.enableTracing,
    });
  }
  
  // Execute effect and log
  async execute<T>(effect: Effect<T>): Promise<T> {
    const event: EffectEvent = {
      id: this.generateId(),
      effect,
      timestamp: Date.now(),
      result: null,
      error: null,
    };
    
    try {
      const result = await this.interpreter.run(effect);
      event.result = result;
      this.eventLog.push(event);
      return result;
    } catch (error) {
      event.error = error;
      this.eventLog.push(event);
      throw error;
    }
  }
  
  // Get event log
  getEventLog(): EffectEvent[] {
    return [...this.eventLog];
  }
  
  // Replay from log
  async replay(): Promise<void> {
    for (const event of this.eventLog) {
      if (event.error) {
        throw event.error;
      }
      
      await this.interpreter.run(event.effect);
    }
  }
  
  private generateId(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .slice(0, 16);
  }
}

interface EffectEvent {
  id: string;
  effect: Effect;
  timestamp: number;
  result: unknown;
  error: unknown;
}
