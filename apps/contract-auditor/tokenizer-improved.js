// ============================================================
// GEMFLOW Ω  ·  js/core/tokenizer-improved.js
// Real character-level Solidity lexer with enhanced error handling
// ============================================================

export const TT = {
  PRAGMA:'PRAGMA', CONTRACT:'CONTRACT', INTERFACE:'INTERFACE', LIBRARY:'LIBRARY',
  FUNCTION:'FUNCTION', MODIFIER:'MODIFIER', EVENT:'EVENT', ERROR:'ERROR',
  STRUCT:'STRUCT', ENUM:'ENUM', MAPPING:'MAPPING', USING:'USING',
  KEYWORD:'KEYWORD', IDENT:'IDENT', NUMBER:'NUMBER', STRING:'STRING', BOOL:'BOOL',
  LBRACE:'LBRACE', RBRACE:'RBRACE', LPAREN:'LPAREN', RPAREN:'RPAREN',
  LBRACKET:'LBRACKET', RBRACKET:'RBRACKET',
  SEMI:'SEMI', COMMA:'COMMA', DOT:'DOT', COLON:'COLON', ARROW:'ARROW',
  EQ:'EQ', NEQ:'NEQ', ASSIGN:'ASSIGN', AUGASSIGN:'AUGASSIGN',
  OP:'OP', LINE_COMMENT:'LINE_COMMENT', BLOCK_COMMENT:'BLOCK_COMMENT', 
  HEXLIT:'HEXLIT', INVALID:'INVALID', EOF:'EOF'
};

const KEYWORDS = new Set([
  'if','else','while','do','for','break','continue','return','throw','emit',
  'try','catch','revert','new','delete','assembly','unchecked',
  'require','assert','is','using','from',
  'public','private','internal','external','view','pure','payable',
  'virtual','override','constant','immutable','anonymous','indexed',
  'address','bool','string','bytes','uint','int','true','false',
  'msg','tx','block','abi','this','super','type','memory','calldata','storage',
  'bytes1','bytes2','bytes4','bytes8','bytes16','bytes32',
  'uint8','uint16','uint32','uint64','uint128','uint256',
  'int8','int16','int32','int64','int128','int256'
]);

const UNIT_SUFFIXES = new Set([
  'wei', 'gwei', 'ether', 'seconds', 'minutes', 'hours', 'days', 'weeks', 'years'
]);

class TokenizerError extends Error {
  constructor(message, line, col) {
    super(`[Lexer ${line}:${col}] ${message}`);
    this.line = line;
    this.col = col;
  }
}

export function tokenize(source) {
  const tokens = [];
  let i = 0, line = 1, col = 1;
  const len = source.length;
  const errors = [];

  const ch  = (off=0) => source[i+off] ?? '';
  const adv = (n=1)   => { 
    for (let j = 0; j < n; j++) {
      if (source[i] === '\n') { line++; col = 1; }
      else col++;
      i++;
    }
  };
  const tok = (type, value, startLine, startCol) => {
    tokens.push({ type, value, line: startLine, col: startCol });
  };

  while (i < len) {
    const c = ch();
    const startLine = line;
    const startCol = col;

    // Newline
    if (c === '\n') { adv(); continue; }
    // Whitespace
    if (/\s/.test(c)) { adv(); continue; }

    // Line comment
    if (c === '/' && ch(1) === '/') {
      const start = i; adv(2);
      while (i < len && ch() !== '\n') adv();
      tok(TT.LINE_COMMENT, source.slice(start, i), startLine, startCol);
      continue;
    }

    // Block comment with proper nesting tracking
    if (c === '/' && ch(1) === '*') {
      const start = i; adv(2);
      let depth = 1;
      while (i < len - 1 && depth > 0) {
        if (ch() === '*' && ch(1) === '/') { depth--; adv(2); }
        else if (ch() === '/' && ch(1) === '*') { depth++; adv(2); }
        else adv();
      }
      tok(TT.BLOCK_COMMENT, source.slice(start, i), startLine, startCol);
      continue;
    }

    // String literal (double, single, or backtick)
    if (c === '"' || c === "'" || c === '`') {
      const q = c; adv(); let val = '';
      while (i < len && ch() !== q) {
        if (ch() === '\\') { val += ch(); adv(); if (i < len) { val += ch(); adv(); } }
        else { val += ch(); adv(); }
      }
      if (i >= len) {
        errors.push(new TokenizerError(`Unterminated string literal`, startLine, startCol));
        tok(TT.INVALID, val, startLine, startCol);
      } else {
        adv(); // closing quote
        tok(TT.STRING, val, startLine, startCol);
      }
      continue;
    }

    // Hex literal or decimal number
    if (/[0-9]/.test(c)) {
      const start = i;
      if (c === '0' && /[xX]/.test(ch(1))) {
        adv(2);
        while (/[0-9a-fA-F_]/.test(ch())) adv();
        tok(TT.HEXLIT, source.slice(start, i), startLine, startCol);
      } else {
        while (/[0-9_]/.test(ch())) adv();
        // Decimal part
        if (ch() === '.' && /[0-9]/.test(ch(1))) { 
          adv(); 
          while (/[0-9_]/.test(ch())) adv(); 
        }
        // Scientific notation
        if (/[eE]/.test(ch())) { 
          adv(); 
          if (/[+-]/.test(ch())) adv(); 
          while (/[0-9]/.test(ch())) adv(); 
        }
        // Unit suffix (wei, gwei, ether, etc.)
        const numVal = source.slice(start, i);
        if (/[a-zA-Z]/.test(ch())) {
          const unitStart = i;
          while (/[a-zA-Z]/.test(ch())) adv();
          const unit = source.slice(unitStart, i);
          if (UNIT_SUFFIXES.has(unit)) {
            tok(TT.NUMBER, source.slice(start, i), startLine, startCol);
          } else {
            // Invalid unit, tokenize number and identifier separately
            i = unitStart;
            tok(TT.NUMBER, numVal, startLine, startCol);
            continue;
          }
        } else {
          tok(TT.NUMBER, numVal, startLine, startCol);
        }
      }
      continue;
    }

    // Identifier / keyword / type
    if (/[a-zA-Z_$]/.test(c)) {
      const start = i;
      while (i < len && /[\w$]/.test(ch())) adv();
      const word = source.slice(start, i);
      let type;
      switch (word) {
        case 'pragma':    type = TT.PRAGMA;    break;
        case 'contract':  type = TT.CONTRACT;  break;
        case 'interface': type = TT.INTERFACE; break;
        case 'library':   type = TT.LIBRARY;   break;
        case 'function':  type = TT.FUNCTION;  break;
        case 'modifier':  type = TT.MODIFIER;  break;
        case 'event':     type = TT.EVENT;     break;
        case 'error':     type = TT.ERROR;     break;
        case 'struct':    type = TT.STRUCT;    break;
        case 'enum':      type = TT.ENUM;      break;
        case 'mapping':   type = TT.MAPPING;   break;
        case 'using':     type = TT.USING;     break;
        case 'true': case 'false': type = TT.BOOL; break;
        default:
          type = KEYWORDS.has(word) ? TT.KEYWORD : TT.IDENT;
      }
      tok(type, word, startLine, startCol);
      continue;
    }

    // Multi-char operators (order matters — longest match first)
    const s3 = source.slice(i, i+3);
    const s2 = source.slice(i, i+2);

    if (s3 === '>>>') { tok(TT.OP, s3, startLine, startCol); adv(3); continue; }
    if (s3 === '**=') { tok(TT.AUGASSIGN, s3, startLine, startCol); adv(3); continue; }
    if (s3 === '<<=' || s3 === '>>=') { tok(TT.AUGASSIGN, s3, startLine, startCol); adv(3); continue; }
    if (s2 === '=>') { tok(TT.ARROW, s2, startLine, startCol); adv(2); continue; }
    if (s2 === '==') { tok(TT.EQ, s2, startLine, startCol); adv(2); continue; }
    if (s2 === '!=') { tok(TT.NEQ, s2, startLine, startCol); adv(2); continue; }
    if (s2 === '**') { tok(TT.OP, s2, startLine, startCol); adv(2); continue; }
    if (s2 === '&&' || s2 === '||') { tok(TT.OP, s2, startLine, startCol); adv(2); continue; }
    if (s2 === '++' || s2 === '--') { tok(TT.OP, s2, startLine, startCol); adv(2); continue; }
    if (s2 === '<<' || s2 === '>>') { tok(TT.OP, s2, startLine, startCol); adv(2); continue; }
    if (/[+\-*\/%&|^<>!~]=/.test(s2)) { tok(TT.AUGASSIGN, s2, startLine, startCol); adv(2); continue; }

    // Single-char operators
    switch (c) {
      case '{': tok(TT.LBRACE,    c, startLine, startCol); break;
      case '}': tok(TT.RBRACE,    c, startLine, startCol); break;
      case '(': tok(TT.LPAREN,    c, startLine, startCol); break;
      case ')': tok(TT.RPAREN,    c, startLine, startCol); break;
      case '[': tok(TT.LBRACKET,  c, startLine, startCol); break;
      case ']': tok(TT.RBRACKET,  c, startLine, startCol); break;
      case ';': tok(TT.SEMI,      c, startLine, startCol); break;
      case ',': tok(TT.COMMA,     c, startLine, startCol); break;
      case '.': tok(TT.DOT,       c, startLine, startCol); break;
      case ':': tok(TT.COLON,     c, startLine, startCol); break;
      case '=': tok(TT.ASSIGN,    c, startLine, startCol); break;
      default:  tok(TT.OP,        c, startLine, startCol);
    }
    adv();
  }

  tok(TT.EOF, '', line, col);
  return { tokens, errors };
}
