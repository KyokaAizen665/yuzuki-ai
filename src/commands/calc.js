/**
 * Command: calc
 * Safe math expression evaluator — no eval(), uses a recursive descent parser.
 *
 * Supports: + - * / ^ % ( ) and functions: sqrt, abs, floor, ceil, round, log, sin, cos, tan
 *
 * Usage:
 *   .calc 2 + 2
 *   .calc (10 * 5) / 2
 *   .calc sqrt(144)
 *   .calc 15% of 200
 */
import { sendInteractive, quickReply, ctaCopy } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'calc',
  description: 'Safe math calculator with full expression support',
  category:    'tools',
  aliases:     ['math', 'hitung', '='],
  cooldown:    2,
  permission:  'public',
};

const CALC_ICON = { url: 'https://img.icons8.com/color/96/calculator--v1.png' };

// ── Safe expression parser ────────────────────────────────────────────────────

class Parser {
  constructor(expr) {
    this.tokens = this._tokenize(expr);
    this.pos    = 0;
  }

  _tokenize(expr) {
    const re = /(\d+\.?\d*|\.\d+)|([+\-*/^%(),])|([a-zA-Z_]\w*)/g;
    const tokens = [];
    let m;
    while ((m = re.exec(expr)) !== null) {
      if (m[1]) tokens.push({ type: 'num', val: parseFloat(m[1]) });
      else if (m[2]) tokens.push({ type: 'op', val: m[2] });
      else if (m[3]) tokens.push({ type: 'fn', val: m[3].toLowerCase() });
    }
    return tokens;
  }

  peek() { return this.tokens[this.pos]; }
  consume() { return this.tokens[this.pos++]; }

  parse() {
    const result = this.expr();
    if (this.pos < this.tokens.length) throw new Error('Unexpected token');
    return result;
  }

  expr() {
    let left = this.term();
    while (this.peek()?.type === 'op' && ['+', '-'].includes(this.peek().val)) {
      const op = this.consume().val;
      const right = this.term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  term() {
    let left = this.power();
    while (this.peek()?.type === 'op' && ['*', '/', '%'].includes(this.peek().val)) {
      const op = this.consume().val;
      const right = this.power();
      if (op === '*') left = left * right;
      else if (op === '/') { if (right === 0) throw new Error('Division by zero'); left = left / right; }
      else left = left % right;
    }
    return left;
  }

  power() {
    let base = this.unary();
    if (this.peek()?.type === 'op' && this.peek().val === '^') {
      this.consume();
      base = Math.pow(base, this.unary());
    }
    return base;
  }

  unary() {
    if (this.peek()?.type === 'op' && this.peek().val === '-') {
      this.consume();
      return -this.primary();
    }
    if (this.peek()?.type === 'op' && this.peek().val === '+') {
      this.consume();
    }
    return this.primary();
  }

  primary() {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of expression');

    if (t.type === 'num') { this.consume(); return t.val; }

    if (t.type === 'fn') {
      const name = this.consume().val;
      const FNS = { sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
                    round: Math.round, log: Math.log10, ln: Math.log,
                    sin: Math.sin, cos: Math.cos, tan: Math.tan };
      if (name === 'pi') return Math.PI;
      if (name === 'e')  return Math.E;
      const fn = FNS[name];
      if (!fn) throw new Error(`Unknown function: ${name}`);
      if (this.peek()?.val !== '(') throw new Error(`Expected '(' after ${name}`);
      this.consume();
      const arg = this.expr();
      if (this.peek()?.val !== ')') throw new Error("Expected ')'");
      this.consume();
      return fn(arg);
    }

    if (t.type === 'op' && t.val === '(') {
      this.consume();
      const val = this.expr();
      if (this.peek()?.val !== ')') throw new Error("Expected ')'");
      this.consume();
      return val;
    }

    throw new Error(`Unexpected token: ${t.val}`);
  }
}

function safeEval(expr) {
  let e = expr
    .replace(/(\d+)\s*%\s*of\s*(\d+)/gi, '($1/100)*$2')
    .replace(/[²]/g, '^2')
    .replace(/[³]/g, '^3')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '');
  return new Parser(e).parse();
}

function fmt(n) {
  if (!isFinite(n)) return String(n);
  return parseFloat(n.toPrecision(10)).toString();
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p = config.prefix;

  const expr = args.join(' ').trim();

  if (!expr) {
    return sendInteractive(sock, jid, {
      header:       '🧮 Calculator',
      contextImage: CALC_ICON,
      body:
        `*Usage:* \`${p}calc <expression>\`\n\n` +
        `*Examples:*\n` +
        `• \`${p}calc 2 + 2\`\n` +
        `• \`${p}calc (10 * 5) / 2\`\n` +
        `• \`${p}calc sqrt(144)\`\n` +
        `• \`${p}calc 15% of 200\`\n` +
        `• \`${p}calc 2^10\`\n\n` +
        `_Functions: sqrt, abs, floor, ceil, round, log, ln, sin, cos, tan, pi, e_`,
      footer: `🌸 ${config.botName}`,
      buttons: [
        quickReply('📐 sqrt(144)', 'calc sqrt(144)'),
        quickReply('💯 15% of 200', 'calc 15% of 200'),
      ],
    }, rawMessage);
  }

  let result;
  try {
    result = safeEval(expr);
  } catch (e) {
    return sendInteractive(sock, jid, {
      header:       '🧮 Calculator',
      contextImage: CALC_ICON,
      body:         `❌ *Invalid expression*\n\`${expr}\`\n\n_${e.message}_`,
      footer:       `🌸 ${config.botName}`,
      buttons:      [quickReply('🔄 Try Again', 'calc')],
    }, rawMessage);
  }

  const answer = fmt(result);

  return sendInteractive(sock, jid, {
    header:       '🧮 Calculator',
    contextImage: CALC_ICON,
    body:         `\`${expr}\`\n\n*= ${answer}*`,
    footer:       `🌸 ${config.botName}`,
    buttons: [
      ctaCopy('📋 Copy Answer', answer),
      quickReply('🔄 New Calc', 'calc'),
    ],
  }, rawMessage);
}
