/**
 * Normalizes math text a person might paste in from Word, a PDF, a chat app,
 * etc. so mathjs (which only understands plain ASCII like x^2) can parse it,
 * instead of throwing a syntax error on things like x², √25, x×y, or π.
 *
 * This is intentionally conservative: plain ASCII input (the vast majority
 * of what people type by hand) passes through completely unchanged.
 */

const SUPERSCRIPT_DIGIT_MAP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁻": "-", "⁺": "+",
};

const GREEK_LETTER_MAP: Record<string, string> = {
  "θ": "theta", "Θ": "theta",
  "π": "pi", "Π": "pi",
  "α": "alpha", "β": "beta", "γ": "gamma", "Γ": "gamma",
  "δ": "delta", "Δ": "delta",
  "λ": "lambda", "μ": "mu", "σ": "sigma", "Σ": "sigma",
  "φ": "phi", "Φ": "phi", "ω": "omega", "Ω": "omega",
};

// Every function name this app's math language accepts. Typing "Cos(x)",
// "SIN(x)" or "Sqrt(9)" — which is what most people do when they capitalize
// the start of a line, or paste from a textbook — used to fail outright,
// since mathjs treats names case-sensitively and only knows the lowercase
// spellings. Each of these is folded back to its canonical lowercase form
// before parsing, but ONLY when it is immediately followed by "(", so a
// variable happening to be named C, S or E is never touched.
const FUNCTION_NAMES = [
  "sin", "cos", "tan", "sec", "csc", "cot",
  "asin", "acos", "atan", "asec", "acsc", "acot", "atan2",
  "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
  "sqrt", "cbrt", "nthRoot", "abs", "sign", "exp",
  "log", "log2", "log10", "log1p", "ln",
  "round", "floor", "ceil", "fix", "gcd", "lcm", "mod",
  "factorial", "gamma", "min", "max", "sum", "mean", "median",
  "det", "inv", "transpose", "norm", "re", "im", "arg", "conj",
];

const CANONICAL_FUNCTION_NAME = new Map(FUNCTION_NAMES.map((n) => [n.toLowerCase(), n]));

/** Cos( -> cos(, SQRT( -> sqrt(, NthRoot( -> nthRoot(  … */
function canonicalizeFunctionNames(s: string): string {
  return s.replace(/\b([A-Za-z][A-Za-z0-9]*)\s*(?=\()/g, (match, name: string) => {
    const canonical = CANONICAL_FUNCTION_NAME.get(name.toLowerCase());
    return canonical ?? match;
  });
}

// Names sorted longest-first, so at any given position the regex below tries
// "asin"/"atan2"/"acosh" etc. before a shorter prefix like "sin"/"tan"/"cos"
// could otherwise grab part of the name and misparse the rest — JS regex
// alternation picks the first alternative that matches, not the longest one.
const FUNCTION_NAMES_BY_LENGTH_DESC = [...FUNCTION_NAMES].sort((a, b) => b.length - a.length);
// A handful of named constants the argument may also spell out in full
// ("cospi" -> "cos(pi)"), on top of the usual single-letter/number case.
const IMPLICIT_ARG_WORDS = ["pi", "theta", "infinity", "inf"];
const IMPLICIT_CALL_RE = new RegExp(
  `(?<![a-zA-Z])(${FUNCTION_NAMES_BY_LENGTH_DESC.join("|")})(?!\\s*\\()(${IMPLICIT_ARG_WORDS.join("|")}|[0-9]+[a-zA-Z]?|[a-zA-Z])\\b`,
  "gi"
);

/**
 * Textbook shorthand like "sinx", "cos2x", "tan90" (a function name written
 * directly against its argument, no parentheses) used to fail outright —
 * mathjs only recognizes an explicit call, so it read the whole run as one
 * unparseable identifier. This adds the parentheses back in: "sinx" ->
 * "sin(x)", "cos2x" -> "cos(2x)". The argument is deliberately kept narrow
 * (optional leading digits plus a single trailing letter, or a single
 * letter, or bare digits) — enough for the common one-symbol-or-a-number
 * argument this shorthand is actually used for, without misreading a
 * multi-letter identifier that only happens to start with a function name
 * (e.g. a variable someone genuinely intended to call "cost" is left alone,
 * since "ost" is more than one trailing letter).
 */
function expandImplicitFunctionCalls(s: string): string {
  return s.replace(IMPLICIT_CALL_RE, (_match, name: string, arg: string) => {
    const canonical = CANONICAL_FUNCTION_NAME.get(name.toLowerCase()) ?? name.toLowerCase();
    return `${canonical}(${arg})`;
  });
}

// Constants people capitalize the same way. "PI" / "Pi" -> pi, "Theta" ->
// theta. Standalone words only, so "Pin" or a variable "Pi2" is left alone.
const CONSTANT_ALIASES: Record<string, string> = {
  pi: "pi", theta: "theta", infinity: "Infinity", inf: "Infinity",
};

function canonicalizeConstants(s: string): string {
  return s.replace(/\b([A-Za-z]{2,})\b(?!\s*\()/g, (match, word: string) => {
    const canonical = CONSTANT_ALIASES[word.toLowerCase()];
    return canonical ?? match;
  });
}

export function normalizeMathInput(input: string): string {
  if (!input) return input;
  let s = input;

  // Case-folding first: everything downstream (the ln rewrite, sqrt handling,
  // mathjs itself) expects canonical lowercase function names.
  s = canonicalizeFunctionNames(s);
  // "sinx", "cos2x", "tan90" -> "sin(x)", "cos(2x)", "tan(90)" — must run
  // before canonicalizeConstants below, so a split like "cospi" -> "cos(pi)"
  // still gets its argument constant-cased correctly afterward.
  s = expandImplicitFunctionCalls(s);
  s = canonicalizeConstants(s);

  // mathjs has no built-in "ln" function — its single-argument log(x) IS the
  // natural logarithm. Without this rewrite, typing "ln(x)" anywhere (derivative,
  // integral, graphing, keypad) throws "Cannot process function ln" the moment
  // mathjs tries to differentiate/evaluate it, even though it parses fine at
  // first glance. Rewriting ln(...) -> log(...) up front means every solver,
  // not just one, gets natural-log support for free. The UI still *displays*
  // "log" as "ln" (see formatMath/formatMathHTML) so nothing user-facing changes.
  s = s.replace(/\bln\s*\(/gi, "log(");

  // Multiplication / division / minus symbols people paste from Word/PDF.
  s = s.replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/−/g, "-");

  // Common Greek letters used as variable/constant names.
  s = s.replace(/[θΘπΠαβγΓδΔλμσΣφΦωΩ]/g, (ch) => GREEK_LETTER_MAP[ch] ?? ch);

  // √25, √x -> sqrt(25), sqrt(x). Equations already written as √(...) are
  // left alone since "(" immediately follows the swapped-in "sqrt".
  s = s.replace(/√/g, "sqrt");
  s = s.replace(/sqrt(?!\()\s*([a-zA-Z0-9.]+)/g, "sqrt($1)");

  // Collapse a run of superscript characters (x¹² -> x^12, x⁻¹ -> x^-1)
  // into a single "^" so multi-digit exponents don't split into x^1^2.
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (run) => {
    const digits = run
      .split("")
      .map((ch) => SUPERSCRIPT_DIGIT_MAP[ch] ?? "")
      .join("");
    return `^${digits}`;
  });

  return s;
}
