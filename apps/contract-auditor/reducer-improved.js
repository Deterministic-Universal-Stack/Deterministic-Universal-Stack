// ============================================================
// GEMFLOW Ω  ·  js/core/reducer-improved.js
// CFG Builder & Semantic Reducer — constructs control flow graph,
// computes reachability, and produces semantically correct state machine
// ============================================================

export const EVENT = {
  DEPLOY:         'DEPLOY',
  CALL:           'CALL',
  STATE_WRITE:    'STATE_WRITE',
  EXTERNAL_CALL:  'EXTERNAL_CALL',
  EMIT:           'EMIT',
  REVERT:         'REVERT',
  GUARD_PASS:     'GUARD_PASS',
  GUARD_FAIL:     'GUARD_FAIL',
  CEI_VIOLATION:  'CEI_VIOLATION',
  DELEGATECALL:   'DELEGATECALL',
  UNREACHABLE:    'UNREACHABLE'
};

export class SemanticEvent {
  constructor(type, payload, confidence = 1.0) {
    this.type       = type;
    this.payload    = payload;
    this.confidence = confidence;
    this.timestamp  = Date.now();
    this.id         = `ev_${type}_${Math.random().toString(36).slice(2, 7)}`;
  }
}

export class SemanticState {
  constructor() {
    this.transitions         = [];      // SemanticEvent[]
    this.deterministic       = true;
    this.stateVars           = new Map();
    this.callGraph           = new Map();
    this.controlFlow         = new Map(); // blockId → reachability info
    this.invariantViolations = [];
    this.findings            = [];
    this.provenPaths         = 0;
    this.revertedPaths       = 0;
    this.unreachableBlocks   = [];
    this.metadata            = {};
  }

  push(event) {
    this.transitions.push(event);
    if (event.type === EVENT.CEI_VIOLATION) this.deterministic = false;
  }

  snapshot() {
    return {
      transitions: this.transitions.length,
      deterministic: this.deterministic,
      findings: this.findings.length,
      stateVars: this.stateVars.size,
      unreachable: this.unreachableBlocks.length
    };
  }
}

// ── Control Flow Graph builder ────────────────────────────────

class CFGNode {
  constructor(blockId, funcName) {
    this.blockId    = blockId;
    this.funcName   = funcName;
    this.preds      = [];       // predecessor block IDs
    this.succs      = [];       // successor block IDs
    this.reachable  = false;
    this.live       = false;
    this.postdom    = null;
  }
}

class ControlFlowGraph {
  constructor() {
    this.nodes      = new Map();   // blockId → CFGNode
    this.entry      = null;
    this.exit       = null;
  }

  addNode(blockId, funcName) {
    if (!this.nodes.has(blockId)) {
      this.nodes.set(blockId, new CFGNode(blockId, funcName));
    }
    return this.nodes.get(blockId);
  }

  addEdge(from, to) {
    const fromNode = this.nodes.get(from);
    const toNode = this.nodes.get(to);
    if (fromNode && toNode) {
      if (!fromNode.succs.includes(to)) fromNode.succs.push(to);
      if (!toNode.preds.includes(from)) toNode.preds.push(from);
    }
  }

  computeReachability() {
    if (!this.entry) return;

    const visited = new Set();
    const queue = [this.entry];
    visited.add(this.entry);

    while (queue.length > 0) {
      const nodeId = queue.shift();
      const node = this.nodes.get(nodeId);
      if (node) {
        node.reachable = true;
        for (const succ of node.succs) {
          if (!visited.has(succ)) {
            visited.add(succ);
            queue.push(succ);
          }
        }
      }
    }

    // Mark unreachable nodes
    for (const [, node] of this.nodes) {
      if (!node.reachable && node.blockId !== this.exit) {
        // Node is unreachable
      }
    }
  }

  getUnreachable() {
    const unreachable = [];
    for (const [blockId, node] of this.nodes) {
      if (!node.reachable) unreachable.push(blockId);
    }
    return unreachable;
  }
}

// ── CFG construction from IR ─────────────────────────────────

function buildCFG(irFn) {
  const cfg = new ControlFlowGraph();

  // Add all blocks
  for (const blk of irFn.blocks) {
    cfg.addNode(blk.id, irFn.name);
  }

  cfg.entry = irFn.entry;
  cfg.exit = irFn.exit;

  // Add edges from IR block structure
  for (const blk of irFn.blocks) {
    const term = blk.terminator;
    
    if (term?.op === 'BRANCH') {
      // Conditional: both paths are successors
      for (const succ of blk.succs) {
        cfg.addEdge(blk.id, succ);
      }
    } else if (term?.op === 'JUMP' || term?.op === 'RETURN') {
      // Unconditional
      for (const succ of blk.succs) {
        cfg.addEdge(blk.id, succ);
      }
    } else if (term?.op === 'REVERT' || term?.op === 'HALT') {
      // Terminal: no successors
    } else {
      // Fall-through: connect to successors
      for (const succ of blk.succs) {
        cfg.addEdge(blk.id, succ);
      }
    }
  }

  cfg.computeReachability();
  return cfg;
}

// ── Reducer function: Event × State → State ───────────────────

function reduce(state, event) {
  state.push(event);

  switch (event.type) {

    case EVENT.DEPLOY: {
      const { contract } = event.payload;
      state.metadata.contract = contract;
      break;
    }

    case EVENT.STATE_WRITE: {
      const { varName, newValue } = event.payload;
      state.stateVars.set(varName, newValue);
      break;
    }

    case EVENT.CEI_VIOLATION: {
      state.deterministic = false;
      state.invariantViolations.push({
        type: 'CEI',
        ...event.payload,
        confidence: event.confidence,
        class: 'reentrancy'
      });
      state.findings.push({
        id: `f_cei_${state.findings.length}`,
        title: 'Reentrancy: CEI Pattern Violation',
        severity: 'critical',
        description: `External call in ${event.payload.fn} precedes state mutation of '${event.payload.stateVar ?? 'unknown'}'. Classic reentrancy vector.`,
        confidence: event.confidence,
        fn: event.payload.fn,
        evidence: ['EXTCALL before STORE in SSA block', 'Taint propagates through call return'],
        remediation: 'Reorder: perform state mutations before external calls. Use checks-effects-interactions pattern.'
      });
      break;
    }

    case EVENT.DELEGATECALL: {
      state.invariantViolations.push({ 
        type: 'DELEGATECALL', 
        ...event.payload,
        class: 'storage_context'
      });
      state.findings.push({
        id: `f_dc_${state.findings.length}`,
        title: 'Dangerous Delegatecall Detected',
        severity: 'high',
        description: `Function ${event.payload.fn} uses delegatecall, executing callee code in caller's storage context. Risk of unintended storage mutations.`,
        confidence: event.confidence,
        fn: event.payload.fn,
        evidence: ['DELEGATECALL opcode detected', 'Storage context shared with callee'],
        remediation: 'Verify delegatecall target is fully trusted. Document storage layout compatibility.'
      });
      break;
    }

    case EVENT.EXTERNAL_CALL: {
      state.findings.push({
        id: `f_ext_${state.findings.length}`,
        title: 'External Interaction Detected',
        severity: 'medium',
        description: `Function ${event.payload.fn} makes an external call. Verify return value is checked and no reentrancy vectors exist.`,
        confidence: event.confidence,
        fn: event.payload.fn,
        evidence: ['EXTCALL opcode', 'Return value may be unchecked'],
        remediation: 'Check call return value. Use pull pattern or CEI for state mutations.'
      });
      break;
    }

    case EVENT.UNREACHABLE: {
      const { blockId } = event.payload;
      state.unreachableBlocks.push(blockId);
      break;
    }
  }

  return state;
}

// ── Event extraction from symbolic results ──────────────────

function extractEvents(symbolicResults, irModules, constraintSummary, cfgs) {
  const events = [];

  // Contract deploy events
  for (const irMod of irModules) {
    events.push(new SemanticEvent(EVENT.DEPLOY, { contract: irMod.contractName }, 1.0));
  }

  // Unreachable block events
  for (const [funcKey, cfg] of cfgs) {
    for (const blockId of cfg.getUnreachable()) {
      events.push(new SemanticEvent(EVENT.UNREACHABLE, { blockId, fn: funcKey }, 0.95));
    }
  }

  // Events from symbolic execution
  for (const result of symbolicResults) {
    if (result.ceiViolation) {
      events.push(new SemanticEvent(EVENT.CEI_VIOLATION, {
        fn: result.name, stateVar: result.storageAtExit?.[0]
          ? Object.keys(result.storageAtExit[0])[0] : null
      }, 0.95));
    }

    if (result.hasDelegatecall) {
      events.push(new SemanticEvent(EVENT.DELEGATECALL, { fn: result.name }, 0.99));
    }

    if (result.hasExtCall && !result.ceiViolation) {
      events.push(new SemanticEvent(EVENT.EXTERNAL_CALL, { fn: result.name }, 0.88));
    }
  }

  // Events from constraint analysis
  for (const fact of (constraintSummary?.allFacts ?? [])) {
    if (fact.kind === 'overflow_risk') {
      events.push(new SemanticEvent(EVENT.STATE_WRITE, {
        fn: fact.fn, varName: fact.stateVar, type: 'overflow_risk'
      }, fact.confidence ?? 0.8));
    }
  }

  return events;
}

// ── Overflow / arithmetic findings ──────────────────────────

function buildArithmeticFindings(state, constraintSummary, ast) {
  const is08Plus = ast?.is08Plus ?? false;

  for (const risk of (constraintSummary?.overflowRisks ?? [])) {
    if (!is08Plus || ast.uncheckedSites?.length > 0) {
      state.findings.push({
        id: `f_of_${state.findings.length}`,
        title: `Arithmetic ${is08Plus ? 'Unchecked' : 'Overflow'} Risk`,
        severity: is08Plus ? 'medium' : 'high',
        description: `State variable '${risk.stateVar}' in ${risk.fn} subject to ${risk.op} without${is08Plus ? ' explicit unchecked block' : ' SafeMath'}.`,
        confidence: risk.confidence,
        fn: risk.fn,
        evidence: [
          is08Plus ? 'Solidity 0.8+ auto-reverts on overflow (medium risk)' : 'Pre-0.8: no overflow protection',
          `Augmented assignment '${risk.op}' on storage slot`
        ],
        remediation: is08Plus 
          ? 'Use explicit `unchecked { }` blocks for intentional overflows with documentation'
          : 'Use SafeMath library or upgrade to Solidity 0.8+'
      });
    }
  }
}

// ── Access control findings ────────────────────────────────

function buildAccessControlFindings(state, ast, irModules) {
  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      if (irFn.flags?.visibility === 'public' || irFn.flags?.visibility === 'external') {
        const hasModifier = irFn.flags?.modifiers?.length > 0;
        const hasRequireSender = irFn.allInstrs.some(i =>
          i.op === 'REQUIRE' && String(i.args).includes('sender')
        );
        if (!hasModifier && !hasRequireSender && !irFn.flags?.isConstructor) {
          // Check if function actually mutates state
          const mutatesState = irFn.allInstrs.some(i => i.op === 'STORE' || i.op === 'AUGASSIGN');
          if (mutatesState) {
            state.findings.push({
              id: `f_ac_${state.findings.length}`,
              title: 'Missing Access Control on State-Mutating Function',
              severity: 'high',
              description: `${fnName} in ${irMod.contractName} is ${irFn.flags?.visibility ?? 'public'} and mutates state without a modifier or msg.sender check.`,
              confidence: 0.75,
              fn: fnName,
              evidence: ['No modifier on function head', 'No require(msg.sender == ...) guard', 'STORE instruction in body block'],
              remediation: 'Add access control: use modifier pattern (e.g., onlyOwner) or require(msg.sender == authorized_address)'
            });
          }
        }
      }
    }
  }
}

// ── Public API ─────────────────────────────────────────────

export function buildControlFlowGraphs(irModules) {
  const cfgs = new Map();
  
  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      const cfg = buildCFG(irFn);
      cfgs.set(`${irMod.contractName}.${fnName}`, cfg);
    }
  }

  return cfgs;
}

export function semanticReduce(symbolicResults, irModules, constraintSummary, ast) {
  // Build control flow graphs
  const cfgs = buildControlFlowGraphs(irModules);

  // Extract events
  const events = extractEvents(symbolicResults, irModules, constraintSummary, cfgs);
  const state  = new SemanticState();

  // Run reducer
  for (const event of events) {
    reduce(state, event);
  }

  // Store CFG analysis
  for (const [fnKey, cfg] of cfgs) {
    state.controlFlow.set(fnKey, {
      nodes: cfg.nodes.size,
      unreachable: cfg.getUnreachable().length,
      edges: [...cfg.nodes.values()].reduce((s, n) => s + n.succs.length, 0)
    });
  }

  // Additional analysis passes
  buildArithmeticFindings(state, constraintSummary, ast);
  buildAccessControlFindings(state, ast, irModules);

  state.provenPaths  = symbolicResults.reduce((s, r) => s + r.reachablePaths, 0);
  state.revertedPaths = symbolicResults.reduce((s, r) => s + r.revertedPaths, 0);

  return state;
}
