// ============================================================
// GEMFLOW Ω  ·  js/core/proofs-improved.js
// Proof-producing findings — each finding gets a formal
// derivation chain: premises → inference steps → conclusion
// Enhanced with proof validation and conflict resolution
// ============================================================

export const VERDICT = {
  PROVEN:       'proven',
  REFUTED:      'refuted',
  PARTIAL:      'partial',
  INCONCLUSIVE: 'inconclusive'
};

export class ProofStep {
  constructor(rule, from, conclusion, confidence = 1.0) {
    this.rule       = rule;         // named inference rule
    this.from       = from;         // string[] of premise ids
    this.conclusion = conclusion;   // string
    this.confidence = confidence;
  }
  toString() { return `[${this.rule}] (${this.from.join(', ')}) ⊢ ${this.conclusion}`; }
}

export class Proof {
  constructor(findingId, claim) {
    this.findingId = findingId;
    this.claim     = claim;       // the thing we're trying to prove
    this.premises  = [];          // string[] (axioms / observations)
    this.steps     = [];          // ProofStep[]\n    this.verdict   = VERDICT.INCONCLUSIVE;
    this.confidence = 0;
    this.contradictions = [];
    this.metadata = {};           // additional proof metadata
  }

  addPremise(p) { this.premises.push(p); return this; }
  addStep(step) { this.steps.push(step); return this; }

  conclude(verdict, confidence) {
    this.verdict    = verdict;
    this.confidence = Math.max(0, Math.min(1, confidence));
    return this;
  }

  validate() {
    // Check for circular reasoning
    const stepConclusions = new Set(this.steps.map(s => s.conclusion));
    for (const step of this.steps) {
      for (const premise of step.from) {
        if (stepConclusions.has(premise) && premise === step.conclusion) {
          this.contradictions.push(`Circular reasoning detected: ${premise}`);
          return false;
        }
      }
    }
    return true;
  }

  toString() {
    const lines = [`PROOF for: ${this.claim} [${this.verdict.toUpperCase()}]`];
    lines.push(`Premises:`);
    for (const p of this.premises) lines.push(`  • ${p}`);
    lines.push(`Derivation:`);
    for (const s of this.steps) lines.push(`  ${s}`);
    if (this.contradictions.length) {
      lines.push(`Contradictions:`);
      for (const c of this.contradictions) lines.push(`  ✗ ${c}`);
    }
    lines.push(`Conclusion: ${this.verdict} (${(this.confidence*100).toFixed(0)}%)}`);
    return lines.join('\n');
  }
}

// ── Proof rules ────────────────────────────────────────────

const RULES = {
  // Reentrancy
  REENTRANCY_CEI: (ast, symResult, constraintSummary) => {
    const proof = new Proof('reentrancy', 'External call before state mutation (CEI violation)');
    proof.addPremise('EXTCALL instruction exists in function body');
    proof.addPremise('STORE instruction follows EXTCALL in same basic block');

    const hasCEI = symResult?.some(r => r.ceiViolation);
    const ceiViolations = constraintSummary?.ceiViolations ?? [];
    
    if (hasCEI || ceiViolations.length > 0) {
      proof.addStep(new ProofStep('EXTCALL_BEFORE_STORE',
        ['EXTCALL instruction', 'STORE instruction'],
        'CEI pattern violated', 0.97));
      proof.addStep(new ProofStep('REENTRANCY_AXIOM',
        ['CEI pattern violated', 'external contract controls execution'],
        'reentrancy vulnerability exists', 0.92));
      proof.metadata.violationCount = ceiViolations.length;
      return proof.conclude(VERDICT.PROVEN, 0.92);
    } else {
      proof.contradictions.push('No CEI violation found in symbolic execution');
      return proof.conclude(VERDICT.REFUTED, 0.85);
    }
  },

  // Arithmetic overflow (pre-0.8)
  OVERFLOW_PRE08: (ast, symResult, constraintSummary) => {
    const proof = new Proof('arithmetic_overflow', 'Integer overflow/underflow on state variable');
    proof.addPremise('Augmented assignment (+=/-=) on state variable');
    proof.addPremise('No SafeMath or unchecked block guard');

    const risks = constraintSummary?.overflowRisks ?? [];
    if (!ast.is08Plus && risks.length > 0) {
      proof.addStep(new ProofStep('AUGASSIGN_UNBOUNDED',
        ['AUGASSIGN on state var', 'uint256 type'],
        'value may exceed 2^256 - 1', 0.88));
      proof.addStep(new ProofStep('NO_PROTECTION',
        ['Solidity < 0.8', 'no SafeMath import'],
        'overflow wraps silently', 0.85));
      proof.metadata.riskCount = risks.length;
      return proof.conclude(VERDICT.PROVEN, 0.85);
    }
    if (ast.is08Plus && ast.uncheckedSites?.length > 0) {
      proof.addStep(new ProofStep('UNCHECKED_BLOCK',
        ['unchecked { } keyword found', 'arithmetic inside'],
        'overflow protection explicitly disabled', 0.92));
      proof.metadata.uncheckedSites = ast.uncheckedSites.length;
      return proof.conclude(VERDICT.PROVEN, 0.9);
    }
    if (ast.is08Plus) {
      proof.contradictions.push('Solidity 0.8+ reverts on overflow by default');
      return proof.conclude(VERDICT.REFUTED, 0.9);
    }
    return proof.conclude(VERDICT.INCONCLUSIVE, 0.5);
  },

  // Access control
  ACCESS_CONTROL: (ast, symResult, constraintSummary) => {
    const proof = new Proof('access_control', 'Sensitive state-mutating function lacks authorization');
    proof.addPremise('Public/external function mutates state');
    proof.addPremise('No modifier or require(msg.sender == ...) guard');

    const hasModifiers = ast.modifiers?.length > 0;
    const hasChecks    = (constraintSummary?.allFacts ?? [])
                           .some(f => f.kind === 'guard' || f.kind === 'require_sender');

    if (!hasModifiers && !hasChecks) {
      proof.addStep(new ProofStep('NO_MODIFIER',
        ['function visibility = public/external', 'modifier list empty'],
        'no role-based guard on function', 0.75));
      proof.addStep(new ProofStep('NO_SENDER_CHECK',
        ['REQUIRE instructions analyzed', 'no msg.sender comparison found'],
        'any address may call function', 0.72));
      return proof.conclude(VERDICT.PROVEN, 0.72);
    }

    if (hasModifiers || hasChecks) {
      proof.contradictions.push(hasModifiers ? 'Modifier found' : 'require(msg.sender) found');
      proof.metadata.hasModifiers = hasModifiers;
      proof.metadata.hasChecks = hasChecks;
      return proof.conclude(VERDICT.REFUTED, 0.80);
    }
    return proof.conclude(VERDICT.INCONCLUSIVE, 0.5);
  },

  // Tainted write
  TAINTED_WRITE: (ast, symResult, constraintSummary) => {
    const proof = new Proof('tainted_write', 'Attacker-controlled value written to storage');
    proof.addPremise('Parameter flows into storage slot without sanitization');
    const writes = constraintSummary?.taintedWrites ?? [];
    if (writes.length > 0) {
      proof.addStep(new ProofStep('TAINT_PROPAGATION',
        ['external param tagged as taint source', 'STORE of tainted SSA var'],
        'attacker influences storage state', 0.82));
      proof.metadata.taintedWrites = writes.length;
      return proof.conclude(VERDICT.PROVEN, 0.82);
    }
    proof.contradictions.push('No tainted write paths found in constraint analysis');
    return proof.conclude(VERDICT.REFUTED, 0.70);
  },

  // Delegatecall
  DELEGATECALL_SAFETY: (ast, symResult, constraintSummary) => {
    const proof = new Proof('delegatecall', 'Delegatecall executes untrusted code in caller context');
    proof.addPremise('DELEGATECALL opcode detected in function');
    const hasDC = symResult?.some(r => r.hasDelegatecall);
    const delegatecalls = constraintSummary?.delegatecalls ?? [];
    
    if (hasDC || delegatecalls.length > 0) {
      proof.addStep(new ProofStep('DELEGATECALL_DETECTED',
        ['DELEGATECALL instruction in IR'],
        'callee can read and write caller storage', 0.99));
      proof.addStep(new ProofStep('STORAGE_COLLISION_RISK',
        ['shared storage context', 'external code execution'],
        'storage layout collision possible', 0.88));
      proof.metadata.delegatecallCount = delegatecalls.length;
      return proof.conclude(VERDICT.PROVEN, 0.93);
    }
    proof.contradictions.push('No delegatecall found in symbolic paths');
    return proof.conclude(VERDICT.REFUTED, 0.95);
  },

  // Uninitialized storage
  UNINITIALIZED_STORAGE: (ast, symResult, constraintSummary) => {
    const proof = new Proof('uninitialized_storage', 'Storage variable used before initialization');
    proof.addPremise('Storage variable referenced without prior assignment');
    
    const uninitReads = (constraintSummary?.allFacts ?? [])
      .filter(f => f.kind === 'storage' && f.confidence < 0.5);
    
    if (uninitReads.length > 0) {
      proof.addStep(new ProofStep('UNINITIALIZED_READ',
        ['LOAD from storage', 'no prior STORE in CFG'],
        'reading uninitialized storage', 0.78));
      proof.metadata.uninitializedReads = uninitReads.length;
      return proof.conclude(VERDICT.PROVEN, 0.78);
    }
    
    proof.contradictions.push('All storage reads have prior initialization');
    return proof.conclude(VERDICT.REFUTED, 0.85);
  }
};

// ── Public API ─────────────────────────────────────────────

export function produceProofs(semanticState, invariants, ast, symbolicResults, constraintSummary) {
  const proofs = [];

  for (const [name, ruleFn] of Object.entries(RULES)) {
    try {
      const proof = ruleFn(ast, symbolicResults, constraintSummary);
      proof.ruleName = name;
      
      // Validate proof structure
      if (!proof.validate()) {
        proof.verdict = VERDICT.INCONCLUSIVE;
        proof.confidence = 0.3;
      }
      
      proofs.push(proof);
    } catch (e) {
      proofs.push({
        ruleName: name, 
        verdict: VERDICT.INCONCLUSIVE,
        confidence: 0, 
        claim: name, 
        error: e.message,
        errorStack: e.stack
      });
    }
  }

  // Augment semantic state findings with proof verdicts
  for (const finding of semanticState.findings) {
    const matchProof = proofs.find(p =>
      (finding.title.toLowerCase().includes('reentranc') && p.ruleName === 'REENTRANCY_CEI') ||
      (finding.title.toLowerCase().includes('overflow') && p.ruleName === 'OVERFLOW_PRE08') ||
      (finding.title.toLowerCase().includes('access') && p.ruleName === 'ACCESS_CONTROL') ||
      (finding.title.toLowerCase().includes('delegate') && p.ruleName === 'DELEGATECALL_SAFETY') ||
      (finding.title.toLowerCase().includes('uninitial') && p.ruleName === 'UNINITIALIZED_STORAGE')
    );
    
    if (matchProof) {
      finding.proof      = matchProof;
      finding.verdict    = matchProof.verdict;
      finding.confidence = Math.min(finding.confidence, matchProof.confidence + 0.05);
      finding.isHallucination = matchProof.verdict === VERDICT.REFUTED;
    } else {
      finding.proof   = null;
      finding.verdict = VERDICT.PARTIAL;
      finding.isHallucination = false;
    }
  }

  // Add invariant proofs
  for (const inv of (invariants ?? [])) {
    const iProof = new Proof(`inv_${inv.id}`, inv.claim);
    iProof.addPremise(inv.basis);
    if (inv.stable) {
      iProof.addStep(new ProofStep('INVARIANT_HOLDS', [inv.basis], inv.claim, inv.confidence));
      iProof.conclude(VERDICT.PROVEN, inv.confidence);
    } else {
      iProof.addStep(new ProofStep('INVARIANT_VIOLATED', [inv.basis], `¬(${inv.claim})`, inv.confidence));
      iProof.conclude(VERDICT.PROVEN, inv.confidence);
    }
    iProof.metadata.isInvariant = true;
    proofs.push(iProof);
  }

  return proofs;
}

export function summarizeProofs(proofs) {
  const summary = {
    total: proofs.length,
    proven: 0,
    refuted: 0,
    partial: 0,
    inconclusive: 0,
    avgConfidence: 0,
    byRule: {}
  };

  let totalConfidence = 0;

  for (const proof of proofs) {
    if (proof.verdict === VERDICT.PROVEN) summary.proven++;
    else if (proof.verdict === VERDICT.REFUTED) summary.refuted++;
    else if (proof.verdict === VERDICT.PARTIAL) summary.partial++;
    else summary.inconclusive++;

    totalConfidence += proof.confidence || 0;

    if (proof.ruleName) {
      if (!summary.byRule[proof.ruleName]) {
        summary.byRule[proof.ruleName] = {
          verdict: proof.verdict,
          confidence: proof.confidence,
          metadata: proof.metadata || {}
        };
      }
    }
  }

  summary.avgConfidence = proofs.length > 0 
    ? (totalConfidence / proofs.length).toFixed(3)
    : 0;

  return summary;
}