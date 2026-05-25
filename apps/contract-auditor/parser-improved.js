// ============================================================
// GEMFLOW Ω  ·  js/core/parser-improved.js
// Recursive-descent Solidity parser → rich, typed AST with
// proper control flow structure and expression trees
// ============================================================

import { TT } from './tokenizer-improved.js';

export class ParseError extends Error {
  constructor(msg, line, col) { 
    super(`[Parse ${line}:${col}] ${msg}`); 
    this.line = line; 
    this.col = col;
  }
}

// AST Node types
class ASTNode {
  constructor(type, line, col) {
    this.type = type;
    this.line = line;
    this.col = col;
  }
}

class Identifier extends ASTNode {
  constructor(name, line, col) {
    super('Identifier', line, col);
    this.name = name;
  }
}

class BinaryOp extends ASTNode {
  constructor(op, left, right, line, col) {
    super('BinaryOp', line, col);
    this.op = op;
    this.left = left;
    this.right = right;
  }
}

class UnaryOp extends ASTNode {
  constructor(op, operand, line, col) {
    super('UnaryOp', line, col);
    this.op = op;
    this.operand = operand;
  }
}

class CallExpr extends ASTNode {
  constructor(func, args, line, col) {
    super('CallExpr', line, col);
    this.func = func;
    this.args = args;
  }
}

class Literal extends ASTNode {
  constructor(value, kind, line, col) {
    super('Literal', line, col);
    this.value = value;
    this.kind = kind; // 'number' | 'string' | 'bool' | 'hex'
  }
}

class TypeExpr extends ASTNode {
  constructor(base, dims = [], line, col) {
    super('TypeExpr', line, col);
    this.base = base;      // string: 'uint256', 'address', 'mapping(...)'
    this.dims = dims;      // array dimensions: ['[]', '[10]', ...]
  }
}

class IfStmt extends ASTNode {
  constructor(cond, consequent, alternate, line, col) {
    super('IfStmt', line, col);
    this.cond = cond;
    this.consequent = consequent;
    this.alternate = alternate;
  }
}

class WhileStmt extends ASTNode {
  constructor(cond, body, line, col) {
    super('WhileStmt', line, col);
    this.cond = cond;
    this.body = body;
  }
}

class ForStmt extends ASTNode {
  constructor(init, cond, update, body, line, col) {
    super('ForStmt', line, col);
    this.init = init;
    this.cond = cond;
    this.update = update;
    this.body = body;
  }
}

class Block extends ASTNode {
  constructor(stmts, line, col) {
    super('Block', line, col);
    this.stmts = stmts;
  }
}

export function parse(tokenResult) {
  const { tokens, errors: lexErrors } = tokenResult;
  let pos = 0;
  const errors = [...lexErrors];

  // ── Helpers ────────────────────────────────────────────────
  const peek  = (off=0) => tokens[Math.min(pos+off, tokens.length-1)];
  const done  = ()      => peek().type === TT.EOF;
  const eat   = ()      => tokens[pos++] ?? tokens[tokens.length-1];
  const line  = ()      => peek().line;
  const col   = ()      => peek().col;

  function expect(type, hint='') {
    if (peek().type !== type) {
      const err = new ParseError(`Expected ${type} got ${peek().type} ('${peek().value}') ${hint}`, line(), col());
      errors.push(err);
      return { type, value: '', line: line(), col: col() };
    }
    return eat();
  }

  function eatIf(type) {
    if (peek().type === type) return eat();
    return null;
  }

  function skipToAny(...types) {
    let depth = 0;
    while (!done() && (depth > 0 || !types.includes(peek().type))) {
      if ([TT.LBRACE, TT.LPAREN, TT.LBRACKET].includes(peek().type)) depth++;
      if ([TT.RBRACE, TT.RPAREN, TT.RBRACKET].includes(peek().type)) depth--;
      eat();
    }
  }

  // ── Expression parsing with operator precedence ─────────────

  function parseExpression() {
    return parseLogicalOr();
  }

  function parseLogicalOr() {
    let left = parseLogicalAnd();
    while (peek().value === '||') {
      const op = eat().value;
      const right = parseLogicalAnd();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseLogicalAnd() {
    let left = parseBitwiseOr();
    while (peek().value === '&&') {
      const op = eat().value;
      const right = parseBitwiseOr();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseBitwiseOr() {
    let left = parseBitwiseXor();
    while (peek().value === '|') {
      const op = eat().value;
      const right = parseBitwiseXor();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseBitwiseXor() {
    let left = parseBitwiseAnd();
    while (peek().value === '^') {
      const op = eat().value;
      const right = parseBitwiseAnd();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseBitwiseAnd() {
    let left = parseEquality();
    while (peek().value === '&') {
      const op = eat().value;
      const right = parseEquality();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseEquality() {
    let left = parseComparison();
    while ([TT.EQ, TT.NEQ].includes(peek().type)) {
      const op = eat().value;
      const right = parseComparison();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseComparison() {
    let left = parseShift();
    while ([TT.LT, TT.GT, TT.LTE, TT.GTE].includes(peek().type) || 
           ['<', '>', '<=', '>='].includes(peek().value)) {
      const op = eat().value;
      const right = parseShift();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseShift() {
    let left = parseAdditive();
    while (['<<', '>>'].includes(peek().value)) {
      const op = eat().value;
      const right = parseAdditive();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseAdditive() {
    let left = parseMultiplicative();
    while (['+', '-'].includes(peek().value)) {
      const op = eat().value;
      const right = parseMultiplicative();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseMultiplicative() {
    let left = parseExponentiation();
    while (['*', '/', '%'].includes(peek().value)) {
      const op = eat().value;
      const right = parseExponentiation();
      left = new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseExponentiation() {
    let left = parseUnary();
    if (peek().value === '**') {
      const op = eat().value;
      const right = parseExponentiation();
      return new BinaryOp(op, left, right, left.line, left.col);
    }
    return left;
  }

  function parseUnary() {
    if (['!', '~', '-', '+', '++', '--', 'new', 'delete'].includes(peek().value)) {
      const op = eat().value;
      const operand = parseUnary();
      return new UnaryOp(op, operand, line(), col());
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let expr = parsePrimary();
    while (true) {
      if (peek().type === TT.LPAREN) {
        eat();
        const args = [];
        while (peek().type !== TT.RPAREN && !done()) {
          args.push(parseExpression());
          eatIf(TT.COMMA);
        }
        expect(TT.RPAREN);
        expr = new CallExpr(expr, args, expr.line, expr.col);
      } else if (peek().type === TT.LBRACKET) {
        eat();
        const index = parseExpression();
        expect(TT.RBRACKET);
        expr = new BinaryOp('[]', expr, index, expr.line, expr.col);
      } else if (peek().type === TT.DOT) {
        eat();
        const member = expect(TT.IDENT, 'member access').value;
        expr = new BinaryOp('.', expr, new Identifier(member, line(), col()), expr.line, expr.col);
      } else {
        break;
      }
    }
    return expr;
  }

  function parsePrimary() {
    const t = peek();
    const startLine = line();
    const startCol = col();

    if (t.type === TT.NUMBER || t.type === TT.HEXLIT) {
      const val = eat().value;
      return new Literal(val, t.type === TT.HEXLIT ? 'hex' : 'number', startLine, startCol);
    }

    if (t.type === TT.STRING) {
      const val = eat().value;
      return new Literal(val, 'string', startLine, startCol);
    }

    if (t.type === TT.BOOL) {
      const val = eat().value;
      return new Literal(val === 'true', 'bool', startLine, startCol);
    }

    if (t.type === TT.IDENT) {
      const name = eat().value;
      return new Identifier(name, startLine, startCol);
    }

    if (peek().value === 'true' || peek().value === 'false') {
      const val = eat().value;
      return new Literal(val === 'true', 'bool', startLine, startCol);
    }

    if (t.type === TT.LPAREN) {
      eat();
      const expr = parseExpression();
      expect(TT.RPAREN);
      return expr;
    }

    errors.push(new ParseError(`Unexpected token in expression: ${t.type}`, startLine, startCol));
    eat();
    return new Identifier('_error', startLine, startCol);
  }

  // ── Type expression ────────────────────────────────────────
  function parseTypeExpr() {
    let base = '';

    if (peek().type === TT.MAPPING) {
      eat();
      expect(TT.LPAREN);
      const keyType = parseTypeExpr();
      expect(TT.ARROW);
      const valType = parseTypeExpr();
      expect(TT.RPAREN);
      base = `mapping(${keyType} => ${valType})`;
    } else if (peek().value === 'function') {
      eat();
      base = 'function';
      if (peek().type === TT.LPAREN) { 
        eat(); 
        skipToAny(TT.RPAREN, TT.SEMI, TT.EOF); 
        eatIf(TT.RPAREN); 
      }
    } else {
      base = eat().value;
    }

    const dims = [];
    while (peek().type === TT.LBRACKET) {
      eat();
      let dim = '';
      while (peek().type !== TT.RBRACKET && !done()) dim += eat().value;
      expect(TT.RBRACKET);
      dims.push(`[${dim}]`);
    }

    return new TypeExpr(base, dims, line(), col());
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

  // ── Statement parsing ──────────────────────────────────────
  function parseStatement() {
    const t = peek();
    if (t.type === TT.LBRACE) return parseBlock();
    if (t.value === 'if') return parseIfStatement();
    if (t.value === 'while') return parseWhileStatement();
    if (t.value === 'for') return parseForStatement();
    if (t.value === 'return') {
      eat();
      const expr = peek().type !== TT.SEMI ? parseExpression() : null;
      eatIf(TT.SEMI);
      return new ASTNode('ReturnStmt', t.line, t.col);
    }
    if (t.value === 'revert' || t.value === 'throw') {
      eat();
      eatIf(TT.SEMI);
      return new ASTNode('RevertStmt', t.line, t.col);
    }
    // Expression statement
    parseExpression();
    eatIf(TT.SEMI);
    return new ASTNode('ExprStmt', t.line, t.col);
  }

  function parseBlock() {
    const startLine = line();
    const startCol = col();
    expect(TT.LBRACE);
    const stmts = [];
    while (peek().type !== TT.RBRACE && !done()) {
      stmts.push(parseStatement());
    }
    expect(TT.RBRACE);
    return new Block(stmts, startLine, startCol);
  }

  function parseIfStatement() {
    const startLine = line();
    const startCol = col();
    eat(); // 'if'
    expect(TT.LPAREN);
    const cond = parseExpression();
    expect(TT.RPAREN);
    const consequent = parseStatement();
    const alternate = eatIf(TT.KEYWORD) && peek(-1).value === 'else' ? parseStatement() : null;
    if (alternate === null && peek().value === 'else') {
      eat();
      return new IfStmt(cond, consequent, parseStatement(), startLine, startCol);
    }
    return new IfStmt(cond, consequent, alternate, startLine, startCol);
  }

  function parseWhileStatement() {
    const startLine = line();
    const startCol = col();
    eat(); // 'while'
    expect(TT.LPAREN);
    const cond = parseExpression();
    expect(TT.RPAREN);
    const body = parseStatement();
    return new WhileStmt(cond, body, startLine, startCol);
  }

  function parseForStatement() {
    const startLine = line();
    const startCol = col();
    eat(); // 'for'
    expect(TT.LPAREN);
    const init = peek().type !== TT.SEMI ? parseExpression() : null;
    expect(TT.SEMI);
    const cond = peek().type !== TT.SEMI ? parseExpression() : null;
    expect(TT.SEMI);
    const update = peek().type !== TT.RPAREN ? parseExpression() : null;
    expect(TT.RPAREN);
    const body = parseStatement();
    return new ForStmt(init, cond, update, body, startLine, startCol);
  }

  // ── Function modifiers ───────────────────────────────────────
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
      else if (v === 'returns')   { eat(); head.returns = parseParamList(); }
      else if (peek().type === TT.IDENT) { head.modifiers.push(eat().value); }
      else break;
    }
    return head;
  }

  // ── Top-level source unit ──────────────────────────────────
  const sourceUnit = {
    type: 'SourceUnit',
    pragmas: [],
    contracts: [],
    functions: [],
    stateVars: [],
    structs: [],
    enums: [],
    events: [],
    modifiers: [],
    errors: [],
    is08Plus: false,
    uncheckedSites: [],
    parseErrors: errors,
    astNodes: []
  };

  // ── Main parse loop ────────────────────────────────────────
  while (!done()) {
    const t = peek();

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

        if (inner.type === TT.FUNCTION ||
            inner.value === 'constructor' || inner.value === 'fallback' || inner.value === 'receive') {
          const isSpecial = inner.type !== TT.FUNCTION;
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
          continue;
        }

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

        if (inner.type === TT.STRUCT) {
          eat();
          const sname = peek().type === TT.IDENT ? eat().value : 'unnamed';
          parseBlock();
          const st = { type: 'StructDefinition', name: sname, line: inner.line, contract: contractName };
          sourceUnit.structs.push(st);
          contract.structs.push(st);
          continue;
        }

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

        if (inner.type === TT.USING) {
          skipToAny(TT.SEMI, TT.RBRACE); eatIf(TT.SEMI);
          continue;
        }

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

        eat();
      }
      eatIf(TT.RBRACE);
      continue;
    }

    eat();
  }

  return sourceUnit;
}
