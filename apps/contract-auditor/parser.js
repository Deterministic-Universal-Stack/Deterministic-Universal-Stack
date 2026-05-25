// ============================================================
// GEMFLOW Ω  ·  js/core/parser.js
// Recursive-descent Solidity parser → rich AST
// ============================================================

import { TT } from './tokenizer.js';

export class ParseError extends Error {
  constructor(msg, line) { super(`[Line ${line}] ${msg}`); this.line = line; }
}

export function parse(rawTokens) {
  // Strip comments for parsing; keep them for line attribution
  const tokens = rawTokens.filter(t =>
    t.type !== TT.LINE_COMMENT && t.type !== TT.BLOCK_COMMENT
  );
  let pos = 0;
  const errors = [];

  // ── Helpers ────────────────────────────────────────────────
  const peek  = (off=0) => tokens[Math.min(pos+off, tokens.length-1)];
  const done  = ()      => peek().type === TT.EOF;
  const eat   = ()      => tokens[pos++] ?? tokens[tokens.length-1];
  const line  = ()      => peek().line;

  function expect(type, hint='') {
    if (peek().type !== type) {
      errors.push(new ParseError(`Expected ${type} got ${peek().type} ('${peek().value}') ${hint}`, line()));
      return { type, value: '', line: line() };
    }
    return eat();
  }

  function eatIf(type) {
    if (peek().type === type) return eat();
    return null;
  }

  function skipToAny(...types) {
    while (!done() && !types.includes(peek().type)) eat();
  }

  // ── Type expression ────────────────────────────────────────
  function parseTypeExpr() {
    let base = '';

    if (peek().type === TT.MAPPING) {
      eat(); // 'mapping'
      expect(TT.LPAREN);
      const keyType = parseTypeExpr();
      expect(TT.ARROW);
      const valType = parseTypeExpr();
      expect(TT.RPAREN);
      base = `mapping(${keyType} => ${valType})`;
    } else if (peek().value === 'function') {
      // function type
      eat();
      base = 'function';
      if (peek().type === TT.LPAREN) { eat(); skipToAny(TT.RPAREN, TT.SEMI, TT.EOF); eatIf(TT.RPAREN); }
    } else {
      base = eat().value;
    }

    // Array dimensions
    while (peek().type === TT.LBRACKET) {
      eat();
      let dim = '';
      while (peek().type !== TT.RBRACKET && !done()) dim += eat().value;
      expect(TT.RBRACKET);
      base += `[${dim}]`;
    }

    return base;
  }

  // ── Parameter list ─────────────────────────────────────────
  function parseParamList() {
    const params = [];
    expect(TT.LPAREN);
    while (peek().type !== TT.RPAREN && !done()) {
      const ptype = parseTypeExpr();
      const mods = [];
      while ([TT.KEYWORD].includes(peek().type) &&
             ['memory','calldata','storage','indexed'].includes(peek().value)) {
        mods.push(eat().value);
      }
      let name = '';
      if (peek().type === TT.IDENT) name = eat().value;
      params.push({ type: ptype, name, mods });
      eatIf(TT.COMMA);
    }
    expect(TT.RPAREN);
    return params;
  }

  // ── Function modifiers (visibility, mutability, etc.) ─────
  function parseFuncHead() {
    const head = {
      visibility: 'internal', mutability: '', modifiers: [],
      virtual: false, override: false, returns: []
    };
    while (peek().type !== TT.LBRACE && peek().type !== TT.SEMI && !done()) {
      const v = peek().value;
      if (['public','private','internal','external'].includes(v)) { head.visibility = v; eat(); }
      else if (['view','pure','payable','nonpayable'].includes(v)) { head.mutability = v; eat(); }
      else if (v === 'virtual')   { head.virtual = true; eat(); }
      else if (v === 'override')  { head.override = true; eat(); }
      else if (v === 'returns')   {
        eat();
        head.returns = parseParamList();
      }
      else if (peek().type === TT.IDENT) { head.modifiers.push(eat().value); }
      else break;
    }
    return head;
  }

  // ── Block body (token collection + metadata) ───────────────
  function parseBlock() {
    const startLine = line();
    if (peek().type !== TT.LBRACE) return { startLine, endLine: startLine, body: [], flags: {} };
    eat(); // {
    let depth = 1;
    const body = [];
    const flags = {
      hasExternalCall: false, hasWrite: false, hasChecks: false,
      hasEmit: false, hasRevert: false, hasReturn: false,
      hasDelegatecall: false, hasUnchecked: false
    };
    while (!done() && depth > 0) {
      const t = eat();
      body.push(t);
      if (t.type === TT.LBRACE) depth++;
      else if (t.type === TT.RBRACE) { depth--; if (depth === 0) break; }
      if (['call','staticcall'].includes(t.value)) flags.hasExternalCall = true;
      if (t.value === 'delegatecall') { flags.hasExternalCall = true; flags.hasDelegatecall = true; }
      if (t.type === TT.AUGASSIGN || (t.type === TT.ASSIGN && body.length > 1)) flags.hasWrite = true;
      if (t.value === 'require' || t.value === 'assert') flags.hasChecks = true;
      if (t.value === 'emit')   flags.hasEmit = true;
      if (t.value === 'revert' || t.value === 'throw') flags.hasRevert = true;
      if (t.value === 'return') flags.hasReturn = true;
      if (t.value === 'unchecked') flags.hasUnchecked = true;
    }
    return { startLine, endLine: line(), body, flags };
  }

  // ── Top-level source unit ──────────────────────────────────
  const sourceUnit = {
    type: 'SourceUnit',
    pragmas: [],
    contracts: [],
    functions: [],      // all functions across contracts (flat)
    stateVars: [],      // all state vars (flat)
    structs: [],
    enums: [],
    events: [],
    modifiers: [],
    errors: [],
    is08Plus: false,
    uncheckedSites: [],
    parseErrors: errors
  };

  // ── Main parse loop ────────────────────────────────────────
  while (!done()) {
    const t = peek();

    // pragma
    if (t.type === TT.PRAGMA) {
      eat();
      let text = 'pragma';
      while (peek().type !== TT.SEMI && !done()) text += ' ' + eat().value;
      eatIf(TT.SEMI);
      sourceUnit.pragmas.push(text);
      if (/solidity\s+[\^>=<]*0\.[89]|solidity\s+[\^>=<]*1\./.test(text)) {
        sourceUnit.is08Plus = true;
      }
      continue;
    }

    // contract / interface / library
    if ([TT.CONTRACT, TT.INTERFACE, TT.LIBRARY].includes(t.type)) {
      const kind = eat().value;
      const nameTok = expect(TT.IDENT, 'contract name');
      const contractName = nameTok.value;
      const inherits = [];

      if (peek().value === 'is') {
        eat();
        while (peek().type === TT.IDENT || peek().type === TT.COMMA) {
          if (peek().type === TT.IDENT) inherits.push(eat().value);
          else eat();
        }
      }

      const contract = {
        type: 'ContractDefinition', kind, name: contractName, line: t.line,
        inherits, functions: [], stateVars: [], events: [],
        modifiers: [], structs: [], enums: [], errors: []
      };
      sourceUnit.contracts.push(contract);

      expect(TT.LBRACE);

      while (peek().type !== TT.RBRACE && !done()) {
        const inner = peek();

        // function / constructor / fallback / receive
        if (inner.type === TT.FUNCTION ||
            inner.value === 'constructor' || inner.value === 'fallback' || inner.value === 'receive') {
          const isSpecial = inner.value !== 'function';
          eat();
          let fname = isSpecial ? inner.value : (peek().type === TT.IDENT ? eat().value : '(unnamed)');
          const params = peek().type === TT.LPAREN ? parseParamList() : [];
          const head   = parseFuncHead();
          const block  = peek().type === TT.LBRACE ? parseBlock() : (eatIf(TT.SEMI), {});

          const func = {
            type: 'FunctionDefinition', name: fname, line: inner.line,
            params, ...head, block, contract: contractName,
            isConstructor: inner.value === 'constructor',
            isFallback: inner.value === 'fallback',
            isReceive: inner.value === 'receive'
          };
          sourceUnit.functions.push(func);
          contract.functions.push(func);
          if (block.flags?.hasUnchecked) sourceUnit.uncheckedSites.push(inner.line);
          continue;
        }

        // modifier
        if (inner.type === TT.MODIFIER) {
          eat();
          const mname = peek().type === TT.IDENT ? eat().value : 'unnamed';
          const params = peek().type === TT.LPAREN ? parseParamList() : [];
          const block  = peek().type === TT.LBRACE ? parseBlock() : (eatIf(TT.SEMI), {});
          const mod = { type: 'ModifierDefinition', name: mname, line: inner.line, params, block, contract: contractName };
          sourceUnit.modifiers.push(mod);
          contract.modifiers.push(mod);
          continue;
        }

        // event
        if (inner.type === TT.EVENT) {
          eat();
          const ename = peek().type === TT.IDENT ? eat().value : 'unnamed';
          const params = peek().type === TT.LPAREN ? parseParamList() : [];
          eatIf(TT.SEMI);
          const ev = { type: 'EventDefinition', name: ename, line: inner.line, params, contract: contractName };
          sourceUnit.events.push(ev);
          contract.events.push(ev);
          continue;
        }

        // custom error
        if (inner.type === TT.ERROR) {
          eat();
          const ename = peek().type === TT.IDENT ? eat().value : 'unnamed';
          const params = peek().type === TT.LPAREN ? parseParamList() : [];
          eatIf(TT.SEMI);
          const er = { type: 'ErrorDefinition', name: ename, line: inner.line, params, contract: contractName };
          sourceUnit.errors.push(er);
          contract.errors.push(er);
          continue;
        }

        // struct
        if (inner.type === TT.STRUCT) {
          eat();
          const sname = peek().type === TT.IDENT ? eat().value : 'unnamed';
          const block = parseBlock();
          const st = { type: 'StructDefinition', name: sname, line: inner.line, contract: contractName };
          sourceUnit.structs.push(st);
          contract.structs.push(st);
          continue;
        }

        // enum
        if (inner.type === TT.ENUM) {
          eat();
          const ename = peek().type === TT.IDENT ? eat().value : 'unnamed';
          if (peek().type === TT.LBRACE) {
            eat();
            skipToAny(TT.RBRACE, TT.EOF);
            eatIf(TT.RBRACE);
          }
          const en = { type: 'EnumDefinition', name: ename, line: inner.line, contract: contractName };
          sourceUnit.enums.push(en);
          contract.enums.push(en);
          continue;
        }

        // using ... for ...;
        if (inner.type === TT.USING) {
          skipToAny(TT.SEMI, TT.RBRACE); eatIf(TT.SEMI);
          continue;
        }

        // State variable: anything left at contract scope is a state var decl
        if ([TT.KEYWORD, TT.IDENT, TT.MAPPING].includes(inner.type)) {
          const svLine = inner.line;
          const svType = parseTypeExpr();
          const svMods = [];
          while (peek().type === TT.KEYWORD &&
                 ['public','private','internal','constant','immutable'].includes(peek().value)) {
            svMods.push(eat().value);
          }
          let svName = '';
          if (peek().type === TT.IDENT) svName = eat().value;
          // skip optional initialiser
          if (peek().type === TT.ASSIGN) { skipToAny(TT.SEMI, TT.RBRACE); }
          eatIf(TT.SEMI);
          if (svName) {
            const sv = { type: 'StateVariableDeclaration', name: svName, varType: svType, mods: svMods, line: svLine, contract: contractName };
            sourceUnit.stateVars.push(sv);
            contract.stateVars = contract.stateVars || [];
            contract.stateVars.push(sv);
          }
          continue;
        }

        eat(); // skip unknown token inside contract
      }
      eatIf(TT.RBRACE);
      continue;
    }

    eat(); // skip unknown top-level token
  }

  return sourceUnit;
}
