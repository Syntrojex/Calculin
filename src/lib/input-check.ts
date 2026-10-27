/**
 * One place that looks at what the person TYPED and, if it is broken, says
 * exactly what is wrong and where — instead of quietly "fixing" it
 * (x^----33 → x^33, ((x) → x, sin( → 0) or leaking a parser message.
 *
 * It is deliberately conservative: it only rejects things that are never
 * meaningful maths. Implicit multiplication (2x, x(x+1)), |x|, x!, 50%, x mod 3,
 * sin²x, π, √ … all pass.
 */

export interface CheckOpts {
  /** What the field is called, used in "Please enter …" (default "an expression"). */
  what?: string;
  /** Commas / semicolons are allowed at top level (systems, parametric forms). Inside brackets they are always fine (log(x, 2)). */
  allowComma?: boolean;
  /** < > ≤ ≥ are allowed (inequalities). */
  allowRelation?: boolean;
  /** The value must be a real number when it has no variables (bounds, scalars, limit points). */
  requireRealConstant?: boolean;
}

const FUNCTION_WORDS =
  "arcsin|arccos|arctan|arccot|arcsec|arccsc|asin|acos|atan|acot|asec|acsc|sinh|cosh|tanh|coth|sech|csch|asinh|acosh|atanh|sin|cos|tan|cot|sec|csc|log10|log2|log|ln|exp|sqrt|cbrt|abs|floor|ceil|round|sign|sgn|gamma|erf|nthroot|fix|sinc|heaviside|step";

const snippet = (s: string, at: number, len = 1) => {
  const a = Math.max(0, at - 8), b = Math.min(s.length, at + len + 8);
  return `${a > 0 ? "…" : ""}${s.slice(a, b)}${b < s.length ? "…" : ""}`;
};

export function checkExpression(raw: string, o: CheckOpts = {}): string | null {
  const what = o.what ?? "an expression";
  if (raw == null || !String(raw).trim()) return `Please enter ${what}.`;
  const s0 = String(raw);
  // normalise look-alikes the app already understands, keep positions roughly stable
  const s = s0.replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^").trim();

  // 1 ── characters that can never be maths
  const bad = s.match(/[^\s0-9A-Za-z+\-*/^().,;!=|%_'"√∛∜·×÷−∞πθΘαβγΓδΔλμρΣσφΦωΩ⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺[\]{}<>≤≥≠]/);
  if (bad) return `The character “${bad[0]}” can't be used in a math expression.`;
  if (!o.allowRelation && /[<>≤≥]/.test(s)) return "Inequality signs (< >) can't be used here — this field takes a plain expression.";

  // 2 ── brackets: matching, crossing, empty
  const stack: { ch: string; at: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ("([{".includes(ch)) stack.push({ ch, at: i });
    else if (")]}".includes(ch)) {
      const top = stack.pop();
      if (!top) return `There is an extra closing “${ch}” with no matching opening bracket (near “${snippet(s, i)}”).`;
      if (top.ch !== pairs[ch]) return `Brackets don't match: “${top.ch}” is closed by “${ch}” (near “${snippet(s, i)}”).`;
    }
  }
  if (stack.length) {
    const closers = stack.map((t) => ({ "(": ")", "[": "]", "{": "}" }[t.ch])).reverse().join(" ");
    return `Missing closing bracket${stack.length > 1 ? "s" : ""} “${closers}” — ${stack.length > 1 ? `${stack.length} brackets are` : "a bracket is"} still open (opened near “${snippet(s, stack[0].at)}”).`;
  }
  const bars = (s.match(/\|/g) ?? []).length;
  if (bars % 2 === 1) return "An absolute-value bar “|” is not closed — bars come in pairs, like |x − 1|.";
  const emptyFn = s.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)/);
  if (emptyFn) return `“${emptyFn[1]}( )” has nothing inside the brackets — write the argument, e.g. ${/^(sin|cos|tan|ln|log|sqrt|exp|abs)$/i.test(emptyFn[1]) ? `${emptyFn[1]}(x)` : `${emptyFn[1]}(x)`}.`;
  if (/\(\s*\)/.test(s)) return "There are empty brackets “( )” — put something inside them.";
  if (/\(\s*[,;]|[,;]\s*\)/.test(s)) return "A comma inside brackets has nothing before or after it — e.g. log(x, 2) needs both parts.";

  // 3 ── signs and operators
  const signRun = s.match(/[+\-]\s*[+\-]\s*[+\-]+/);
  if (signRun) return `Too many signs in a row (“${signRun[0].replace(/\s+/g, "")}”) — keep at most two (like 5 + -3), or tell me what you meant, e.g. x^33 or x^(-33).`;
  if (/\^\s*\^/.test(s)) return "Two “^” in a row — write x^(a^b) with brackets, or just one ^.";
  const opPair = s.match(/([*/^])\s*([*/])|([+\-])\s*([*/^])/);
  if (opPair) return `Two operators in a row (“${opPair[0].replace(/\s+/g, "")}”) near “${snippet(s, s.indexOf(opPair[0]), opPair[0].length)}” — something is missing between them.`;
  const afterOpen = s.match(/\(\s*([*/^])/);
  if (afterOpen) return `An opening bracket can't be followed by “${afterOpen[1]}” (near “${snippet(s, s.indexOf(afterOpen[0]), afterOpen[0].length)}”).`;
  const beforeClose = s.match(/([+\-*/^])\s*\)/);
  if (beforeClose) return `“${beforeClose[1]}” is followed by a closing bracket — the number or variable after it is missing (near “${snippet(s, s.indexOf(beforeClose[0]), beforeClose[0].length)}”).`;
  if (/^\s*[*/^!%,;)\]}]/.test(s)) return `An expression can't start with “${s.trim()[0]}”.`;
  const tail = s.match(/([+\-*/^=(,;])\s*$/);
  if (tail) return `The expression ends with “${tail[1]}” — something is missing after it.`;
  if (/=\s*=/.test(s) || /[<>]\s*[<>]/.test(s.replace(/[<>]=/g, "<"))) {
    if (!o.allowRelation || /=\s*=/.test(s)) return "Two comparison signs in a row (“==”, “<<” …) — use a single one.";
  }

  // 4 ── numbers
  const badNum = s.match(/\d*\.\d*\.\d*|\.\./);
  if (badNum) return `“${badNum[0]}” isn't a valid number — a number can have only one decimal point.`;
  if (/(^|[^\d])\.(?![\d])/.test(s)) return "A lone decimal point “.” isn't a number — write 0.5 or .5.";
  const twoNums = s.match(/\d(?:\.\d+)?\s+\d/);
  if (twoNums) return `Two numbers sit next to each other (“${twoNums[0]}”) — put an operator between them, e.g. ${twoNums[0].replace(/\s+/, " + ")}.`;
  if (/\d{310,}|\d[eE][+]?\d{3,}/.test(s)) return "That number is too large to work with (it exceeds about 1e308).";

  // 5 ── function names
  const bare = s.match(new RegExp(`(?<![A-Za-z_])(${FUNCTION_WORDS})(?![A-Za-z0-9_(^⁻²³])\\s*(?=$|[+\\-*/)\\],;=<>])`, "i"));
  if (bare) return `“${bare[1]}” needs something to work on — write it like ${bare[1]}(x).`;

  // 6 ── commas / semicolons at top level
  if (!o.allowComma) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
      else if ((ch === "," || ch === ";") && depth === 0) return `A stray “${ch}” — commas only belong inside function brackets like log(x, 2). For a decimal use a dot (0.5).`;
    }
  }

  // 7 ── division by a literal zero
  const div0 = s.match(/[/]\s*\(?\s*0+(?:\.0*)?\s*\)?(?![\d.A-Za-z(])/);
  if (div0) return `Division by zero (“${div0[0].replace(/\s+/g, "")}”) is undefined.`;

  return null;
}

/** For single numeric fields (bounds, scalars, limit points): empty / not a number / not real → a specific message. */
export function checkNumberField(raw: string, label: string, evaluate: (s: string) => unknown, opts: { allowInfinity?: boolean } = {}): { value?: number; error?: string } {
  const t = (raw ?? "").trim();
  if (!t) return { error: `Please enter ${label}.` };
  const low = t.toLowerCase().replace(/\s+/g, "");
  if (opts.allowInfinity) {
    if (["inf", "+inf", "infinity", "+infinity", "∞", "+∞"].includes(low)) return { value: Infinity };
    if (["-inf", "-infinity", "-∞"].includes(low)) return { value: -Infinity };
  }
  const msg = checkExpression(t, { what: label });
  if (msg) return { error: `${label[0].toUpperCase()}${label.slice(1)}: ${msg}` };
  let v: unknown;
  const L = label[0].toUpperCase() + label.slice(1);
  try { v = evaluate(t); } catch { return { error: `${L}: “${t}” isn't a number — use digits like 3, -2.5, or an expression like 1/2, sqrt(2), pi.` }; }
  if (typeof v === "object" && v !== null && "im" in (v as object)) return { error: `${L}: “${t}” isn't a real number — it involves the square root or log of a negative number (a complex value).` };
  if (typeof v !== "number") return { error: `${L}: “${t}” isn't a real number${/[A-Za-z]/.test(t.replace(/\b(pi|e|sqrt|cbrt|sin|cos|tan|asin|acos|atan|ln|log|abs|exp|floor|ceil|round)\b/gi, "")) ? " — it contains letters; use digits, or the constants pi and e." : "."}` };
  if (Number.isNaN(v)) return { error: `${L}: “${t}” isn't defined (for example 0/0).` };
  if (!Number.isFinite(v)) return { error: `${L}: “${t}” is infinite — ${opts.allowInfinity ? "type inf or -inf for infinity" : "use a finite number"}.` };
  return { value: v };
}

const RESERVED_NAMES = new Set(["e", "pi", "i", "tau", ...FUNCTION_WORDS.split("|")]);

/** The "variable" field: one name like x, y, t, theta — not empty, not a number, not a function or constant. */
export function checkVariableName(raw: string, label = "variable"): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return `Please enter the ${label} (a single letter such as x).`;
  if (!/^[A-Za-z_\u0370-\u03FF][A-Za-z0-9_\u0370-\u03FF]*$/.test(t)) return `“${t}” can't be used as the ${label} — use a single letter such as x, y or t (no digits or symbols at the start, no spaces).`;
  if (RESERVED_NAMES.has(t.toLowerCase()) && t !== "π") return `“${t}” is a ${/^(e|pi|i|tau)$/i.test(t) ? "constant" : "function name"}, so it can't be the ${label} — use a letter such as x.`;
  return null;
}
