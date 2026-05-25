// ============================================================
// GEMFLOW Ω  ·  js/core/tokenizer.js
// Real character-level Solidity lexer
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
  OP:'OP', LINE_COMMENT:'LINE_COMMENT', BLOCK_COMMENT:'BLOCK_COMMENT', EOF:'EOF'
};

const KEYWORDS = new Set([
  'if','else','while','do','for','break','continue','return','throw','emit',
  'try','catch','revert','new','delete','assembly','unchecked',
  'require','assert','is','using','from',
  'public','private','internal','external','view','pure','payable',
  'virtual','override','constant','immutable','anonymous','indexed',
  'address','bool','string','bytes','uint','int','true','false',
  'msg','tx','block','abi','this','super','type','memory','calldata','storage'
]);

export function tokenize(source) {
  const tokens = [];
  let i = 0, line = 1;
  const len = source.length;

  const ch  = (off=0) => source[i+off] ?? '';
  const adv = (n=1)   => { i += n; };
  const tok = (type, value, ln=line) => tokens.push({ type, value, line: ln });

  while (i < len) {
    const c = ch();

    // Newline
    if (c === '\n') { line++; adv(); continue; }
    // Whitespace
    if (/\s/.test(c)) { adv(); continue; }

    // Line comment
    if (c === '/' && ch(1) === '/') {
      const start = i; adv(2);
      while (i < len && ch() !== '\n') adv();
      tok(TT.LINE_COMMENT, source.slice(start, i));
      continue;
    }

    // Block comment
    if (c === '/' && ch(1) === '*') {
      const start = i; const startLine = line; adv(2);
      while (i < len - 1 && !(ch() === '*' && ch(1) === '/')) {
        if (ch() === '\n') line++;
        adv();
      }
      adv(2);
      tok(TT.BLOCK_COMMENT, source.slice(start, i), startLine);
      continue;
    }

    // String literal (double or single quote)
    if (c === '"' || c === "'") {
      const q = c; adv(); let val = '';
      while (i < len && ch() !== q) {
        if (ch() === '\\') { adv(); }
        val += ch(); adv();
      }
      adv();
      tok(TT.STRING, val);
      continue;
    }

    // Hex / decimal number
    if (/[0-9]/.test(c)) {
      const start = i;
      if (c === '0' && /[xX]/.test(ch(1))) {
        adv(2);
        while (/[0-9a-fA-F_]/.test(ch())) adv();
      } else {
        while (/[0-9_]/.test(ch())) adv();
        if (ch() === '.') { adv(); while (/[0-9_]/.test(ch())) adv(); }
        if (/[eE]/.test(ch())) { adv(); if (/[+-]/.test(ch())) adv(); while (/[0-9]/.test(ch())) adv(); }
      }
      // unit suffix: ether wei gwei seconds minutes hours days weeks years
      if (/[a-zA-Z]/.test(ch())) { while (/\w/.test(ch())) adv(); }
      tok(TT.NUMBER, source.slice(start, i));
      continue;
    }

    // Identifier / keyword
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
      tok(type, word);
      continue;
    }

    // Multi-char operators (order matters — longest match first)
    const s2 = source.slice(i, i+2);
    const s3 = source.slice(i, i+3);

    if (s3 === '>>>') { tok(TT.OP, s3); adv(3); continue; }
    if (s3 === '**=') { tok(TT.AUGASSIGN, s3); adv(3); continue; }
    if (s3 === '<<=' || s3 === '>>=') { tok(TT.AUGASSIGN, s3); adv(3); continue; }
    if (s2 === '=>') { tok(TT.ARROW, s2); adv(2); continue; }
    if (s2 === '==') { tok(TT.EQ, s2); adv(2); continue; }
    if (s2 === '!=') { tok(TT.NEQ, s2); adv(2); continue; }
    if (s2 === '**') { tok(TT.OP, s2); adv(2); continue; }
    if (s2 === '&&' || s2 === '||') { tok(TT.OP, s2); adv(2); continue; }
    if (s2 === '++' || s2 === '--') { tok(TT.OP, s2); adv(2); continue; }
    if (s2 === '<<' || s2 === '>>') { tok(TT.OP, s2); adv(2); continue; }
    if (/[+\-*\/%&|^<>!~]=/.test(s2)) { tok(TT.AUGASSIGN, s2); adv(2); continue; }

    // Single-char
    switch (c) {
      case '{': tok(TT.LBRACE,    c); break;
      case '}': tok(TT.RBRACE,    c); break;
      case '(': tok(TT.LPAREN,    c); break;
      case ')': tok(TT.RPAREN,    c); break;
      case '[': tok(TT.LBRACKET,  c); break;
      case ']': tok(TT.RBRACKET,  c); break;
      case ';': tok(TT.SEMI,      c); break;
      case ',': tok(TT.COMMA,     c); break;
      case '.': tok(TT.DOT,       c); break;
      case ':': tok(TT.COLON,     c); break;
      case '=': tok(TT.ASSIGN,    c); break;
      default:  tok(TT.OP,        c);
    }
    adv();
  }

  tok(TT.EOF, '', line);
  return tokens;
}
