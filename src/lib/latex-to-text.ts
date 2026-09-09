/**
 * Converts a LaTeX string (as authored in formula-sheet-data.ts) into a
 * clean, readable plain-text approximation, for drawing directly with
 * jsPDF's text API — no DOM screenshot involved. This trades true typeset
 * fractions/exponents for guaranteed reliability: the previous html2canvas
 * approach tried to screenshot dozens of fully-rendered KaTeX formulas in
 * one pass and could hang the tab on slower devices.
 */
export function latexToPlainText(input: string): string {
  let s = input;

  // \begin{bmatrix}a&b\\c&d\end{bmatrix} -> [a b; c d] — do this once up
  // front since its \\ row-separator would otherwise collide with the
  // "\\," etc. spacing-command cleanup later.
  s = s.replace(/\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/g, (_m, body: string) => {
    const rows = body.split("\\\\").map((r) => r.trim().split("&").map((c) => c.trim()).join(" "));
    return `[${rows.join(" ; ")}]`;
  });

  // All the brace-consuming conversions run together as ONE fixed-point
  // loop (not a fixed number of separate passes): \frac, \sqrt, \text,
  // \operatorname, \overline and \lim_{...} can each nest inside any of the
  // others in either direction (a \lim inside a \frac's numerator, a \text
  // inside a \frac's denominator, a \frac inside a \sqrt, ...). Each of
  // these regexes requires "no braces inside" ([^{}]*) so it can only
  // resolve the INNERMOST occurrence on a given pass — nesting one level
  // deeper just means running the same set of substitutions again once the
  // inner one has already been flattened to plain parens/text.
  for (let i = 0; i < 8; i++) {
    const before = s;
    s = s.replace(/\\lim_\{([^{}]*)\}/g, (_m, sub: string) => `lim(${sub.replace(/\\to/g, "→")})`);
    s = s.replace(/\\text\{([^{}]*)\}/g, "$1");
    s = s.replace(/\\operatorname\{([^{}]*)\}/g, "$1");
    s = s.replace(/\\overline\{([^{}]*)\}/g, "conj($1)");
    s = s.replace(/\\sqrt\[([^\]]+)\]\{([^{}]*)\}/g, "$1√($2)");
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
    // Superscript/subscript brace groups also need resolving inside this
    // same loop (not just once afterward) — e.g. \frac{x^{n+1}}{n+1}'s
    // numerator "x^{n+1}" still contains braces from the exponent until
    // this runs, which would otherwise block \frac's own "no braces
    // inside" match from ever succeeding.
    s = s.replace(/\^\{([^{}]*)\}/g, "^($1)");
    s = s.replace(/_\{([^{}]*)\}/g, "_$1");
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
    if (s === before) break;
  }

  // \left| ... \right| -> | ... |
  s = s.replace(/\\left\|/g, "|").replace(/\\right\|/g, "|");
  // \left( \right) \left[ \right] — just drop the sizing commands
  s = s.replace(/\\left/g, "").replace(/\\right/g, "");
  // Any bare (non-braced) superscript that's left, e.g. "x^2"
  s = s.replace(/\^(-?[0-9a-zA-Z])/g, "^$1");

  // Named symbols and operators. Using \b (word-boundary) after commands
  // like \int or \sum breaks the moment they're followed by a subscript
  // ("\int_a^b" — regex \b treats "_" as a word character, so there's no
  // boundary between "t" and "_", and \bint\b silently fails to match at
  // all) — a negative lookahead for "not another letter" avoids that trap
  // while still not matching accidentally inside a longer command name.
  // \cdots/\ldots/\dots are listed BEFORE \cdot deliberately: \cdot is a
  // literal string prefix of \cdots, so matching \cdot first would consume
  // just the first 5 characters of "\cdots" and leave a stray "s" behind.
  // Trig/log names (but NOT arcsin/arccos/arctan, which should stay glued
  // to "arc") get a LEADING space in their replacement: the LaTeX source
  // often has no explicit \, between a preceding variable and the command
  // (e.g. "\sec x\tan x"), where the backslash itself was the only implicit
  // separator — stripping it without adding a space back would glue them
  // into "sec xtan x". A final whitespace-collapse below cleans up any
  // resulting doubled spaces.
  const SYMBOLS: [RegExp, string][] = [
    [/\\cdots|\\ldots|\\dots/g, "..."],
    [/\\pm/g, "±"], [/\\mp/g, "∓"], [/\\times/g, "×"], [/\\cdot/g, "·"],
    [/\\div/g, "÷"], [/\\neq/g, "≠"], [/\\le(?![a-zA-Z])/g, "≤"], [/\\ge(?![a-zA-Z])/g, "≥"],
    [/\\approx/g, "≈"], [/\\infty/g, "∞"], [/\\pi(?![a-zA-Z])/g, "π"], [/\\theta(?![a-zA-Z])/g, "θ"],
    [/\\Rightarrow/g, "⇒"], [/\\iff(?![a-zA-Z])/g, "⟺"], [/\\in(?![a-zA-Z])/g, "∈"], [/\\mid(?![a-zA-Z])/g, "|"],
    [/\\bmod(?![a-zA-Z])/g, " mod "], [/\\int(?![a-zA-Z])/g, "∫"], [/\\sum(?![a-zA-Z])/g, "Σ"],
    [/\\dfrac/g, ""], [/\\!|\\,|\\;|\\ /g, " "],
    [/\\arcsin(?![a-zA-Z])/g, "arcsin"], [/\\arccos(?![a-zA-Z])/g, "arccos"], [/\\arctan(?![a-zA-Z])/g, "arctan"],
    [/\\sin(?![a-zA-Z])/g, " sin"], [/\\cos(?![a-zA-Z])/g, " cos"], [/\\tan(?![a-zA-Z])/g, " tan"], [/\\cot(?![a-zA-Z])/g, " cot"],
    [/\\sec(?![a-zA-Z])/g, " sec"], [/\\csc(?![a-zA-Z])/g, " csc"], [/\\ln(?![a-zA-Z])/g, " ln"], [/\\log(?![a-zA-Z])/g, " log"],
    [/\\gcd(?![a-zA-Z])/g, "gcd"], [/\\det(?![a-zA-Z])/g, "det"], [/\\quad|\\qquad/g, "   "],
  ];
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep);

  // Cleanup: leftover braces, backslashes, double spaces
  s = s.replace(/[{}]/g, "").replace(/\\/g, "").replace(/[ \t]+/g, " ").trim();

  return s;
}
