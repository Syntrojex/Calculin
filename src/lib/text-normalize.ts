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

export function normalizeMathInput(input: string): string {
  if (!input) return input;
  let s = input;

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
