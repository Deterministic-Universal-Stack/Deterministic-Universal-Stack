// ============================================================
// GEMFLOW Ω  ·  js/core/constraints-improved.js
// Constraint propagation: taint tracking, range analysis,
// invariant pre-conditions, and CEI verification with enhanced
// error handling and reporting
// ============================================================

import { OP, SIDE_EFFECTS } from './ir-improved.js';

export class Constraint {
  constructor(variable, kind, value, confidence = 1.0, meta = {}) {
    this.variable   = variable;
    this.kind       = kind;   // 'taint' | 'range' | 'null' | 'nonnull' | 'guard' | 'storage'
    this.value      = value;
    this.confidence = confidence;
    this.meta       = meta;
    this.id         = `${variable}::${kind}`;
  }
  toString() { return `${this.variable} :: ${this.kind}(${JSON.stringify(this.value)})`; }
}

export class ConstraintStore {
  constructor() {
    this.map     = new Map();  // variable → Constraint[]
    this.tainted = new Set();
    this.bottom  = new Set();
    this.facts   = [];
    this.warnings = [];
  }

  add(c) {
    if (!this.map.has(c.variable)) this.map.set(c.variable, []);
    this.map.get(c.variable).push(c);
  }

  get(variable) { return this.map.get(variable) ?? []; }

  taint(variable, source, confidence = 0.9) {
    this.tainted.add(variable);
    this.add(new Constraint(variable, 'taint', { source }, confidence));
  }

  fact(kind, data) { this.facts.push({ kind, ...data }); }
  warn(message, meta = {}) { this.warnings.push({ message, ...meta }); }

  join(other) {
    for (const [v, cs] of other.map) for (const c of cs) this.add(c);
    for (const v of other.tainted) this.tainted.add(v);
    for (const v of other.bottom) this.bottom.add(v);
    this.facts.push(...other.facts);
    this.warnings.push(...other.warnings);
  }

  size() { return this.map.size; }
}

// ── Taint sources (Solidity-specific) ─────────────────────

const TAINT_SOURCES = new Set([
  'msg.sender','msg.value','msg.data','msg.sig',
  'tx.origin','tx.gasprice',
  'block.timestamp','block.number','block.coinbase','block.difficulty','block.prevrandao',
  'calldataload','<rhs>','param:address','param:uint256','param:bytes'
]);

function isTaintSource(str) {
  return TAINT_SOURCES.has(str) || str.startsWith('param:') ||
         str.includes('msg') || str.includes('tx.') || str.includes('block.');
}

// ── Block-level propagation ────────────────────────────────

function propagateBlock(irBlock, inStore, globals, is08Plus) {
  const out = new ConstraintStore();
  out.join(inStore);

  for (const instr of [...irBlock.phis, ...irBlock.instrs]) {
    try {
      switch (instr.op) {

        case OP.PARAM:
        case OP.ALLOC: {
          const src = instr.args[0] ?? '';
          if (isTaintSource(src) || inStore.tainted.has(src)) {
            out.taint(instr.dest, src);
          } else {
            out.add(new Constraint(instr.dest, 'range', { lo: 0, hi: 'UINT256_MAX' }));
          }
          break;
        }

        case OP.LOAD: {
          const sv = instr.meta?.stateVar;
          if (sv) {
            out.add(new Constraint(instr.dest, 'storage', { stateVar: sv }));
            out.add(new Constraint(instr.dest, 'range', { lo: 0, hi: 'UINT256_MAX' }));
            if (inStore.tainted.has(sv)) out.taint(instr.dest, `storage:${sv}`);
          }
          break;
        }

        case OP.STORE:
        case OP.ASSIGN:
        case OP.AUGASSIGN: {
          const sv = instr.meta?.stateVar;
          const rhsTainted = instr.args.some(a => inStore.tainted.has(a) || isTaintSource(a));

          if (sv && rhsTainted) {
            out.taint(instr.dest, instr.args[0]);
            out.fact('tainted_write', { stateVar: sv, line: instr.meta?.line, confidence: 0.92 });
          }

          if (sv && instr.meta?.augOp && !is08Plus) {
            out.fact('overflow_risk', { stateVar: sv, op: instr.meta.augOp, line: instr.meta?.line, confidence: 0.85 });
          }

          if (instr.meta?.ceiViolation) {
            out.fact('cei_violation', { stateVar: sv, line: instr.meta?.line, confidence: 0.97 });
          }
          break;
        }

        case OP.EXTCALL:
        case OP.DELEGATECALL:
        case OP.STATICCALL: {
          out.taint(instr.dest, 'external_call_return');
          out.fact('external_interaction', { op: instr.op, line: instr.meta?.line, confidence: 0.88 });
          if (instr.op === OP.DELEGATECALL) {
            out.fact('delegatecall_detected', { line: instr.meta?.line, confidence: 0.99 });
          }
          break;
        }

        case OP.REQUIRE:
        case OP.ASSERT: {
          out.add(new Constraint(instr.dest, 'guard', { op: instr.op, satisfied: true }));
          break;
        }

        case OP.TAINT_SOURCE: {
          out.taint(instr.dest, instr.args[0]);
          break;
        }

        case OP.PHI: {
          const anyTainted = instr.args.some(a => inStore.tainted.has(a));
          if (anyTainted) out.taint(instr.dest, 'phi:join');
          break;
        }
      }
    } catch (err) {
      out.warn(`Failed to propagate constraint for ${instr.op}: ${err.message}`, {
        block: irBlock.id,
        instruction: instr.toString?.() || String(instr)
      });
    }
  }

  return out;
}

// ── Worklist algorithm ─────────────────────────────────────

function propagateFunction(irFn, globals, is08Plus) {
  const blockIn  = new Map();
  const blockOut = new Map();

  for (const blk of irFn.blocks) {
    blockIn.set(blk.id, new ConstraintStore());
    blockOut.set(blk.id, new ConstraintStore());
  }

  // Seed entry with param taints
  const entryBlk = irFn.entryBlock;
  if (entryBlk) {
    const seed = new ConstraintStore();
    for (const p of irFn.params) {
      if (isTaintSource(`param:${p}`)) seed.taint(`param_${p}`, `param:${p}`);
    }
    blockIn.set(entryBlk.id, seed);
  }

  const worklist = irFn.blocks.map(b => b.id);
  let iters = 0;
  const MAX = 64;

  while (worklist.length && iters++ < MAX) {
    const id  = worklist.shift();
    const blk = irFn.blocks.find(b => b.id === id);
    if (!blk) continue;

    const newOut = propagateBlock(blk, blockIn.get(id), globals, is08Plus);
    blockOut.set(id, newOut);

    for (const succId of blk.succs) {
      const succIn = blockIn.get(succId) ?? new ConstraintStore();
      succIn.join(newOut);
      blockIn.set(succId, succIn);
      if (!worklist.includes(succId)) worklist.push(succId);
    }
  }

  if (iters >= MAX) {
    const merged = new ConstraintStore();
    merged.warn(`Constraint propagation hit iteration limit (${MAX}) for function ${irFn.name}`, {
      function: irFn.name,
      contract: irFn.contract
    });
    for (const [, out] of blockOut) merged.join(out);
    return merged;
  }

  // Merge all outputs
  const merged = new ConstraintStore();
  for (const [, out] of blockOut) merged.join(out);
  return merged;
}

// ── Public API ─────────────────────────────────────────────

export function propagateConstraints(irModules, ast) {
  const is08Plus = ast?.is08Plus ?? false;
  const results  = new Map();

  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      try {
        const cstore = propagateFunction(irFn, irMod.globals, is08Plus);
        results.set(`${irMod.contractName}.${fnName}`, cstore);
      } catch (err) {
        const errorStore = new ConstraintStore();
        errorStore.warn(`Failed to propagate constraints: ${err.message}`, {
          function: fnName,
          contract: irMod.contractName,
          error: err.stack
        });
        results.set(`${irMod.contractName}.${fnName}`, errorStore);
      }
    }
  }

  return results;
}

export function summarizeConstraints(results) {
  const summary = {
    taintedVars: 0, contradictions: 0,
    overflowRisks: [], taintedWrites: [],
    externalInteractions: [], delegatecalls: [],
    ceiViolations: [], totalFacts: 0, allFacts: [],
    warnings: []
  };

  for (const [fnKey, cstore] of results) {
    summary.taintedVars += cstore.tainted.size;
    summary.contradictions += cstore.bottom.size;
    summary.warnings.push(...cstore.warnings.map(w => ({ ...w, fn: fnKey })));
    
    for (const fact of cstore.facts) {
      summary.totalFacts++;
      summary.allFacts.push({ ...fact, fn: fnKey });
      if (fact.kind === 'overflow_risk')       summary.overflowRisks.push({ ...fact, fn: fnKey });
      if (fact.kind === 'tainted_write')       summary.taintedWrites.push({ ...fact, fn: fnKey });
      if (fact.kind === 'external_interaction')summary.externalInteractions.push({ ...fact, fn: fnKey });
      if (fact.kind === 'delegatecall_detected')summary.delegatecalls.push({ ...fact, fn: fnKey });
      if (fact.kind === 'cei_violation')       summary.ceiViolations.push({ ...fact, fn: fnKey });
    }
  }

  return summary;
}