// ============================================================
// GEMFLOW Ω  ·  js/core/symbolic-improved.js
// Symbolic Execution Engine — walks IR basic blocks with
// symbolic state, forks on branches, and collects path
// conditions + reachability facts. Enhanced with better
// path exploration and state merging.
// ============================================================

import { OP } from './ir-improved.js';

// ── Symbolic values ────────────────────────────────────────

export class SymVar {
  constructor(name, type = 'i256') { this.name = name; this.type = type; }
  toString() { return `sym(${this.name}:${this.type})`; }
  equals(other) { return other instanceof SymVar && this.name === other.name && this.type === other.type; }
}

export class SymExpr {
  constructor(op, args, type = 'i256') { this.op = op; this.args = args; this.type = type; }
  toString() { return `(${this.op} ${this.args.map(String).join(' ')})`; }
  equals(other) {
    return other instanceof SymExpr && 
           this.op === other.op && 
           this.args.length === other.args.length &&
           this.args.every((a, i) => {
             const oa = other.args[i];
             return (a?.equals ? a.equals(oa) : a === oa);
           });
  }
}

export class SymConst {
  constructor(value, type = 'i256') { this.value = value; this.type = type; }
  toString() { return String(this.value); }
  equals(other) { return other instanceof SymConst && this.value === other.value; }
}

// ── Path condition ─────────────────────────────────────────

export class PathCondition {
  constructor() { this.clauses = []; }
  add(clause) { this.clauses.push(clause); return this; }
  clone() { const p = new PathCondition(); p.clauses = [...this.clauses]; return p; }
  
  isSat() {
    // Lightweight satisfiability: check for obvious contradictions
    const seen = new Set();
    for (const c of this.clauses) {
      const str = c.toString();
      if (c instanceof SymExpr && c.op === 'NOT') {
        const inner = c.args[0]?.toString();
        if (seen.has(inner)) return false; // p ∧ ¬p
      }
      if (seen.has(`NOT(${str})`)) return false;
      seen.add(str);
    }
    
    // Check for x < 0 where x is unsigned
    for (const c of this.clauses) {
      if (c instanceof SymExpr && c.op === '<') {
        const [lhs, rhs] = c.args;
        if (lhs instanceof SymVar && lhs.type.includes('uint') && 
            rhs instanceof SymConst && Number(rhs.value) === 0) {
          return false; // uint < 0 is always false
        }
      }
    }
    
    return true;
  }
  
  toString() { return this.clauses.map(String).join(' ∧ '); }
}

// ── Symbolic state ─────────────────────────────────────────

export class SymState {
  constructor() {
    this.env       = new Map();   // IRvar → SymValue
    this.path      = new PathCondition();
    this.storage   = new Map();   // stateVar → SymValue
    this.callStack = [];
    this.events    = [];          // EMIT records
    this.reverted  = false;
    this.flags     = {};
    this.pc        = 0;           // program counter for tracking
  }

  set(name, val) { this.env.set(name, val); }
  get(name) { return this.env.get(name) ?? new SymVar(name); }

  setStorage(sv, val) { this.storage.set(sv, val); }
  getStorage(sv) { return this.storage.get(sv) ?? new SymVar(`storage.${sv}`); }

  clone() {
    const s = new SymState();
    s.env     = new Map(this.env);
    s.path    = this.path.clone();
    s.storage = new Map(this.storage);
    s.callStack = [...this.callStack];
    s.events  = [...this.events];
    s.reverted = this.reverted;
    s.flags   = { ...this.flags };
    s.pc      = this.pc;
    return s;
  }

  merge(other) {
    // Merge two states at a join point
    const merged = new SymState();
    
    // Join environments: if values differ, create phi
    const allVars = new Set([...this.env.keys(), ...other.env.keys()]);
    for (const v of allVars) {
      const v1 = this.get(v);
      const v2 = other.get(v);
      if (v1.equals && v1.equals(v2)) {
        merged.set(v, v1);
      } else {
        merged.set(v, new SymVar(`${v}_merged`));
      }
    }

    // Join storage similarly
    const allStorage = new Set([...this.storage.keys(), ...other.storage.keys()]);
    for (const sv of allStorage) {
      const s1 = this.getStorage(sv);
      const s2 = other.getStorage(sv);
      if (s1.equals && s1.equals(s2)) {
        merged.setStorage(sv, s1);
      } else {
        merged.setStorage(sv, new SymVar(`${sv}_merged`));
      }
    }

    // Merge path conditions (disjunction at join points)
    merged.path.add(new SymExpr('OR', [this.path, other.path]));
    
    // Merge flags conservatively
    merged.flags = {
      hasExtCall: this.flags.hasExtCall || other.flags.hasExtCall,
      hasDelegatecall: this.flags.hasDelegatecall || other.flags.hasDelegatecall,
      ceiViolation: this.flags.ceiViolation || other.flags.ceiViolation
    };

    merged.reverted = this.reverted && other.reverted;
    merged.events = [...new Set([...this.events, ...other.events])];

    return merged;
  }
}

// ── Symbolic execution of a single block ──────────────────

function execBlock(irBlock, state) {
  const forks = [];

  for (const instr of [...irBlock.phis, ...irBlock.instrs]) {
    if (state.reverted) break;

    state.pc++;

    try {
      switch (instr.op) {

        case OP.PARAM:
        case OP.ALLOC:
        case OP.ASSIGN: {
          const v = instr.args[0] === '<rhs>'
            ? new SymVar(instr.dest ?? '_v')
            : (typeof instr.args[0] === 'number' || !isNaN(Number(instr.args[0])))
              ? new SymConst(instr.args[0])
              : new SymVar(String(instr.args[0]));
          if (instr.dest) state.set(instr.dest, v);
          break;
        }

        case OP.LOAD: {
          const sv = instr.meta?.stateVar;
          const val = sv ? state.getStorage(sv) : new SymVar(instr.args[0] ?? '_load');
          if (instr.dest) state.set(instr.dest, val);
          break;
        }

        case OP.STORE:
        case OP.AUGASSIGN: {
          const sv = instr.meta?.stateVar;
          if (sv) {
            const prev = state.getStorage(sv);
            const rhs  = state.get(instr.args[0] ?? '_rhs');
            const newVal = instr.meta?.augOp
              ? new SymExpr(instr.meta.augOp, [prev, rhs])
              : rhs;
            state.setStorage(sv, newVal);
            if (instr.meta?.ceiViolation) {
              state.flags.ceiViolation = true;
              state.flags.ceiStorageVar = sv;
            }
          }
          break;
        }

        case OP.REQUIRE:
        case OP.ASSERT: {
          const condVar = instr.args[0] ?? '_cond';
          const cond = state.get(condVar);
          state.path.add(cond);
          
          // Fork: if condition fails → reverted path
          const failState = state.clone();
          failState.reverted = true;
          failState.flags.revertReason = instr.op;
          failState.path.add(new SymExpr('NOT', [cond]));
          forks.push({ state: failState, reason: `${instr.op} fail` });
          break;
        }

        case OP.EXTCALL:
        case OP.DELEGATECALL:
        case OP.STATICCALL: {
          const retVal = new SymVar(`_extret_${instr.dest ?? 'r'}`, 'bool');
          if (instr.dest) state.set(instr.dest, retVal);
          state.flags.hasExtCall = true;
          if (instr.op === OP.DELEGATECALL) state.flags.hasDelegatecall = true;

          // Fork: external call succeeds vs fails
          const failState = state.clone();
          failState.reverted = true;
          if (instr.dest) failState.set(instr.dest, new SymConst(0));
          failState.path.add(new SymExpr('call_failed', [retVal]));
          forks.push({ state: failState, reason: 'EXTCALL revert' });
          
          state.path.add(new SymExpr('call_success', [retVal]));
          break;
        }

        case OP.EMIT: {
          state.events.push({ name: instr.args[0], line: instr.meta?.line, pc: state.pc });
          break;
        }

        case OP.REVERT: {
          state.reverted = true;
          state.flags.revertReason = instr.args[0] || 'REVERT';
          break;
        }

        case OP.RETURN: {
          const retSym = instr.dest ? state.get(instr.dest) : new SymVar('_return');
          if (instr.dest) state.set(instr.dest, retSym);
          state.flags.returned = true;
          break;
        }

        case OP.TAINT_SOURCE: {
          state.set(instr.dest, new SymVar(`taint.${instr.args[0]}`));
          state.flags.hasTaint = true;
          break;
        }

        case OP.PHI: {
          // Join: pick an unconstrained symbolic value
          if (instr.dest) {
            const sources = instr.args.map(a => state.get(a));
            const allSame = sources.every(s => s.equals && s.equals(sources[0]));
            if (allSame) {
              state.set(instr.dest, sources[0]);
            } else {
              state.set(instr.dest, new SymVar(`phi.${instr.dest}`));
            }
          }
          break;
        }

        default: {
          // Generic arithmetic/logical operations
          if (instr.dest && instr.args.length > 0) {
            const symArgs = instr.args.map(a => {
              if (typeof a === 'number') return new SymConst(a);
              if (typeof a === 'string') return state.get(a);
              return a;
            });
            state.set(instr.dest, new SymExpr(instr.op, symArgs));
          }
        }
      }
    } catch (err) {
      // Gracefully handle instruction execution errors
      if (instr.dest) {
        state.set(instr.dest, new SymVar(`_error_${instr.dest}`));
      }
    }
  }

  return { finalState: state, forks };
}

// ── Function-level symbolic execution ─────────────────────

function execFunction(irFn, lattice) {
  const MAX_PATHS = 32;
  const paths = [];
  const stateCache = new Map(); // blockId → SymState (for merging)

  // Initial state with symbolic params
  const initState = new SymState();
  for (let i = 0; i < irFn.params.length; i++) {
    initState.set(`param_${i}`, new SymVar(`P${i}`, irFn.params[i]));
  }

  // Initialize storage from lattice
  if (lattice) {
    for (const [varName, elem] of lattice.vars) {
      try {
        if (elem.kind === 'const') {
          initState.setStorage(varName, new SymConst(elem.value));
        } else if (elem.kind === 'range') {
          initState.setStorage(varName, new SymVar(`${varName}∈[${elem.value.lo},${elem.value.hi}]`));
        } else {
          initState.setStorage(varName, new SymVar(varName));
        }
      } catch (err) {
        initState.setStorage(varName, new SymVar(varName));
      }
    }
  }

  // BFS over blocks with state merging
  const queue = [{ blockId: irFn.entry, state: initState }];
  const visited = new Map(); // blockId → visit count

  while (queue.length && paths.length < MAX_PATHS) {
    const { blockId, state } = queue.shift();
    const blk = irFn.blocks.find(b => b.id === blockId);
    if (!blk) continue;

    // Track visits to avoid infinite loops
    const visitCount = visited.get(blockId) || 0;
    if (visitCount > 3) continue; // Limit revisits
    visited.set(blockId, visitCount + 1);

    // Check if we should merge with existing state
    if (stateCache.has(blockId)) {
      const cachedState = stateCache.get(blockId);
      const mergedState = state.merge(cachedState);
      stateCache.set(blockId, mergedState);
    } else {
      stateCache.set(blockId, state.clone());
    }

    const { finalState, forks } = execBlock(blk, state.clone());

    // Record each completed path
    if (finalState.path.isSat()) {
      paths.push({
        blockId,
        state: finalState,
        sat: true,
        reverted: finalState.reverted,
        storage: Object.fromEntries(finalState.storage),
        events: finalState.events,
        flags: finalState.flags,
        pathCondition: finalState.path.toString(),
        pc: finalState.pc
      });
    }

    // Fork paths
    for (const fork of forks) {
      if (fork.state.path.isSat()) {
        paths.push({ 
          blockId, 
          state: fork.state, 
          sat: true, 
          reverted: true, 
          reason: fork.reason,
          pathCondition: fork.state.path.toString(),
          pc: fork.state.pc
        });
      }
    }

    // Push successors
    for (const succId of blk.succs) {
      queue.push({ blockId: succId, state: finalState.clone() });
    }
  }

  return {
    name: irFn.name,
    contract: irFn.contract,
    totalPaths: paths.length,
    reachablePaths: paths.filter(p => !p.reverted).length,
    revertedPaths: paths.filter(p => p.reverted).length,
    ceiViolation: paths.some(p => p.flags?.ceiViolation),
    hasDelegatecall: paths.some(p => p.flags?.hasDelegatecall),
    hasExtCall: paths.some(p => p.flags?.hasExtCall),
    hasTaint: paths.some(p => p.flags?.hasTaint),
    storageAtExit: paths.filter(p => !p.reverted).map(p => p.storage),
    paths: paths.slice(0, 8),  // keep first 8 for display
    pathLimitReached: paths.length >= MAX_PATHS
  };
}

// ── Public API ─────────────────────────────────────────────

export function symbolicExecute(irModules, lattices) {
  const results = [];

  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      const key = `${irMod.contractName}.${fnName}`;
      const lattice = lattices?.get(key);
      
      try {
        const result  = execFunction(irFn, lattice);
        result.key = key;
        results.push(result);
      } catch (err) {
        results.push({
          key,
          name: fnName,
          contract: irMod.contractName,
          error: err.message,
          errorStack: err.stack,
          totalPaths: 0,
          reachablePaths: 0,
          revertedPaths: 0
        });
      }
    }
  }

  return results;
}

export function summarizeSymbolic(results) {
  const validResults = results.filter(r => !r.error);
  
  return {
    totalFunctions: results.length,
    successfulAnalyses: validResults.length,
    failedAnalyses: results.length - validResults.length,
    ceiViolations:  validResults.filter(r => r.ceiViolation).map(r => r.key),
    delegatecalls:  validResults.filter(r => r.hasDelegatecall).map(r => r.key),
    extCalls:       validResults.filter(r => r.hasExtCall).map(r => r.key),
    taintedPaths:   validResults.filter(r => r.hasTaint).map(r => r.key),
    avgPaths:       validResults.length 
      ? (validResults.reduce((s, r) => s + r.totalPaths, 0) / validResults.length).toFixed(1) 
      : 0,
    pathLimitReached: validResults.filter(r => r.pathLimitReached).length,
    errors: results.filter(r => r.error).map(r => ({ key: r.key, error: r.error }))
  };
}