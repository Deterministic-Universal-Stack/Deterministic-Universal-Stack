// ============================================================
// GEMFLOW Ω  ·  js/core/lattice.js
// State Lattice Engine — models the partial order of contract
// states using a join semi-lattice. Each state variable gets
// a lattice element with: top (⊤), bottom (⊥), or known range.
// ============================================================

// ── Lattice values ─────────────────────────────────────────

export const LATTICE = {
  TOP:    Symbol('⊤'),  // unknown / unconstrained
  BOTTOM: Symbol('⊥'),  // contradiction / unreachable
};

export class LatticeElement {
  constructor(kind, value = null) {
    this.kind  = kind;   // 'top' | 'bottom' | 'const' | 'range' | 'set' | 'taint'
    this.value = value;  // number | {lo,hi} | Set<number> | string
  }

  static top()          { return new LatticeElement('top'); }
  static bottom()       { return new LatticeElement('bottom'); }
  static constant(v)    { return new LatticeElement('const', v); }
  static range(lo, hi)  { return new LatticeElement('range', { lo, hi }); }
  static set(vals)      { return new LatticeElement('set', new Set(vals)); }
  static taint(src)     { return new LatticeElement('taint', src); }

  isTop()    { return this.kind === 'top'; }
  isBottom() { return this.kind === 'bottom'; }
  isConst()  { return this.kind === 'const'; }

  // Lattice join (least upper bound): ⊔
  join(other) {
    if (this.kind === 'bottom') return other;
    if (other.kind === 'bottom') return this;
    if (this.kind === 'top' || other.kind === 'top') return LatticeElement.top();
    if (this.kind === 'taint' || other.kind === 'taint')
      return LatticeElement.taint(`${this.value}⊔${other.value}`);
    if (this.kind === 'const' && other.kind === 'const') {
      if (this.value === other.value) return this;
      return LatticeElement.range(
        Math.min(Number(this.value), Number(other.value)),
        Math.max(Number(this.value), Number(other.value))
      );
    }
    if (this.kind === 'range' && other.kind === 'range') {
      return LatticeElement.range(
        Math.min(this.value.lo, other.value.lo),
        Math.max(this.value.hi, other.value.hi)
      );
    }
    if (this.kind === 'range' && other.kind === 'const') {
      return LatticeElement.range(
        Math.min(this.value.lo, Number(other.value)),
        Math.max(this.value.hi, Number(other.value))
      );
    }
    return LatticeElement.top();
  }

  // Lattice meet (greatest lower bound): ⊓
  meet(other) {
    if (this.kind === 'top') return other;
    if (other.kind === 'top') return this;
    if (this.kind === 'bottom' || other.kind === 'bottom') return LatticeElement.bottom();
    if (this.kind === 'const' && other.kind === 'const') {
      return this.value === other.value ? this : LatticeElement.bottom();
    }
    if (this.kind === 'range' && other.kind === 'range') {
      const lo = Math.max(this.value.lo, other.value.lo);
      const hi = Math.min(this.value.hi, other.value.hi);
      if (lo > hi) return LatticeElement.bottom();
      return lo === hi ? LatticeElement.constant(lo) : LatticeElement.range(lo, hi);
    }
    return LatticeElement.bottom();
  }

  // Widening operator (ensures termination in fix-point loops)
  widen(other) {
    if (this.kind !== 'range' || other.kind !== 'range') return this.join(other);
    return LatticeElement.range(
      other.value.lo < this.value.lo ? -Infinity : this.value.lo,
      other.value.hi > this.value.hi ?  Infinity : this.value.hi
    );
  }

  leq(other) {
    if (this.kind === 'bottom') return true;
    if (other.kind === 'top')   return true;
    if (this.kind === 'const' && other.kind === 'const') return this.value === other.value;
    if (this.kind === 'const' && other.kind === 'range')
      return Number(this.value) >= other.value.lo && Number(this.value) <= other.value.hi;
    if (this.kind === 'range' && other.kind === 'range')
      return this.value.lo >= other.value.lo && this.value.hi <= other.value.hi;
    return false;
  }

  toString() {
    if (this.kind === 'top')    return '⊤';
    if (this.kind === 'bottom') return '⊥';
    if (this.kind === 'const')  return String(this.value);
    if (this.kind === 'range')  return `[${this.value.lo}, ${this.value.hi}]`;
    if (this.kind === 'set')    return `{${[...this.value].join(',')}}`;
    if (this.kind === 'taint')  return `tainted(${this.value})`;
    return '?';
  }
}

// ── State Lattice (per state variable) ─────────────────────

export class StateLattice {
  constructor(contractName) {
    this.contractName = contractName;
    this.vars   = new Map();   // varName → LatticeElement
    this.stable = false;
    this.iters  = 0;
  }

  get(name) { return this.vars.get(name) ?? LatticeElement.top(); }
  set(name, elem) { this.vars.set(name, elem); }

  // Join another lattice state into this one; return true if changed
  join(other) {
    let changed = false;
    for (const [name, elem] of other.vars) {
      const old = this.get(name);
      const joined = old.join(elem);
      if (joined.toString() !== old.toString()) {
        this.set(name, joined);
        changed = true;
      }
    }
    return changed;
  }

  // Widen to ensure termination
  widen(other) {
    for (const [name, elem] of other.vars) {
      const old = this.get(name);
      this.set(name, old.widen(elem));
    }
  }

  clone() {
    const copy = new StateLattice(this.contractName);
    for (const [k, v] of this.vars) copy.vars.set(k, v);
    return copy;
  }

  toString() {
    const entries = [...this.vars.entries()].map(([k,v]) => `${k}=${v}`);
    return `{${entries.join(', ')}}`;
  }
}

// ── Fix-point computation ──────────────────────────────────

export function createStateLattice(irModules, constraintResults) {
  const lattices = new Map(); // contractName.funcName → StateLattice

  for (const irMod of irModules) {
    const initial = new StateLattice(irMod.contractName);

    // Initialize state vars to [0, UINT256_MAX]
    for (const [varName, info] of irMod.globals) {
      if (info.type && info.type.startsWith('mapping')) {
        initial.set(varName, LatticeElement.top());
      } else if (info.type === 'bool') {
        initial.set(varName, LatticeElement.set([0, 1]));
      } else if (info.type === 'address') {
        initial.set(varName, LatticeElement.top());
      } else {
        initial.set(varName, LatticeElement.range(0, Number.MAX_SAFE_INTEGER));
      }
    }

    for (const [fnName, irFn] of irMod.functions) {
      const key    = `${irMod.contractName}.${fnName}`;
      const cstore = constraintResults?.get(key);
      const lattice = initial.clone();
      lattice.stable = false;
      lattice.iters  = 0;

      // Refine using constraint facts
      if (cstore) {
        for (const fact of cstore.facts) {
          if (fact.kind === 'overflow_risk' && fact.stateVar) {
            const cur = lattice.get(fact.stateVar);
            // Overflow risk: widen range upward
            if (cur.kind === 'range') {
              lattice.set(fact.stateVar, LatticeElement.range(cur.value.lo, Number.MAX_SAFE_INTEGER));
            }
          }
          if (fact.kind === 'cei_violation') {
            lattice.stable = false;
          }
        }

        // Fix-point: join with all tainted variable impacts
        let changed = true;
        let maxIter = 20;
        while (changed && maxIter-- > 0) {
          const prev = lattice.clone();
          for (const [v, clist] of cstore.map) {
            for (const c of clist) {
              if (c.kind === 'taint') {
                lattice.set(c.variable, LatticeElement.taint(c.value.source));
              }
              if (c.kind === 'range' && c.value) {
                const cur2 = lattice.get(c.variable);
                if (cur2.kind !== 'taint') {
                  lattice.set(c.variable, cur2.join(LatticeElement.range(0, Number.MAX_SAFE_INTEGER)));
                }
              }
            }
          }
          changed = lattice.join(prev);
          lattice.iters++;
        }
        lattice.stable = !changed;
      }

      lattices.set(key, lattice);
    }
  }

  return lattices;
}

export function summarizeLattice(lattices) {
  const summary = { functions: [], stableCount: 0, unstableCount: 0, taintedVars: [] };
  for (const [key, lat] of lattices) {
    if (lat.stable) summary.stableCount++;
    else summary.unstableCount++;
    const tainted = [...lat.vars.entries()].filter(([,v]) => v.kind === 'taint');
    for (const [name] of tainted) summary.taintedVars.push(`${key}:${name}`);
    summary.functions.push({
      key, stable: lat.stable, iters: lat.iters,
      vars: [...lat.vars.entries()].map(([k,v]) => ({ name: k, value: v.toString() }))
    });
  }
  return summary;
}
