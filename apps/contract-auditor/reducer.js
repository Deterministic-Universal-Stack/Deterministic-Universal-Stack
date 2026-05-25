// ============================================================
// GEMFLOW Ω  ·  js/core/reducer.js
// Deterministic Semantic Reducer — folds symbolic execution
// results into a canonical state machine.
// State(t+1) = Reducer(State(t), Event)
// ============================================================

// ── Semantic event types ───────────────────────────────────

export const EVENT = {
  DEPLOY:        'DEPLOY',
  CALL:          'CALL',
  STATE_WRITE:   'STATE_WRITE',
  EXTERNAL_CALL: 'EXTERNAL_CALL',
  EMIT:          'EMIT',
  REVERT:        'REVERT',
  GUARD_PASS:    'GUARD_PASS',
  GUARD_FAIL:    'GUARD_FAIL',
  CEI_VIOLATION: 'CEI_VIOLATION',
  DELEGATECALL:  'DELEGATECALL',
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

// ── Semantic state ─────────────────────────────────────────

export class SemanticState {
  constructor() {
    this.transitions      = [];   // SemanticEvent[]
    this.deterministic    = true;
    this.stateVars        = new Map();    // varName → last known symbolic value
    this.callGraph        = new Map();    // fnName → Set<fnName>
    this.invariantViolations = [];
    this.findings         = [];
    this.provenPaths      = 0;
    this.revertedPaths    = 0;
    this.metadata         = {};
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
      stateVars: this.stateVars.size
    };
  }
}

// ── Reducer function: Event × State → State ───────────────

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
        confidence: event.confidence
      });
      state.findings.push({
        id: `f_cei_${state.findings.length}`,
        title: 'Reentrancy: CEI Pattern Violation',
        severity: 'critical',
        description: `External call in ${event.payload.fn} precedes state mutation of '${event.payload.stateVar ?? 'unknown'}'. Classic reentrancy vector.`,
        confidence: event.confidence,
        fn: event.payload.fn,
        evidence: ['EXTCALL before STORE in SSA block', 'Taint propagates through call return']
      });
      break;
    }

    case EVENT.DELEGATECALL: {
      state.invariantViolations.push({ type: 'DELEGATECALL', ...event.payload });
      state.findings.push({
        id: `f_dc_${state.findings.length}`,
        title: 'Dangerous delegatecall Detected',
        severity: 'high',
        description: `Function ${event.payload.fn} uses delegatecall, which executes in the caller's storage context.`,
        confidence: event.confidence,
        fn: event.payload.fn,
        evidence: ['DELEGATECALL opcode detected', 'Storage context shared with callee']
      });
      break;
    }

    case EVENT.EXTERNAL_CALL: {
      state.findings.push({
        id: `f_ext_${state.findings.length}`,
        title: 'External Interaction',
        severity: 'medium',
        description: `Function ${event.payload.fn} makes an external call. Verify call success is checked.`,
        confidence: event.confidence,
        fn: event.payload.fn,
        evidence: ['EXTCALL opcode', 'Return value may be unchecked']
      });
      break;
    }
  }

  return state;
}

// ── Event extraction from symbolic results ─────────────────

function extractEvents(symbolicResults, irModules, constraintSummary) {
  const events = [];

  // Contract deploy events
  for (const irMod of irModules) {
    events.push(new SemanticEvent(EVENT.DEPLOY, { contract: irMod.contractName }, 1.0));
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

// ── Overflow / arithmetic findings from constraints ────────

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
        ]
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
              evidence: ['No modifier on function head', 'No require(msg.sender == ...) guard', 'STORE instruction in body block']
            });
          }
        }
      }
    }
  }
}

// ── Public API ─────────────────────────────────────────────

export function semanticReduce(symbolicResults, irModules, constraintSummary, ast) {
  const events = extractEvents(symbolicResults, irModules, constraintSummary);
  const state  = new SemanticState();

  // Run reducer
  for (const event of events) {
    reduce(state, event);
  }

  // Additional analysis passes
  buildArithmeticFindings(state, constraintSummary, ast);
  buildAccessControlFindings(state, ast, irModules);

  state.provenPaths  = symbolicResults.reduce((s, r) => s + r.reachablePaths, 0);
  state.revertedPaths = symbolicResults.reduce((s, r) => s + r.revertedPaths, 0);

  return state;
}
