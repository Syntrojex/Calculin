// Convert text math notation to pretty Unicode symbols
// e.g. x^2 → x², x^3 → x³, sqrt → √, etc.

const superscripts: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "n": "ⁿ", "x": "ˣ",
};

function toSuperscript(s: string): string {
  return s.split("").map(c => superscripts[c] || c).join("");
}

// Note on spacing: mathjs's node.toString() (used for every computed result
// and step in this app) always inserts spaces around binary operators, e.g.
// "3 * x ^ 2 + 4 * x - 5", not "3*x^2+4*x-5". Every regex below therefore
// tolerates optional whitespace around operators (\s*) so formatting works
// on both hand-typed input AND computed mathjs output — previously the
// exponent regexes required a bare "^2" with no space, so mathjs results
// silently skipped superscript conversion and showed the raw caret.

// Coefficient·variable multiplication (e.g. "3 * x") is rewritten as plain
// juxtaposition ("3x") to match standard math notation, instead of leaving
// a multiplication dot between a number and a variable.
function collapseImplicitMultiplication(text: string): string {
  // number * single-letter-variable  →  number+variable (e.g. "3 * x" → "3x")
  // The trailing \b(?!\() keeps this from matching the start of a function
  // name (sin, cos, log, ...) or a variable directly followed by "(".
  let result = text.replace(/(-?\d+(?:\.\d+)?)\s*\*\s*([a-zA-Z])\b(?!\()/g, "$1$2");
  // single-letter-variable * number  →  rewritten as "number+variable" so it
  // still reads as the conventional "3x" form (e.g. "x * 3" → "3x")
  result = result.replace(/\b([a-zA-Z])\b(?!\()\s*\*\s*(-?\d+(?:\.\d+)?)/g, "$2$1");
  return result;
}

// Remaining "*" (variable×variable, function×anything, number×number, etc.)
// renders as a tight middle-dot with no surrounding spaces.
function collapseRemainingMultiplication(text: string): string {
  return text.replace(/\s*\*\s*/g, "·");
}

export function formatMath(text: string): string {
  let result = text;

  result = collapseImplicitMultiplication(result);

  // x^(expr) → xᵉˣᵖʳ for cases like ^2, ^3, ^(-1), ^(n+1) — tolerate spaces
  // on both sides of ^ since mathjs output is "x ^ (n + 1)" style (the base
  // and the caret must stay glued together, so the space before ^ is
  // dropped rather than converted).
  result = result.replace(/\s*\^\s*\(([^)]+)\)/g, (_m, inner) => toSuperscript(inner));

  // x^n where n is digits or a single letter (spaces around ^ tolerated)
  result = result.replace(/\s*\^\s*([0-9]+)/g, (_m, exp) => toSuperscript(exp));
  result = result.replace(/\s*\^\s*([a-z])/gi, (_m, exp) => toSuperscript(exp));

  // sqrt(...) → √(...)
  result = result.replace(/sqrt\(/g, "√(");

  // pi → π
  result = result.replace(/\bpi\b/gi, "π");

  result = collapseRemainingMultiplication(result);

  return result;
}

// Convert text math to HTML with proper <sup> tags for exponents
// e.g. x^2 → x<sup>2</sup>, x^(n+1) → x<sup>n+1</sup>
export function formatMathHTML(text: string): string {
  // Escape HTML special chars first (except we'll add our own tags)
  let result = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  result = collapseImplicitMultiplication(result);

  // x^(expr) → x<sup>expr</sup>  e.g. x^(-1), x^(n+1) — spaces around ^
  // tolerated, and the space before ^ is dropped so "x ^ 2" glues to
  // "x<sup>2</sup>" instead of leaving a stray gap.
  result = result.replace(/\s*\^\s*\(([^)]+)\)/g, (_m, inner) => `<sup>${inner}</sup>`);

  // x^digits → x<sup>digits</sup>  e.g. x^2, x^12
  result = result.replace(/\s*\^\s*([0-9]+)/g, (_m, exp) => `<sup>${exp}</sup>`);

  // x^letter → x<sup>letter</sup>  e.g. x^n
  result = result.replace(/\s*\^\s*([a-zA-Z])/g, (_m, exp) => `<sup>${exp}</sup>`);

  // sqrt(...) → √(...)
  result = result.replace(/sqrt\(/g, "√(");

  // pi → π
  result = result.replace(/\bpi\b/gi, "π");

  result = collapseRemainingMultiplication(result);

  return result;
}
