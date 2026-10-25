/**
 * Solve-time input cleaning for every calculus calculator.
 *
 * People type math in countless irregular ways: stray spaces, a trailing dot,
 * "f(x)=x^2", "y=x^2", Python-style "x**2", "|x|", "[x+1]", "sin x",
 * "sin^2 x", "arcsin x", "xe^x", "X^2", pasted Word/PDF symbols with zero-width
 * or non-breaking characters, full-width letters, and so on. mathjs (which does
 * the real work) understands none of these, and several would be silently
 * mis-read — "sin x" became sin*x, "X^2" differentiated to 0, "xe^x" became the
 * one symbol "xe". cleanExpression() turns all of that into plain mathjs syntax
 * with the *conventional* meaning, and is idempotent so already-clean strings
 * (including mathjs's own output) pass through unchanged.
 *
 * It does NOT mutate what the user is typing — it runs when a calculation is
 * performed (and the solvers' "Given" step shows how the input was read).
 */
import { evaluate as mathEvaluate } from "mathjs";
import { normalizeSymbols, normalizeMathInput } from "./text-normalize";

// ── Function vocabulary ───────────────────────────────────────────────────────
const FUNCS = [
  "sin", "cos", "tan", "cot", "sec", "csc",
  "sinh", "cosh", "tanh", "coth", "sech", "csch",
  "asin", "acos", "atan", "acot", "asec", "acsc",
  "asinh", "acosh", "atanh", "acoth", "atan2",
  "sqrt", "cbrt", "abs", "exp", "log", "log2", "log10", "ln",
  "sign", "floor", "ceil", "round", "fix", "gamma", "erf", "factorial", "nthRoot",
  "max", "min", "mod", "gcd", "lcm", "hypot", "pow",
];
const ALIASES: Record<string, string> = {
  arcsin: "asin", arccos: "acos", arctan: "atan", arccot: "acot", arcsec: "asec", arccsc: "acsc",
  arcsinh: "asinh", arccosh: "acosh", arctanh: "atanh", arccoth: "acoth",
  arsinh: "asinh", arcosh: "acosh", artanh: "atanh",
  arctg: "atan", arcctg: "acot", sgn: "sign", tg: "tan", ctg: "cot", ctan: "cot",
  cosec: "csc", lg: "log10", sen: "sin",
};
const CANON = new Map<string, string>();
for (const f of FUNCS) CANON.set(f.toLowerCase(), f);
for (const [a, c] of Object.entries(ALIASES)) CANON.set(a, c);

// Functions that may be written without parentheses ("sin x", "ln 2x", "sqrt x").
const NO_PAREN_OK = new Set(
  [...CANON.keys()].filter((k) => !["gamma", "factorial", "erf", "nthroot", "atan2", "round", "floor", "ceil", "fix", "sign", "max", "min", "mod", "gcd", "lcm", "hypot", "pow"].includes(k)),
);
const FUNC_KEYS_DESC = [...CANON.keys()].sort((a, b) => b.length - a.length);

// sin^-1 → asin etc.
const INVERSE_OF: Record<string, string> = {
  sin: "asin", cos: "acos", tan: "atan", cot: "acot", sec: "asec", csc: "acsc",
  sinh: "asinh", cosh: "acosh", tanh: "atanh", coth: "acoth",
};

// Words that are constants / Greek names, kept whole (never split into letters).
const CONST_WORDS: Record<string, string> = {
  pi: "pi", tau: "tau", infinity: "Infinity", inf: "Infinity", nan: "NaN",
  theta: "theta", alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta",
  lambda: "lambda", mu: "mu", sigma: "sigma", phi: "phi", omega: "omega",
  epsilon: "epsilon", undefined: "undefined", true: "true", false: "false", null: "null",
};

// ── Small helpers ─────────────────────────────────────────────────────────────
const isLetter = (c: string | undefined) => !!c && /[A-Za-z]/.test(c);
const CONST_KEYS_DESC = Object.keys(CONST_WORDS).sort((a, b) => b.length - a.length);

/** "pix" → pi*x, "thetax" → theta*x, "xy" → x*y (constants kept whole). */
function splitWord(lower: string): string {
  const parts: string[] = [];
  let p = 0;
  while (p < lower.length) {
    const w = CONST_KEYS_DESC.find((k) => k.length > 1 && lower.startsWith(k, p) && !["undefined", "true", "false", "null", "nan"].includes(k));
    if (w) { parts.push(CONST_WORDS[w]); p += w.length; }
    else { parts.push(lower[p]); p++; }
  }
  return parts.join("*");
}

/** Index just past the ")" that closes the "(" at position i, or -1. */
function matchParen(s: string, i: number): number {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === "(") depth++;
    else if (s[k] === ")") {
      depth--;
      if (depth === 0) return k + 1;
    }
  }
  return -1;
}

const NUM_AT = /^(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/;

/** End of one "atom" starting at j (number, constant, letter, call, group). */
function parseAtom(s: string, j: number): number {
  if (j >= s.length) return -1;
  if (s[j] === "(") return matchParen(s, j);
  const num = NUM_AT.exec(s.slice(j));
  if (num) return j + num[0].length;
  const idm = /^[A-Za-z]+/.exec(s.slice(j));
  if (!idm) return -1;
  const word = idm[0];
  const lower = word.toLowerCase();
  let k = j + word.length;
  let q = k;
  while (s[q] === " ") q++;
  if (CANON.has(lower)) {
    if (s[q] === "(") return matchParen(s, q);          // fn(...)
    if (NO_PAREN_OK.has(lower)) {                        // nested "ln sin x"
      const inner = parseArg(s, k);
      return inner < 0 ? -1 : inner;
    }
  }
  if (CONST_WORDS[lower]) {                              // pi, theta, inf …
    // "sin pi x" → the argument is pi*x
    const ext = /^ ?([A-Za-z])(?![A-Za-z(])/.exec(s.slice(k));
    return ext && (lower === "pi" || lower === "theta") ? k + ext[0].length : k;
  }
  return j + 1;                                          // a single variable letter
}

/** Exponent after "^": optional sign, then number / constant / letter / group. */
function parseExponent(s: string, i: number): number {
  let j = i;
  while (s[j] === " ") j++;
  if (s[j] === "+" || s[j] === "-") j++;
  return parseAtom(s, j);
}

/** End of the argument of a paren-less function: "x", "2x", "x^2", "pi", "cos(x)". */
function parseArg(s: string, i: number): number {
  let j = i;
  while (s[j] === " ") j++;
  if (j >= s.length) return -1;
  if (s[j] === "+" || s[j] === "-") j++;
  let k = parseAtom(s, j);
  if (k < 0) return -1;
  // coefficient followed by a letter/group: 2x, 2pi, 3(x+1)
  if (NUM_AT.test(s.slice(j)) && (isLetter(s[k]) || s[k] === "(")) {
    const k2 = parseAtom(s, k);
    if (k2 > 0) k = k2;
  }
  // power
  let p = k;
  while (s[p] === " ") p++;
  if (s[p] === "^") {
    const e = parseExponent(s, p + 1);
    if (e > 0) k = e;
  }
  return k;
}

function letters(word: string): string {
  return splitWord(word.toLowerCase());
}

/** Splits a run of letters into implicit products, recognising a trailing
 *  "function + short argument" (xsinx → x*sin(x)). */
function splitIdentifier(id: string): { text: string; endsWithCall: boolean; callName?: string; callArg?: string; prefix?: string } {
  const lower = id.toLowerCase();
  for (let p = 0; p < lower.length; p++) {
    for (const f of FUNC_KEYS_DESC) {
      if (!NO_PAREN_OK.has(f)) continue;
      if (!lower.startsWith(f, p)) continue;
      const rest = lower.slice(p + f.length);
      if (rest.length === 0) continue;
      if (/^\d*[a-z]$/.test(rest) || /^\d+$/.test(rest) || CONST_WORDS[rest] || /^(pi|theta)[a-z]?$/.test(rest)) {
        const prefix = p > 0 ? letters(lower.slice(0, p)) + "*" : "";
        return { text: "", endsWithCall: true, callName: CANON.get(f)!, callArg: CONST_WORDS[rest] ?? rest, prefix };
      }
    }
  }
  return { text: letters(lower), endsWithCall: false };
}

// ── Core token pass ───────────────────────────────────────────────────────────
function transformTokens(s: string, lowerPresent: Set<string>): string {
  const re = /(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) continue;
    const id = m[2];
    const start = m.index;
    const end = start + id.length;
    const lower = id.toLowerCase();
    let q = end;
    while (s[q] === " ") q++;
    const next = s[q];
    const hasDigitOrUnderscore = /[\d_]/.test(id);

    out += s.slice(last, start);
    let replacement = id;
    let consumedTo = end;

    if (next === "(") {
      if (CANON.has(lower)) {
        replacement = CANON.get(lower)!;
      } else if (!hasDigitOrUnderscore && CONST_WORDS[lower]) {
        replacement = `${CONST_WORDS[lower]}*`;
      } else if (!hasDigitOrUnderscore) {
        // xsin(x) → x*sin(x);  x(x+1) → x*(x+1);  ab(x+1) → a*b*(x+1)
        let handled = false;
        for (let k = 1; k < lower.length && !handled; k++) {
          const suffix = lower.slice(k);
          if (CANON.has(suffix)) {
            replacement = `${letters(lower.slice(0, k))}*${CANON.get(suffix)}`;
            handled = true;
          }
        }
        if (!handled) {
          const single = id.length === 1 && /[A-Z]/.test(id) && !lowerPresent.has(lower) && id !== "E" ? lower : id.length === 1 ? id : letters(lower);
          replacement = `${single}*`;
        }
      } else {
        replacement = `${id}*`;
      }
    } else if (NO_PAREN_OK.has(lower)) {
      // Function written without parentheses: "sin x", "sin x^2", "sin^2 x", "ln 2x".
      let j = end;
      while (s[j] === " ") j++;
      let expText = "";
      if (s[j] === "^") {
        const ee = parseExponent(s, j + 1);
        if (ee > 0) {
          expText = s.slice(j + 1, ee).trim();
          j = ee;
        }
      }
      const argEnd = parseArg(s, j);
      if (argEnd > 0) {
        const argText = transformTokens(s.slice(j, argEnd).trim(), lowerPresent);
        const canon = CANON.get(lower)!;
        const bareArg = argText.startsWith("(") && matchParen(argText, 0) === argText.length ? argText.slice(1, -1) : argText;
        const stripExp = expText.replace(/^\((.*)\)$/, "$1").replace(/\s+/g, "");
        if (expText && stripExp === "-1" && INVERSE_OF[canon]) {
          replacement = `${INVERSE_OF[canon]}(${bareArg})`;
        } else if (expText) {
          replacement = `(${canon}(${bareArg}))^${/^\d+(\.\d+)?$/.test(stripExp) || /^[A-Za-z]$/.test(stripExp) ? stripExp : `(${stripExp})`}`;
        } else {
          replacement = `${canon}(${bareArg})`;
        }
        consumedTo = argEnd;
      } else {
        replacement = CANON.get(lower)!;
      }
    } else if (!hasDigitOrUnderscore && CONST_WORDS[lower]) {
      replacement = CONST_WORDS[lower];
    } else if (!hasDigitOrUnderscore && id.length === 1) {
      replacement = /[A-Z]/.test(id) && id !== "E" && !lowerPresent.has(lower) ? lower : id === "E" ? "e" : id;
    } else if (!hasDigitOrUnderscore) {
      // multi-letter run: sinx, cos2x, xsinx, xe, xy, XY …
      const sp = splitIdentifier(id);
      if (sp.endsWithCall) {
        let argText = sp.callArg!;
        let cEnd = end;
        let j = end;
        while (s[j] === " ") j++;
        if (s[j] === "^") {
          const ee = parseExponent(s, j + 1);
          if (ee > 0) {
            argText += `^${s.slice(j + 1, ee).trim()}`;
            cEnd = ee;
          }
        }
        replacement = `${sp.prefix}${sp.callName}(${transformTokens(argText, lowerPresent)})`;
        consumedTo = cEnd;
      } else {
        replacement = sp.text;
      }
    }

    out += replacement;
    last = consumedTo;
    re.lastIndex = consumedTo;
  }
  out += s.slice(last);
  return out;
}

// ── |x| → abs(x) ─────────────────────────────────────────────────────────────
function convertBars(s: string): string {
  if (!s.includes("|")) return s;
  let out = "";
  const stack: number[] = [];
  let prevSig = "";
  for (const ch of s) {
    if (ch === "|") {
      const operandBefore = /[A-Za-z0-9.)]/.test(prevSig);
      if (stack.length > 0 && operandBefore) {
        stack.pop();
        out += ")";
        prevSig = ")";
      } else {
        stack.push(out.length);
        out += isLetter(prevSig) ? " abs(" : "abs(";
        prevSig = "(";
      }
    } else {
      out += ch;
      if (ch !== " ") prevSig = ch;
    }
  }
  return out + ")".repeat(stack.length);
}

/** sinc(u), heaviside(u), step(u) and the infix "a mod b" — written out in plain mathjs so they graph and evaluate. */
function expandSpecialFunctions(src: string): string {
  let s = src;
  s = s.replace(/([A-Za-z0-9_.]+|\([^()]*\))\s+mod\s+([A-Za-z0-9_.]+|\([^()]*\))/gi, "mod($1,$2)");
  const table: Record<string, (u: string) => string> = {
    sinc: (u) => `(sin(${u})/(${u}))`,
    heaviside: (u) => `((${u}) >= 0 ? 1 : 0)`,
    step: (u) => `((${u}) >= 0 ? 1 : 0)`,
  };
  for (let guard = 0; guard < 30; guard++) {
    const m = /\b(sinc|heaviside|step)\s*\(/i.exec(s);
    if (!m) break;
    const open = m.index + m[0].length - 1;
    let depth = 0, close = -1;
    for (let i = open; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close < 0) break;
    const inner = s.slice(open + 1, close);
    s = s.slice(0, m.index) + table[m[1].toLowerCase()](inner) + s.slice(close + 1);
  }
  return s;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function cleanExpression(raw: string): string {
  if (raw === null || raw === undefined) return "";
  let s = String(raw);

  // Invisible / odd whitespace, full-width ASCII, assorted dashes & operators.
  s = s.replace(/[\u200B-\u200D\uFEFF\u2060-\u2064\u00AD]/g, "");
  s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\t\r\n]/g, " ");
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  s = s.replace(/[\u2010-\u2015\u2212\uFE63]/g, "-");
  s = s.replace(/[\u2217\u22C5\u2219\u2022\u2715\u2716]/g, "*");
  s = s.replace(/[\u2044\u2215]/g, "/");
  s = s.replace(/[\u02C6\u2038]/g, "^");
  s = s.replace(/\u00B0/g, "*(pi/180)");
  s = s.trim();
  if (!s) return "";

  // "f(x) = …", "y = …", "dy/dx = …"  →  just the right-hand side.
  const fnLhs = /^\s*(?:[A-Za-z]\w*\s*'*\s*\(\s*[A-Za-z]\w*\s*\)|dy\s*\/\s*dx|d\s*\/\s*dx|[A-Za-z]'+)\s*=(?!=)\s*(.+)$/.exec(s);
  if (fnLhs) s = fnLhs[1];
  else {
    const single = /^\s*([A-Za-z])\s*=(?!=)\s*(.+)$/.exec(s);
    if (single && !new RegExp(`(?<![A-Za-z])${single[1]}(?![A-Za-z])`).test(single[2])) s = single[2];
  }
  s = s.replace(/^[\s=]+/, "").replace(/[\s=?;:,.]+$/, "");
  if (!s) return "";

  s = s.replace(/\*\*/g, "^");
  s = expandSpecialFunctions(s);
  // log_2(x), log_b(x) → log(x, 2)
  for (let guard = 0; guard < 20; guard++) {
    const lm = /\blog_(\w+)\s*\(/i.exec(s);
    if (!lm) break;
    const open = lm.index + lm[0].length - 1;
    const close = matchParen(s, open);
    if (close < 0) break;
    s = `${s.slice(0, lm.index)}log(${s.slice(open + 1, close - 1)}, ${lm[1]})${s.slice(close)}`;
  }
  s = s.replace(/[[{]/g, "(").replace(/[\]}]/g, ")");
  s = convertBars(s);

  // 3,5x → 3.5x  (only when the commas can't be function-argument separators)
  if (s.includes(",") && !/[A-Za-z]\w*\s*\([^()]*,/.test(s)) s = s.replace(/(\d),(\d)/g, "$1.$2");

  s = normalizeSymbols(s);

  const lowerPresent = new Set<string>();
  for (const t of s.match(/(?<![A-Za-z0-9_])[a-z](?![A-Za-z0-9_(])/g) ?? []) lowerPresent.add(t);
  s = transformTokens(s, lowerPresent);

  s = s.replace(/\s{2,}/g, " ").trim();

  // Missing closing parentheses at the end: "(x+1" → "(x+1)".
  let depth = 0;
  let neg = false;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) { neg = true; break; }
    }
  }
  if (!neg && depth > 0) s += ")".repeat(depth);

  return normalizeMathInput(s);
}

/** Variable field: first identifier, trimmed; defaults to "x". Single capitals fold to lowercase. */
export function cleanVariable(raw: string, fallback = "x"): string {
  const t = normalizeSymbols(String(raw ?? "").replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)));
  const m = /[A-Za-z_][A-Za-z0-9_]*/.exec(t);
  if (!m) return fallback;
  const v = m[0];
  return v.length === 1 && /[A-Z]/.test(v) && v !== "E" ? v.toLowerCase() : v;
}

/** A numeric field (bound, approach value): accepts 1/2, pi/2, e, sqrt(2), -inf, ∞ … */
export function parseNumericInput(raw: string): number {
  const rawStr = String(raw ?? "");
  const compact = rawStr.replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, "").toLowerCase();
  if (/^[+\-−]?(inf|infinity|oo|∞)$/.test(compact)) return compact.startsWith("-") || compact.startsWith("−") ? -Infinity : Infinity;
  const cleaned = cleanExpression(rawStr);
  if (!cleaned) return NaN;
  try {
    const v = mathEvaluate(cleaned);
    return typeof v === "number" && Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}

/** Does `expr` mention `variable` as a whole identifier? */
export function mentionsVariable(expr: string, variable: string): boolean {
  const esc = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_])${esc}(?![A-Za-z0-9_])`).test(expr);
}

/** Words (3+ letters) written like a function call — name( — that are not a known function: foo(x), bar(x) … */
export function findUnknownFunctionNames(raw: string): string[] {
  const text = normalizeSymbols(String(raw ?? ""));
  const out = new Set<string>();
  const re = /([A-Za-z][A-Za-z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const lower = name.toLowerCase();
    if (name.length < 3 || /[\d_]/.test(name)) continue;
    if (CANON.has(lower) || CONST_WORDS[lower] || ["sinc", "heaviside", "step"].includes(lower)) continue;
    let hasKnownSuffix = false;
    for (let k = 1; k < lower.length; k++) if (CANON.has(lower.slice(k))) { hasKnownSuffix = true; break; }
    if (!hasKnownSuffix) out.add(name);
  }
  return [...out];
}
