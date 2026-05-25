// ============================================================
// GEMFLOW Ω  ·  js/core/ir.js
// Canonical IR — canonicalizes SSA modules into a typed,
// normalized instruction set for downstream analysis passes.
// ============================================================

export const OP = {
  // Memory
  ALLOC: 'ALLOC', LOAD: 'LOAD', STORE: 'STORE',
  // Arithmetic
  ADD:'ADD', SUB:'SUB', MUL:'MUL', DIV:'DIV', MOD:'MOD', EXP:'EXP',
  NEG:'NEG', ABS:'ABS',
  // Bitwise
  SHL:'SHL', SHR:'SHR', AND:'AND', OR:'OR', XOR:'XOR', NOT:'NOT',
  // Compare
  EQ:'EQ', NEQ:'NEQ', LT:'LT', GT:'GT', LTE:'LTE', GTE:'GTE',
  // Logic
  LAND:'LAND', LOR:'LOR', LNOT:'LNOT',
  // Control
  BRANCH:'BRANCH', JUMP:'JUMP', RETURN:'RETURN', HALT:'HALT', REVERT:'REVERT',
  // Calls
  CALL:'CALL', EXTCALL:'EXTCALL', DELEGATECALL:'DELEGATECALL', STATICCALL:'STATICCALL',
  // EVM-specific
  REQUIRE:'REQUIRE', ASSERT:'ASSERT', EMIT:'EMIT',
  TAINT_SOURCE:'TAINT_SOURCE',
  // Normalization artifacts
  PHI:'PHI', PARAM:'PARAM', NOP:'NOP', AUGASSIGN:'AUGASSIGN', ASSIGN:'ASSIGN'
};

export const SIDE_EFFECTS = new Set([
  OP.STORE, OP.EXTCALL, OP.DELEGATECALL, OP.STATICCALL,
  OP.EMIT, OP.REVERT, OP.REQUIRE, OP.ASSERT
]);

export const TERMINATORS = new Set([OP.BRANCH, OP.JUMP, OP.RETURN, OP.HALT, OP.REVERT]);

// Canonical IR instruction
export class IRInstr {
  constructor(op, dest, args, type = 'void', meta = {}) {
    this.op   = op;
    this.dest = dest;       // string (IR var name) | null
    this.args = args;       // string[]
    this.type = type;       // result type
    this.meta = meta;       // { line, stateVar, ceiViolation, guard, ext, param, ... }
    this.sideEffect = SIDE_EFFECTS.has(op);
    this.isTerminator = TERMINATORS.has(op);
  }
  toString() {
    const d = this.dest ? `${this.type} ${this.dest} = ` : '';
    return `${d}${this.op} ${this.args.map(String).join(', ')}`.trim();
  }
}

export class IRBlock {
  constructor(id, funcName) {
    this.id       = id;
    this.funcName = funcName;
    this.instrs   = [];
    this.preds    = [];
    this.succs    = [];
    this.phis     = [];
    this.domFront = [];
  }
  push(i) { this.instrs.push(i); }
  get terminator() { return this.instrs.find(i => i.isTerminator) ?? null; }
  get hasSideEffect() { return this.instrs.some(i => i.sideEffect); }
}

export class IRFunction {
  constructor(name, contract, params, returnTypes, flags) {
    this.name        = name;
    this.contract    = contract;
    this.params      = params;
    this.returnTypes = returnTypes;
    this.blocks      = [];
    this.entry       = null;
    this.exit        = null;
    this.flags       = flags ?? {};
    this.ceiViolation= flags?.ceiViolation ?? false;
  }
  get entryBlock() { return this.blocks.find(b => b.id === this.entry); }
  get exitBlock()  { return this.blocks.find(b => b.id === this.exit); }
  get allInstrs()  { return this.blocks.flatMap(b => b.instrs); }
  get sideEffects(){ return this.allInstrs.filter(i => i.sideEffect); }
}

export class IRModule {
  constructor(contractName) {
    this.contractName = contractName;
    this.functions    = new Map();
    this.globals      = new Map();
    this.stats        = {};
  }
}

// ── SSA → IR normalization ─────────────────────────────────

function normInstr(ssaInstr) {
  const { op, dest, args, meta } = ssaInstr;
  const destStr  = dest ? dest.toString() : null;
  const argsStr  = args.map(a => (a && typeof a === 'object' && a.toString) ? a.toString() : String(a));
  const normOp   = OP[op] ?? (op.includes('ASSIGN') ? OP.ASSIGN : OP.NOP);
  const typeHint = meta?.type ?? (meta?.param ? 'param' : meta?.stateVar ? 'storage' : 'i256');
  return new IRInstr(normOp, destStr, argsStr, typeHint, meta);
}

function normBlock(ssaBlock) {
  const irBlk = new IRBlock(ssaBlock.id, ssaBlock.funcName);
  irBlk.preds = [...ssaBlock.preds];
  irBlk.succs = [...ssaBlock.succs];

  // Phi nodes
  for (const phi of ssaBlock.phis) {
    irBlk.phis.push(new IRInstr(OP.PHI,
      phi.dest?.toString() ?? null,
      [...phi.incoming.values()].map(v => v?.toString() ?? '?'),
      'i256', { phi: true }
    ));
  }

  // Instructions
  for (const instr of ssaBlock.instrs) {
    irBlk.push(normInstr(instr));
  }

  return irBlk;
}

function normFunction(ssaFn) {
  const paramTypes  = ssaFn.params.map(p => p.type ?? 'unknown');
  const returnTypes = ssaFn.returns ?? [];
  const irFn = new IRFunction(ssaFn.name, ssaFn.contract, paramTypes, returnTypes, ssaFn.flags);

  for (const blk of ssaFn.blocks) {
    const irBlk = normBlock(blk);
    irFn.blocks.push(irBlk);
  }

  irFn.entry = ssaFn.entry;
  irFn.exit  = ssaFn.exit;
  irFn.ceiViolation = ssaFn.flags?.ceiViolation ?? false;
  return irFn;
}

// ── Public API ─────────────────────────────────────────────

export function normalizeIR(ssaModules) {
  return ssaModules.map(ssaMod => {
    const irMod = new IRModule(ssaMod.contractName);
    irMod.globals = new Map(ssaMod.globals);

    for (const [name, ssaFn] of ssaMod.functions) {
      irMod.functions.set(name, normFunction(ssaFn));
    }

    // Compute stats
    let totalInstrs = 0, totalBlocks = 0, sideEffectCount = 0;
    for (const [, fn] of irMod.functions) {
      totalBlocks += fn.blocks.length;
      totalInstrs += fn.allInstrs.length;
      sideEffectCount += fn.sideEffects.length;
    }
    irMod.stats = {
      functions: irMod.functions.size,
      globals: irMod.globals.size,
      totalBlocks, totalInstrs, sideEffectCount
    };

    return irMod;
  });
}

export function serializeIR(irModules) {
  const lines = [];
  for (const mod of irModules) {
    lines.push(`; ══ IR MODULE: ${mod.contractName} ══════════════════════`);
    lines.push(`; globals: ${[...mod.globals.keys()].join(', ')}`);
    for (const [, fn] of mod.functions) {
      lines.push(`\ndefine @${fn.name}(${fn.params.join(', ')}) -> (${fn.returnTypes.join(', ') || 'void'}) {`);
      for (const blk of fn.blocks) {
        lines.push(`  ${blk.id}:`);
        for (const phi of blk.phis) lines.push(`    [φ] ${phi}`);
        for (const ins of blk.instrs) lines.push(`    ${ins}`);
      }
      if (fn.ceiViolation) lines.push(`  ; ⚠ CEI VIOLATION`);
      lines.push('}');
    }
    lines.push('');
  }
  return lines.join('\n');
}
