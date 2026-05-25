// ============================================================
// GEMFLOW Ω  ·  js/core/ssa-improved.js
// Static Single Assignment builder: AST → SSA form with
// dominance-based phi node insertion (Cytron's algorithm)
// ============================================================

export class SSAVar {
  constructor(original, version, type = 'unknown') {
    this.name   = `${original}_${version}`;
    this.orig   = original;
    this.ver    = version;
    this.type   = type;
  }
  toString() { return `%${this.name}`; }
  equals(other) { return other instanceof SSAVar && this.name === other.name; }
}

export class SSABlock {
  constructor(id, funcName) {
    this.id       = id;
    this.funcName = funcName;
    this.instrs   = [];
    this.preds    = [];
    this.succs    = [];
    this.phis     = [];
    this.defs     = new Map();    // original → SSAVar (latest def in block)
    this.idom     = null;          // immediate dominator
    this.domFront = [];            // dominance frontier
  }
}

export class SSAInstr {
  constructor(op, dest, args, meta = {}) {
    this.op   = op;
    this.dest = dest;
    this.args = args;
    this.meta = meta;
  }
  toString() {
    const d = this.dest ? `${this.dest} = ` : '';
    return `${d}${this.op}(${this.args.join(', ')})`;
  }
}

export class PhiNode {
  constructor(dest, incoming) {
    this.dest     = dest;
    this.incoming = incoming;   // Map<blockId, SSAVar>
  }
  toString() { 
    return `${this.dest} = φ(${[...this.incoming.values()].join(', ')})`; 
  }
}

export class SSAFunction {
  constructor(name, contract) {
    this.name     = name;
    this.contract = contract;
    this.blocks   = [];
    this.entry    = null;
    this.exit     = null;
    this._ver     = {};      // original → version counter
    this._env     = {};      // original → current SSAVar
    this.params   = [];
    this.returns  = [];
    this.flags    = {};
    this.domTree  = null;    // dominance tree
  }

  freshVer(orig) {
    this._ver[orig] = (this._ver[orig] ?? -1) + 1;
    return this._ver[orig];
  }

  def(orig, type = 'unknown') {
    const v = new SSAVar(orig, this.freshVer(orig), type);
    this._env[orig] = v;
    return v;
  }

  use(orig) {
    return this._env[orig] ?? new SSAVar(orig, 0, 'undef');
  }

  addBlock(blk) {
    this.blocks.push(blk);
    if (!this.entry) this.entry = blk.id;
    this.exit = blk.id;
  }
}

export class SSAModule {
  constructor(contractName) {
    this.contractName = contractName;
    this.functions    = new Map();
    this.globals      = new Map();
    this.stats        = {};
  }
}

// ── Dominance analysis (Lengauer-Tarjan) ─────────────────────

function computeDominators(fn) {
  const blocks = fn.blocks;
  const dom = new Map();
  const idom = new Map();

  // Initialize: entry dominates itself
  const entryBlk = blocks.find(b => b.id === fn.entry);
  if (!entryBlk) return { dom, idom };

  dom.set(fn.entry, new Set([fn.entry]));

  // Other blocks dominated by all blocks initially
  for (const blk of blocks) {
    if (blk.id !== fn.entry) {
      dom.set(blk.id, new Set(blocks.map(b => b.id)));
    }
  }

  // Fixed-point iteration
  let changed = true;
  while (changed) {
    changed = false;
    for (const blk of blocks) {
      if (blk.id === fn.entry) continue;

      let newDom = new Set(blocks.map(b => b.id));
      for (const predId of blk.preds) {
        const pred = blocks.find(b => b.id === predId);
        if (pred && dom.has(predId)) {
          const intersection = new Set([...dom.get(predId)].filter(x => newDom.has(x)));
          newDom = intersection;
        }
      }
      newDom.add(blk.id);

      const oldDom = dom.get(blk.id);
      if (oldDom.size !== newDom.size || ![...newDom].every(x => oldDom.has(x))) {
        dom.set(blk.id, newDom);
        changed = true;
      }
    }
  }

  // Compute immediate dominators
  for (const blk of blocks) {
    const domSet = dom.get(blk.id);
    const immDoms = [...domSet].filter(d => d !== blk.id);
    // Immediate dominator is the unique strict dominator not dominated by any other strict dominator
    let immediateMax = null;
    for (const d of immDoms) {
      let isDomByOther = false;
      for (const other of immDoms) {
        if (d !== other && dom.get(d).has(other)) isDomByOther = true;
      }
      if (!isDomByOther) immediateMax = d;
    }
    if (immediateMax) {
      idom.set(blk.id, immediateMax);
      const idomBlk = blocks.find(b => b.id === immediateMax);
      if (idomBlk) blk.idom = idomBlk;
    }
  }

  return { dom, idom };
}

// ── Dominance frontier computation ────────────────────────────

function computeDominanceFrontier(fn) {
  const { dom, idom } = computeDominators(fn);
  const blocks = fn.blocks;

  for (const blk of blocks) {
    blk.domFront = [];
    for (const succ of blk.succs) {
      const succBlk = blocks.find(b => b.id === succ);
      if (!succBlk) continue;

      let runner = blk;
      while (runner && idom.has(succBlk.id) && idom.get(succBlk.id) !== runner.id) {
        if (!blk.domFront.includes(succ)) blk.domFront.push(succ);
        runner = blocks.find(b => b.id === idom.get(runner.id));
      }
    }
  }
}

// ── Cytron's algorithm for phi insertion ──────────────────────

function insertPhiNodes(fn, globals) {
  computeDominanceFrontier(fn);

  // For each global variable
  for (const [varName] of globals) {
    const workList = new Set();
    const phiInserted = new Set();

    // Find all blocks that define this variable
    for (const blk of fn.blocks) {
      const hasStore = blk.instrs.some(
        i => i.meta?.stateVar === varName && (i.op === 'STORE' || i.op === 'AUGASSIGN')
      );
      if (hasStore) workList.add(blk.id);
    }

    // Propagate phi nodes to dominance frontier
    while (workList.size > 0) {
      const blockId = workList.values().next().value;
      workList.delete(blockId);
      const blk = fn.blocks.find(b => b.id === blockId);

      for (const frontId of (blk?.domFront ?? [])) {
        if (!phiInserted.has(frontId)) {
          const frontBlk = fn.blocks.find(b => b.id === frontId);
          if (frontBlk) {
            const incoming = new Map();
            for (const predId of frontBlk.preds) {
              incoming.set(predId, new SSAVar(varName, 0, 'unknown'));
            }
            const phiDest = new SSAVar(varName, fn.freshVer(varName), 'unknown');
            frontBlk.phis.push(new PhiNode(phiDest, incoming));
            phiInserted.add(frontId);

            if (!phiInserted.has(frontId)) {
              workList.add(frontId);
            }
          }
        }
      }
    }
  }
}

// ── Body-token micro-lifter ────────────────────────────────

const TAINT_SRCS = new Set(['msg','tx','block','abi','calldataload']);

function liftBodyTokens(fn, blk, tokens) {
  let i = 0;
  const p = (off=0) => tokens[i+off] ?? { type:'EOF', value:'' };
  const eat = () => tokens[i++] ?? { type:'EOF', value:'' };
  const skipSemi = () => { while (i < tokens.length && p().value !== ';') eat(); eat(); };

  while (i < tokens.length) {
    const t = p();
    if (!t || t.type === 'EOF') break;

    if (t.value === 'require' || t.value === 'assert') {
      const op = t.value.toUpperCase();
      eat();
      const cond = fn.def('_cond');
      blk.instrs.push(new SSAInstr(op, cond, ['<expr>'], { line: t.line, guard: true }));
      skipSemi();
      continue;
    }

    if (t.value === 'emit') {
      eat();
      const evName = p().value;
      eat();
      blk.instrs.push(new SSAInstr('EMIT', null, [evName], { line: t.line }));
      skipSemi();
      continue;
    }

    if (t.value === 'return') {
      eat();
      const ret = fn.def('_ret');
      blk.instrs.push(new SSAInstr('RETURN', ret, ['<expr>'], { line: t.line }));
      skipSemi();
      continue;
    }

    if (t.value === 'revert' || t.value === 'throw') {
      eat();
      blk.instrs.push(new SSAInstr('REVERT', null, [], { line: t.line }));
      skipSemi();
      continue;
    }

    if (t.type === 'DOT' || t.value === '.') {
      eat();
      const method = p().value;
      if (['call','delegatecall','staticcall','transfer','send'].includes(method)) {
        eat();
        const res = fn.def('_extres');
        const op = method === 'delegatecall' ? 'DELEGATECALL'
                 : method === 'staticcall'   ? 'STATICCALL'
                 : 'EXTCALL';
        blk.instrs.push(new SSAInstr(op, res, [`<target>.${method}`], { line: t.line, ext: true }));
      }
      continue;
    }

    if (t.type === 'IDENT' && (p(1).type === 'ASSIGN' || p(1).type === 'AUGASSIGN')) {
      const varName = eat().value;
      const opTok   = eat();
      const rhs     = fn.def(varName);
      const isState = fn._env[varName] && fn.globals && fn.globals.has(varName);
      const instrOp = isState ? 'STORE' : opTok.value !== '=' ? 'AUGASSIGN' : 'ASSIGN';
      blk.instrs.push(new SSAInstr(instrOp, rhs, ['<rhs>'], {
        line: t.line, stateVar: isState ? varName : null,
        augOp: opTok.value !== '=' ? opTok.value : null
      }));
      skipSemi();
      continue;
    }

    if (t.type === 'IDENT' && fn.globals && fn.globals.has(t.value)) {
      eat();
      const cur = fn.use(t.value);
      const ld  = fn.def('_load');
      blk.instrs.push(new SSAInstr('LOAD', ld, [cur], { line: t.line, stateVar: t.value }));
      continue;
    }

    if (t.type === 'IDENT' && TAINT_SRCS.has(t.value)) {
      eat();
      const tv = fn.def('_taint');
      blk.instrs.push(new SSAInstr('TAINT_SOURCE', tv, [t.value], { line: t.line }));
      continue;
    }

    eat();
  }
}

// ── Per-function SSA builder ───────────────────────────────

function buildFuncSSA(func, globals) {
  const fn = new SSAFunction(func.name, func.contract);
  fn.flags = func.block?.flags ?? {};
  fn.globals = globals;

  // Entry block: alloc params
  const entry = new SSABlock(`${func.name}.entry`, func.name);
  fn.addBlock(entry);
  for (const p of (func.params || [])) {
    const pname = p.name || `_p${fn.params.length}`;
    const ssaP  = fn.def(pname, p.type);
    entry.instrs.push(new SSAInstr('PARAM', ssaP, [`param:${p.type}`], { param: true, type: p.type }));
    fn.params.push(ssaP);
  }

  // Body block
  const body = new SSABlock(`${func.name}.body`, func.name);
  fn.addBlock(body);
  entry.succs.push(body.id);
  body.preds.push(entry.id);

  if (func.block?.body) liftBodyTokens(fn, body, func.block.body);

  // Phi node insertion via dominance frontier
  insertPhiNodes(fn, globals);

  // CEI violation detection
  const instrs = body.instrs;
  let extIdx = -1;
  for (let i2 = 0; i2 < instrs.length; i2++) {
    if (instrs[i2].op === 'EXTCALL' || instrs[i2].op === 'DELEGATECALL') extIdx = i2;
    if (extIdx >= 0 && i2 > extIdx && instrs[i2].op === 'STORE') {
      instrs[i2].meta.ceiViolation = true;
      fn.flags.ceiViolation = true;
    }
  }

  // Exit block
  const exit = new SSABlock(`${func.name}.exit`, func.name);
  fn.addBlock(exit);
  body.succs.push(exit.id);
  exit.preds.push(body.id);
  exit.instrs.push(new SSAInstr('HALT', null, [], { exit: true }));
  fn.exit = exit.id;

  return fn;
}

// ── Public API ─────────────────────────────────────────────

export function buildSSA(ast) {
  const modules = [];

  for (const contract of ast.contracts) {
    const mod = new SSAModule(contract.name);

    // Globals with proper slot allocation
    let slot = 0;
    for (const sv of (contract.stateVars || ast.stateVars.filter(v => v.contract === contract.name))) {
      mod.globals.set(sv.name, { type: sv.varType, slot: slot++ });
    }

    for (const func of contract.functions) {
      const fn = buildFuncSSA(func, mod.globals);
      mod.functions.set(func.name, fn);
    }

    // Compute stats
    let totalInstrs = 0, totalBlocks = 0, phiCount = 0;
    for (const [, f] of mod.functions) {
      totalBlocks += f.blocks.length;
      for (const b of f.blocks) {
        totalInstrs += b.instrs.length;
        phiCount += b.phis.length;
      }
    }
    mod.stats = { totalInstrs, totalBlocks, globals: mod.globals.size, phiNodes: phiCount };
    modules.push(mod);
  }

  return modules;
}

export function serializeSSA(modules) {
  const out = [];
  for (const mod of modules) {
    out.push(`; ══ ${mod.contractName} ══════════════════════════════`);
    out.push(`; globals: [${[...mod.globals.keys()].join(', ')}]`);
    for (const [, fn] of mod.functions) {
      out.push(`\ndefine @${fn.name}(${fn.params.map(p=>p.toString()).join(', ')}) {`);
      for (const blk of fn.blocks) {
        out.push(`  ${blk.id}:`);
        out.push(`    ; preds: [${blk.preds.join(', ')}], succs: [${blk.succs.join(', ')}]`);
        for (const phi of blk.phis) out.push(`    ${phi}`);
        for (const ins of blk.instrs) out.push(`    ${ins}`);
      }
      if (fn.flags.ceiViolation) out.push(`  ; ⚠ CEI VIOLATION DETECTED`);
      out.push('}');
    }
    out.push('');
  }
  return out.join('\n');
}
