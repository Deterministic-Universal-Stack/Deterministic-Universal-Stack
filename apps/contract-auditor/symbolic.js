// ============================================================
// GEMFLOW Ω  ·  js/core/symbolic.js
// Symbolic Execution Engine — walks IR basic blocks with
// symbolic state, forks on branches, and collects path
// conditions + reachability facts.
// ============================================================

import { OP } from './ir.js';

// ── Symbolic values ────────────────────────────────────────

export class SymVar {
  constructor(name, type = 'i256') { this.name = name; this.type = type; }
  toString() { return `sym(${this.name}:${this.type})`; }
}

export class SymExpr {
  constructor(op, args, type = 'i256') { this.op = op; this.args = args; this.type = type; }
  toString() { return `(${this.op} ${this.args.map(String).join(' ')})`; }
}

export class SymConst {
  constructor(value, type = 'i256') { this.value = value; this.type = type; }
  toString() { return String(this.value); }
}

// ── Path condition ─────────────────────────────────────────

export class PathCondition {
  constructor() { this.clauses = []; }
  add(clause) { this.clauses.push(clause); }
  clone() { const p = new PathCondition(); p.clauses = [...this.clauses]; return p; }
  isSat() {
    // Lightweight satisfiability: check for obvious contradictions (x < 0 for uint)
    for (const c of this.clauses) {
      if (c instanceof SymExpr && c.op === 'NOT' && this.clauses.includes(c.args[0])) return false;
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
    return s;
  }
}

// ── Symbolic execution of a single block ──────────────────

function execBlock(irBlock, state) {
  const forks = [];

  for (const instr of [...irBlock.phis, ...irBlock.instrs]) {
    if (state.reverted) break;

    switch (instr.op) {

      case OP.PARAM:
      case OP.ALLOC:
      case OP.ASSIGN: {
        const v = instr.args[0] === '<rhs>'
          ? new SymVar(instr.dest ?? '_v')
          : new SymConst(instr.args[0]);
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
          const rhs  = new SymVar(instr.args[0] ?? '_rhs');
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
        const cond = new SymVar('_cond');
        state.path.add(cond);
        // Fork: if condition fails → reverted path
        const failState = state.clone();
        failState.reverted = true;
        failState.flags.revertReason = instr.op;
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
        failState.set(instr.dest, new SymConst(0));
        forks.push({ state: failState, reason: 'EXTCALL revert' });
        state.path.add(new SymExpr('call_success', [retVal]));
        break;
      }

      case OP.EMIT: {
        state.events.push({ name: instr.args[0], line: instr.meta?.line });
        break;
      }

      case OP.REVERT: {
        state.reverted = true;
        break;
      }

      case OP.RETURN: {
        const retSym = new SymVar(instr.dest ?? '_return');
        if (instr.dest) state.set(instr.dest, retSym);
        break;
      }

      case OP.TAINT_SOURCE: {
        state.set(instr.dest, new SymVar(`taint.${instr.args[0]}`));
        break;
      }

      case OP.PHI: {
        // Join: pick an unconstrained symbolic value
        if (instr.dest) state.set(instr.dest, new SymVar(`phi.${instr.dest}`));
        break;
      }
    }
  }

  return { finalState: state, forks };
}

// ── Function-level symbolic execution ─────────────────────

function execFunction(irFn, lattice) {
  const MAX_PATHS = 32;
  const paths = [];

  // Initial state with symbolic params
  const initState = new SymState();
  for (let i = 0; i < irFn.params.length; i++) {
    initState.set(`param_${i}`, new SymVar(`P${i}`, irFn.params[i]));
  }

  // Initialize storage from lattice
  if (lattice) {
    for (const [varName, elem] of lattice.vars) {
      if (elem.kind === 'const') initState.setStorage(varName, new SymConst(elem.value));
      else if (elem.kind === 'range') initState.setStorage(varName, new SymVar(`${varName}∈[${elem.value.lo},${elem.value.hi}]`));
      else initState.setStorage(varName, new SymVar(varName));
    }
  }

  // BFS over blocks
  const queue = [{ blockId: irFn.entry, state: initState }];
  const visited = new Set();

  while (queue.length && paths.length < MAX_PATHS) {
    const { blockId, state } = queue.shift();
    const blk = irFn.blocks.find(b => b.id === blockId);
    if (!blk || visited.has(blockId + JSON.stringify([...state.env.keys()]))) continue;
    visited.add(blockId);

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
        pathCondition: finalState.path.toString()
      });
    }

    // Fork paths
    for (const fork of forks) {
      if (fork.state.path.isSat()) {
        paths.push({ blockId, state: fork.state, sat: true, reverted: true, reason: fork.reason });
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
    storageAtExit: paths.filter(p => !p.reverted).map(p => p.storage),
    paths: paths.slice(0, 8)  // keep first 8 for display
  };
}

// ── Public API ─────────────────────────────────────────────

export function symbolicExecute(irModules, lattices) {
  const results = [];

  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      const key = `${irMod.contractName}.${fnName}`;
      const lattice = lattices?.get(key);
      const result  = execFunction(irFn, lattice);
      result.key = key;
      results.push(result);
    }
  }

  return results;
}

export function summarizeSymbolic(results) {
  return {
    totalFunctions: results.length,
    ceiViolations:  results.filter(r => r.ceiViolation).map(r => r.key),
    delegatecalls:  results.filter(r => r.hasDelegatecall).map(r => r.key),
    extCalls:       results.filter(r => r.hasExtCall).map(r => r.key),
    avgPaths:       results.length ? (results.reduce((s, r) => s + r.totalPaths, 0) / results.length).toFixed(1) : 0
  };
}
