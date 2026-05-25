// ============================================================
// GEMFLOW Ω  ·  js/core/ir-improved.js
// Canonical IR with EVM semantics, proper typing, and
// instruction cost estimation
// ============================================================

// EVM-aware instruction set
export const OP = {
  // Memory operations
  ALLOC:  'ALLOC',  LOAD:   'LOAD',   STORE:  'STORE',
  MLOAD:  'MLOAD',  MSTORE: 'MSTORE', MSTORE8:'MSTORE8',
  
  // Arithmetic (256-bit)
  ADD:    'ADD',    SUB:    'SUB',    MUL:    'MUL',    DIV:    'DIV',    MOD:    'MOD',
  SDIV:   'SDIV',   SMOD:   'SMOD',   EXP:    'EXP',    NEG:    'NEG',    ABS:    'ABS',
  
  // Bitwise
  SHL:    'SHL',    SHR:    'SHR',    SAR:    'SAR',    AND:    'AND',    OR:     'OR',
  XOR:    'XOR',    NOT:    'NOT',    BYTE:   'BYTE',   SIGNEXT:'SIGNEXT',
  
  // Comparison
  EQ:     'EQ',     NEQ:    'NEQ',    LT:     'LT',     GT:     'GT',
  LTE:    'LTE',    GTE:    'GTE',    SLT:    'SLT',    SGT:    'SGT',
  
  // Boolean logic
  LAND:   'LAND',   LOR:    'LOR',    LNOT:   'LNOT',
  
  // Control flow
  BRANCH: 'BRANCH', JUMP:   'JUMP',   RETURN: 'RETURN', HALT:   'HALT',
  REVERT: 'REVERT', THROW:  'THROW',
  
  // Calls
  CALL:   'CALL',   EXTCALL:'EXTCALL', STATICCALL:'STATICCALL', DELEGATECALL:'DELEGATECALL',
  CALLCODE:'CALLCODE',
  
  // EVM special
  GAS:    'GAS',    ADDRESS:'ADDRESS', CALLER: 'CALLER', CALLVALUE:'CALLVALUE',
  CALLDATALOAD:'CALLDATALOAD', CALLDATASIZE:'CALLDATASIZE', CALLDATACOPY:'CALLDATACOPY',
  CODESIZE:'CODESIZE', CODECOPY:'CODECOPY', EXTCODESIZE:'EXTCODESIZE', EXTCODECOPY:'EXTCODECOPY',
  BLOCKHASH:'BLOCKHASH', TIMESTAMP:'TIMESTAMP', NUMBER:'NUMBER', DIFFICULTY:'DIFFICULTY',
  GASLIMIT:'GASLIMIT', COINBASE:'COINBASE', ORIGIN:'ORIGIN',
  
  // Storage
  SLOAD:  'SLOAD',  SSTORE: 'SSTORE',
  
  // Logging
  LOG0:   'LOG0',   LOG1:   'LOG1',   LOG2:   'LOG2',   LOG3:   'LOG3',   LOG4:   'LOG4',
  EMIT:   'EMIT',
  
  // Higher-level patterns
  REQUIRE:'REQUIRE', ASSERT:'ASSERT',
  TAINT_SOURCE:'TAINT_SOURCE',
  
  // Normalization
  PHI:    'PHI',    PARAM:  'PARAM',  NOP:    'NOP',
  AUGASSIGN:'AUGASSIGN', ASSIGN:'ASSIGN'
};

// Operations with side effects
export const SIDE_EFFECTS = new Set([
  OP.STORE, OP.MSTORE, OP.SSTORE, OP.LOG0, OP.LOG1, OP.LOG2, OP.LOG3, OP.LOG4,
  OP.EXTCALL, OP.DELEGATECALL, OP.STATICCALL, OP.CALL, OP.CALLCODE,
  OP.EMIT, OP.REVERT, OP.REQUIRE, OP.ASSERT
]);

// Control flow terminators
export const TERMINATORS = new Set([
  OP.BRANCH, OP.JUMP, OP.RETURN, OP.HALT, OP.REVERT, OP.THROW
]);

// Gas cost approximation (Ethereum yellow paper)
const GAS_COSTS = {
  [OP.ADD]: 3,     [OP.MUL]: 5,    [OP.SUB]: 3,     [OP.DIV]: 5,
  [OP.LOAD]: 3,    [OP.STORE]: 3,  [OP.SLOAD]: 800, [OP.SSTORE]: 20000,
  [OP.CALL]: 700,  [OP.DELEGATECALL]: 700, [OP.EXTCALL]: 700,
  [OP.JUMP]: 8,    [OP.BRANCH]: 10,
  [OP.REQUIRE]: 0, [OP.ASSERT]: 0
};

// Solidity type system mapping
export class SolidityType {
  constructor(name, bits = 256, isSigned = false) {
    this.name = name;
    this.bits = bits;
    this.isSigned = isSigned;
  }

  static UINT256 = new SolidityType('uint256', 256, false);
  static INT256 = new SolidityType('int256', 256, true);
  static ADDRESS = new SolidityType('address', 160, false);
  static BOOL = new SolidityType('bool', 1, false);
  static BYTES32 = new SolidityType('bytes32', 256, false);
  static UINT = new SolidityType('uint', 256, false);
  static INT = new SolidityType('int', 256, true);

  static fromString(str) {
    const m = str.match(/^(u?int)(\d+)?$/);
    if (m) {
      const bits = m[2] ? parseInt(m[2]) : 256;
      return new SolidityType(str, bits, m[1].startsWith('i'));
    }
    if (str === 'address') return SolidityType.ADDRESS;
    if (str === 'bool') return SolidityType.BOOL;
    if (str === 'bytes32') return SolidityType.BYTES32;
    return new SolidityType(str, 256, false);
  }

  canOverflow() { return this.bits < 256; }
  range() {
    const max = 2n**BigInt(this.bits) - 1n;
    const min = this.isSigned ? -(2n**BigInt(this.bits-1)) : 0n;
    return { min, max };
  }
}

// Canonical IR instruction with full EVM semantics
export class IRInstr {
  constructor(op, dest, args, type = 'void', meta = {}) {
    this.op   = op;
    this.dest = dest;         // string (IR var name) | null
    this.args = args;         // string[]
    this.type = type;         // result type string or SolidityType
    this.meta = meta;         // { line, stateVar, ceiViolation, guard, ext, param, ... }
    this.sideEffect = SIDE_EFFECTS.has(op);
    this.isTerminator = TERMINATORS.has(op);
    this.gasCost = GAS_COSTS[op] ?? 1;  // estimated gas
  }

  toString() {
    const d = this.dest ? `${this.type}/${this.dest} = ` : '';
    return `${d}${this.op}(${this.args.map(String).join(', ')}) [gas: ${this.gasCost}]`;
  }

  isMemoryOp() {
    return [OP.LOAD, OP.STORE, OP.MLOAD, OP.MSTORE].includes(this.op);
  }

  isStorageOp() {
    return [OP.SLOAD, OP.SSTORE].includes(this.op);
  }

  isExternalCall() {
    return [OP.CALL, OP.EXTCALL, OP.DELEGATECALL, OP.STATICCALL, OP.CALLCODE].includes(this.op);
  }

  canRevert() {
    return this.isExternalCall() || [OP.REQUIRE, OP.ASSERT, OP.REVERT].includes(this.op);
  }
}

// Basic block with EVM instruction flow
export class IRBlock {
  constructor(id, funcName) {
    this.id       = id;
    this.funcName = funcName;
    this.instrs   = [];
    this.preds    = [];
    this.succs    = [];
    this.phis     = [];
    this.domFront = [];
    this.gasEstimate = 0;   // cumulative gas cost
  }

  push(i) { 
    this.instrs.push(i); 
    this.gasEstimate += i.gasCost;
  }

  get terminator() { return this.instrs.find(i => i.isTerminator) ?? null; }
  
  get hasSideEffect() { return this.instrs.some(i => i.sideEffect); }
  
  get revertPossible() { return this.instrs.some(i => i.canRevert()); }
  
  get externalCalls() { return this.instrs.filter(i => i.isExternalCall()); }
  
  get storageOps() { return this.instrs.filter(i => i.isStorageOp()); }
}

// Function-level IR with EVM context
export class IRFunction {
  constructor(name, contract, params, returnTypes, flags) {
    this.name        = name;
    this.contract    = contract;
    this.params      = params;         // SolidityType[] or string[]
    this.returnTypes = returnTypes;    // SolidityType[] or string[]
    this.blocks      = [];
    this.entry       = null;
    this.exit        = null;
    this.flags       = flags ?? {};
    this.ceiViolation= flags?.ceiViolation ?? false;
    this.visibility  = flags?.visibility ?? 'internal';
    this.mutability  = flags?.mutability ?? 'nonpayable';
    this.gasEstimate = 0;
  }

  get entryBlock() { return this.blocks.find(b => b.id === this.entry); }
  get exitBlock()  { return this.blocks.find(b => b.id === this.exit); }
  get allInstrs()  { return this.blocks.flatMap(b => b.instrs); }
  get sideEffects(){ return this.allInstrs.filter(i => i.sideEffect); }
  get externalCalls() { return this.allInstrs.filter(i => i.isExternalCall()); }
  
  updateGasEstimate() {
    this.gasEstimate = this.blocks.reduce((sum, b) => sum + b.gasEstimate, 0);
    return this.gasEstimate;
  }

  isViewFunction() { return this.mutability === 'view'; }
  isPureFunction() { return this.mutability === 'pure'; }
  isPayable() { return this.flags?.payable ?? false; }
}

// Module-level IR (contract)
export class IRModule {
  constructor(contractName) {
    this.contractName = contractName;
    this.functions    = new Map();
    this.globals      = new Map();
    this.stats        = {};
  }
}

// ── SSA → IR normalization with type inference ─────────────

function inferType(ssaMeta) {
  if (ssaMeta?.type) return SolidityType.fromString(ssaMeta.type);
  if (ssaMeta?.param) return SolidityType.UINT256;  // default param
  if (ssaMeta?.stateVar) return SolidityType.UINT256; // default storage
  return SolidityType.UINT256;
}

function normInstr(ssaInstr) {
  const { op, dest, args, meta } = ssaInstr;
  const destStr  = dest ? dest.toString() : null;
  const argsStr  = args.map(a => (a && typeof a === 'object' && a.toString) ? a.toString() : String(a));
  const normOp   = OP[op] ?? (op.includes('ASSIGN') ? OP.ASSIGN : OP.NOP);
  const typeHint = inferType(meta);
  return new IRInstr(normOp, destStr, argsStr, typeHint.name, meta);
}

function normBlock(ssaBlock) {
  const irBlk = new IRBlock(ssaBlock.id, ssaBlock.funcName);
  irBlk.preds = [...ssaBlock.preds];
  irBlk.succs = [...ssaBlock.succs];

  // Phi nodes
  for (const phi of ssaBlock.phis) {
    irBlk.push(new IRInstr(OP.PHI,
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

function normFunction(ssaFn, flags) {
  const paramTypes  = ssaFn.params.map(p => p.type ?? SolidityType.UINT256);
  const returnTypes = ssaFn.returns ?? [];
  const irFn = new IRFunction(ssaFn.name, ssaFn.contract, paramTypes, returnTypes, flags);

  for (const blk of ssaFn.blocks) {
    const irBlk = normBlock(blk);
    irFn.blocks.push(irBlk);
  }

  irFn.entry = ssaFn.entry;
  irFn.exit  = ssaFn.exit;
  irFn.ceiViolation = ssaFn.flags?.ceiViolation ?? false;
  irFn.updateGasEstimate();
  return irFn;
}

// ── Public API ─────────────────────────────────────────────

export function normalizeIR(ssaModules, astMetadata) {
  return ssaModules.map(ssaMod => {
    const irMod = new IRModule(ssaMod.contractName);
    irMod.globals = new Map(ssaMod.globals);

    for (const [name, ssaFn] of ssaMod.functions) {
      const fnAst = astMetadata?.functions?.find(f => f.name === name);
      const flags = {
        ...ssaFn.flags,
        visibility: fnAst?.visibility,
        mutability: fnAst?.mutability,
        payable: fnAst?.mutability === 'payable'
      };
      irMod.functions.set(name, normFunction(ssaFn, flags));
    }

    // Compute stats
    let totalInstrs = 0, totalBlocks = 0, sideEffectCount = 0;
    let totalGas = 0;
    for (const [, fn] of irMod.functions) {
      totalBlocks += fn.blocks.length;
      totalInstrs += fn.allInstrs.length;
      sideEffectCount += fn.sideEffects.length;
      totalGas += fn.gasEstimate;
    }
    irMod.stats = {
      functions: irMod.functions.size,
      globals: irMod.globals.size,
      totalBlocks, totalInstrs, sideEffectCount,
      estimatedGas: totalGas,
      avgBlockSize: totalBlocks > 0 ? (totalInstrs / totalBlocks).toFixed(2) : 0
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
      lines.push(`  ; visibility: ${fn.visibility}, mutability: ${fn.mutability}, gas: ${fn.gasEstimate}`);
      for (const blk of fn.blocks) {
        lines.push(`  ${blk.id}: [gas: ${blk.gasEstimate}]`);
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
