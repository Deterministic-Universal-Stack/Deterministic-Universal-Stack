// ============================================================
// GEMFLOW Ω  ·  USAGE EXAMPLES
// Practical code showing how to integrate all improvements
// ============================================================

/**
 * EXAMPLE 1: Complete Analysis Pipeline
 * ============================================================
 */

import { tokenize } from './tokenizer-improved.js';
import { parse } from './parser-improved.js';
import { buildSSA } from './ssa-improved.js';
import { normalizeIR } from './ir-improved.js';
import { buildControlFlowGraphs, semanticReduce } from './reducer-improved.js';
import { propagateConstraints } from './constraints.js';
import { symbolicExecute } from './symbolic.js';
import { SMTSolver, verifyCEIPattern } from './smt-solver-improved.js';
import { produceProofs } from './proofs.js';

async function analyzeContract(sourceCode) {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  GEMFLOW Ω  Complete Analysis Pipeline         ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Phase 1: Tokenization
  console.log('📍 Phase 1: Tokenization');
  const tokenResult = tokenize(sourceCode);
  if (tokenResult.errors.length > 0) {
    console.warn(`  ⚠️  ${tokenResult.errors.length} lexical errors found`);
    tokenResult.errors.forEach(err => console.warn(`     ${err.message}`));
  }
  console.log(`  ✓ Generated ${tokenResult.tokens.length} tokens\n`);

  // Phase 2: Parsing
  console.log('📍 Phase 2: Parsing');
  const ast = parse(tokenResult);
  if (ast.parseErrors.length > 0) {
    console.warn(`  ⚠️  ${ast.parseErrors.length} parse errors found`);
  }
  console.log(`  ✓ Found ${ast.contracts.length} contracts`);
  console.log(`  ✓ Found ${ast.functions.length} functions`);
  console.log(`  ✓ Found ${ast.stateVars.length} state variables\n`);

  // Phase 3: SSA Construction
  console.log('📍 Phase 3: SSA Construction');
  const ssaModules = buildSSA(ast);
  let totalPhis = 0;
  ssaModules.forEach((mod, i) => {
    const stats = mod.stats;
    totalPhis += stats.phiNodes || 0;
    console.log(`  Contract ${i}: ${stats.totalBlocks} blocks, ${stats.totalInstrs} instrs, ${stats.phiNodes} phis`);
  });
  console.log(`  ✓ Total phi nodes: ${totalPhis}\n`);

  // Phase 4: IR Normalization
  console.log('📍 Phase 4: IR Normalization (EVM Semantics)');
  const irModules = normalizeIR(ssaModules, ast);
  let totalGas = 0;
  irModules.forEach((mod, i) => {
    const stats = mod.stats;
    totalGas += stats.estimatedGas || 0;
    console.log(`  Contract ${i}: ${stats.functions} functions, est. gas ${stats.estimatedGas}`);
  });
  console.log(`  ✓ Total estimated gas: ${totalGas}\n`);

  // Phase 5: Control Flow Graph
  console.log('📍 Phase 5: Control Flow Analysis');
  const cfgs = buildControlFlowGraphs(irModules);
  let totalUnreachable = 0;
  for (const [fnKey, cfg] of cfgs) {
    const unreachable = cfg.getUnreachable();
    if (unreachable.length > 0) {
      console.log(`  ⚠️  ${fnKey}: ${unreachable.length} unreachable blocks`);
      totalUnreachable += unreachable.length;
    }
  }
  console.log(`  ✓ Analyzed ${cfgs.size} functions\n`);

  // Phase 6: Constraint Propagation
  console.log('📍 Phase 6: Constraint Propagation');
  const constraintResults = propagateConstraints(irModules, ast);
  const constraintSummary = require('./constraints.js').summarizeConstraints(constraintResults);
  console.log(`  ✓ Tainted variables: ${constraintSummary.taintedVars}`);
  console.log(`  ✓ Overflow risks: ${constraintSummary.overflowRisks.length}`);
  console.log(`  ✓ Delegatecalls: ${constraintSummary.delegatecalls.length}`);
  console.log(`  ✓ External interactions: ${constraintSummary.externalInteractions.length}\n`);

  // Phase 7: Symbolic Execution
  console.log('📍 Phase 7: Symbolic Execution');
  const symbolicResults = symbolicExecute(irModules, null);
  const symSummary = require('./symbolic.js').summarizeSymbolic(symbolicResults);
  console.log(`  ✓ Functions analyzed: ${symSummary.totalFunctions}`);
  console.log(`  ✓ CEI violations: ${symSummary.ceiViolations.length}`);
  console.log(`  ✓ Delegatecalls: ${symSummary.delegatecalls.length}`);
  console.log(`  ✓ Avg paths per function: ${symSummary.avgPaths}\n`);

  // Phase 8: SMT Verification (for selected functions)
  console.log('📍 Phase 8: SMT Formal Verification');
  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      if (irFn.ceiViolation) {
        console.log(`  🔍 Verifying CEI in ${fnName}...`);
        // Commented out to avoid actual Z3 invocation in example
        // const proof = await verifyCEIPattern(irFn, symbolicResults);
        // console.log(`     Result: ${proof.holds ? '✓ VERIFIED' : '✗ VIOLATED'}`);
      }
    }
  }
  console.log(`  ✓ SMT verification ready\n`);

  // Phase 9: Semantic Reduction
  console.log('📍 Phase 9: Semantic Reduction');
  const semanticState = semanticReduce(symbolicResults, irModules, constraintSummary, ast);
  console.log(`  ✓ Events: ${semanticState.transitions.length}`);
  console.log(`  ✓ Deterministic: ${semanticState.deterministic}`);
  console.log(`  ✓ Proven paths: ${semanticState.provenPaths}`);
  console.log(`  ✓ Reverted paths: ${semanticState.revertedPaths}\n`);

  // Phase 10: Proof Generation
  console.log('📍 Phase 10: Proof Generation');
  const proofs = produceProofs(semanticState, [], ast, symbolicResults, constraintSummary);
  console.log(`  ✓ Generated ${proofs.length} formal proofs`);
  let verifiedCount = 0;
  for (const proof of proofs) {
    if (proof.verdict === 'proven') verifiedCount++;
  }
  console.log(`  ✓ Proven: ${verifiedCount}/${proofs.length}\n`);

  // Summary
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  FINDINGS SUMMARY                              ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  if (semanticState.findings.length === 0) {
    console.log('  ✅ No issues found!\n');
  } else {
    semanticState.findings.forEach((finding, i) => {
      const icon = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵'
      }[finding.severity] || '⚪';

      console.log(`  ${icon} [${finding.severity.toUpperCase()}] ${finding.title}`);
      console.log(`     Function: ${finding.fn}`);
      console.log(`     Confidence: ${(finding.confidence*100).toFixed(0)}%`);
      if (finding.remediation) {
        console.log(`     Fix: ${finding.remediation}`);
      }
      console.log('');
    });
  }

  return {
    ast,
    ssaModules,
    irModules,
    cfgs,
    constraintSummary,
    symbolicResults,
    semanticState,
    proofs
  };
}

/**
 * EXAMPLE 2: Focused CEI Analysis
 * ============================================================
 */

async function analyzeCEIPattern(sourceCode) {
  console.log('\n🔍 CEI Pattern Analysis\n');

  const tokenResult = tokenize(sourceCode);
  const ast = parse(tokenResult);
  const ssaModules = buildSSA(ast);
  const irModules = normalizeIR(ssaModules, ast);

  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      const extCalls = irFn.externalCalls;
      const stores = irFn.allInstrs.filter(i => i.op === 'STORE');

      if (extCalls.length > 0 && stores.length > 0) {
        console.log(`  📍 Function: ${fnName}`);
        console.log(`     External calls: ${extCalls.length}`);
        console.log(`     State mutations: ${stores.length}`);

        // Check ordering
        const instrs = irFn.allInstrs;
        let lastExtCall = -1;
        let ceiViolation = false;

        for (let i = 0; i < instrs.length; i++) {
          if (instrs[i].isExternalCall()) lastExtCall = i;
          if (instrs[i].op === 'STORE' && lastExtCall >= 0 && lastExtCall < i) {
            ceiViolation = true;
            console.log(`     ⚠️  CEI VIOLATION: EXTCALL[${lastExtCall}] before STORE[${i}]`);
          }
        }

        if (!ceiViolation) {
          console.log(`     ✓ Safe: Checks-Effects-Interactions pattern followed`);
        }
        console.log('');
      }
    }
  }
}

/**
 * EXAMPLE 3: Type System Usage
 * ============================================================
 */

function analyzeTypeSystem(irModules) {
  console.log('\n📊 Type System Analysis\n');

  const { SolidityType } = require('./ir-improved.js');

  // Examples of type operations
  const uint256 = SolidityType.UINT256;
  const int256 = SolidityType.INT256;
  const address = SolidityType.ADDRESS;

  console.log(`  UINT256: ${uint256.bits} bits, signed: ${uint256.isSigned}`);
  console.log(`  INT256: ${int256.bits} bits, signed: ${int256.isSigned}`);
  console.log(`  ADDRESS: ${address.bits} bits, signed: ${address.isSigned}`);

  const range = uint256.range();
  console.log(`  UINT256 range: [${range.min}, ${range.max}]`);

  // Check for types that can overflow
  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      for (const instr of irFn.allInstrs) {
        if (instr.type && instr.type.includes('uint')) {
          const typeObj = SolidityType.fromString(instr.type);
          if (typeObj.canOverflow()) {
            console.log(`  ⚠️  Potential overflow: ${fnName} uses ${instr.type}`);
          }
        }
      }
    }
  }
}

/**
 * EXAMPLE 4: Gas Analysis
 * ============================================================
 */

function analyzeGasCosts(irModules) {
  console.log('\n⛽ Gas Cost Analysis\n');

  for (const irMod of irModules) {
    console.log(`Contract: ${irMod.contractName}`);
    
    const functions = Array.from(irMod.functions.values());
    const sorted = functions.sort((a, b) => b.gasEstimate - a.gasEstimate);

    for (const irFn of sorted.slice(0, 5)) {
      console.log(`  ${irFn.name}: ~${irFn.gasEstimate} gas`);
      
      // Breakdown by block
      for (const block of irFn.blocks) {
        if (block.gasEstimate > 100) {
          console.log(`    Block ${block.id}: ${block.gasEstimate} gas (${block.instrs.length} instrs)`);
        }
      }
    }
    console.log('');
  }
}

/**
 * EXAMPLE 5: Dominance Tree Visualization
 * ============================================================
 */

function visualizeDominanceTree(ssaModules) {
  console.log('\n🌳 Dominance Tree Visualization\n');

  for (const mod of ssaModules) {
    for (const [fnName, fn] of mod.functions) {
      console.log(`Function: ${fnName}`);

      // Print immediate dominators
      for (const block of fn.blocks) {
        if (block.idom) {
          console.log(`  ${block.id} ← [idom] ${block.idom.id}`);
        } else {
          console.log(`  ${block.id} ← [entry]`);
        }

        // Print dominance frontier
        if (block.domFront.length > 0) {
          console.log(`    domFront: {${block.domFront.join(', ')}}`);
        }
      }
      console.log('');
    }
  }
}

/**
 * EXAMPLE 6: SMT Formula Export
 * ============================================================
 */

function exportSMTFormulas(irModules) {
  console.log('\n📝 SMT-LIB2 Formula Export\n');

  const { SMTSolver } = require('./smt-solver-improved.js');
  const solver = new SMTSolver('z3');

  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      // Add all variables
      for (const instr of irFn.allInstrs) {
        if (instr.dest) {
          solver.context.declareVar(instr.dest, 'UInt256');
        }
      }
    }
  }

  const smtCode = solver.context.toSMTLib2();
  console.log(smtCode);
  console.log('\n');
}

/**
 * EXAMPLE 7: Access Control Analysis
 * ============================================================
 */

function analyzeAccessControl(irModules, ast) {
  console.log('\n🔐 Access Control Analysis\n');

  for (const irMod of irModules) {
    for (const [fnName, irFn] of irMod.functions) {
      if (irFn.visibility === 'public' || irFn.visibility === 'external') {
        const hasModifier = irFn.flags?.modifiers?.length > 0;
        const hasRequireSender = irFn.allInstrs.some(i =>
          i.op === 'REQUIRE' && String(i.args).includes('sender')
        );
        const mutatesState = irFn.allInstrs.some(i => i.op === 'STORE');

        if (!hasModifier && !hasRequireSender && mutatesState && !irFn.flags?.isConstructor) {
          console.log(`  ⚠️  ${fnName}: public/external, mutates state, no access control`);
        }
      }
    }
  }
  console.log('');
}

/**
 * EXAMPLE 8: Path Exploration Statistics
 * ============================================================
 */

function analyzePathExploration(symbolicResults) {
  console.log('\n🛤️  Path Exploration Statistics\n');

  let totalPaths = 0;
  let totalReachable = 0;
  let totalReverted = 0;

  for (const result of symbolicResults) {
    totalPaths += result.totalPaths;
    totalReachable += result.reachablePaths;
    totalReverted += result.revertedPaths;

    const pathRatio = (result.reachablePaths / result.totalPaths * 100).toFixed(1);
    console.log(`  ${result.name}: ${result.totalPaths} paths (${pathRatio}% reachable)`);
  }

  console.log(`\n  Total paths analyzed: ${totalPaths}`);
  console.log(`  Reachable: ${totalReachable}`);
  console.log(`  Reverted: ${totalReverted}\n`);
}

/**
 * USAGE IN MAIN ANALYSIS
 * ============================================================
 */

// Main entry point
const source = `
pragma solidity ^0.8.0;

contract Vault {
  address owner;
  uint256 balance;

  function withdraw(uint256 amount) public {
    require(msg.sender == owner);
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success);
    balance -= amount;  // ⚠️ CEI VIOLATION!
  }
}
`;

// Run full pipeline
analyzeContract(source).then(results => {
  console.log('\n✅ Analysis complete!');
  console.log(`Total findings: ${results.semanticState.findings.length}`);
});

// Or run specific analyses
analyzeCEIPattern(source);
analyzeAccessControl(results.irModules, results.ast);
analyzeGasCosts(results.irModules);
visualizeDominanceTree(results.ssaModules);

export {
  analyzeContract,
  analyzeCEIPattern,
  analyzeTypeSystem,
  analyzeGasCosts,
  visualizeDominanceTree,
  exportSMTFormulas,
  analyzeAccessControl,
  analyzePathExploration
};
