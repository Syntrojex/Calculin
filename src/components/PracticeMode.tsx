import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { derivative, parse } from "mathjs";
import { MathText } from "./MathText";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { GraduationCap, CheckCircle2, XCircle, RefreshCw, Eye, Trophy } from "lucide-react";

type Category = "derivative" | "integral" | "linear" | "quadratic" | "word";
type Difficulty = "easy" | "medium" | "hard";

interface Problem {
  category: Category;
  prompt: string;
  correctAnswer: string;
  steps: string[];
  hint?: string;
  check: (input: string) => boolean;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randNonZero(min: number, max: number): number {
  let n = 0;
  do { n = randInt(min, max); } while (n === 0);
  return n;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function parseNumberAnswer(input: string): number | null {
  try {
    const v = parse(input.trim()).evaluate();
    return typeof v === "number" && isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function numericallyClose(a: number, b: number, tol = 1e-2): boolean {
  return Math.abs(a - b) <= Math.max(tol, Math.abs(b) * tol);
}

function signed(n: number): string {
  return n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`;
}

// ── Derivative problems ───────────────────────────────────────────────────────
function genDerivativePoly(diff: Difficulty): Problem {
  const range = diff === "easy" ? 5 : diff === "medium" ? 9 : 14;
  const a = randNonZero(-range, range);
  const b = randNonZero(-range, range);
  const c = diff === "easy" ? 0 : randInt(-range, range);
  const n1 = diff === "hard" ? randInt(2, 4) : randInt(2, 3);
  const exprStr = c !== 0 ? `${a}*x^${n1} ${signed(b)}*x ${signed(c)}` : `${a}*x^${n1} ${signed(b)}*x`;
  const cleanExpr = exprStr.replace(/\+ -/g, "- ");

  return {
    category: "derivative",
    prompt: `Find f'(x) for f(x) = ${cleanExpr}`,
    correctAnswer: derivative(cleanExpr.replace(/\s/g, ""), "x").toString(),
    hint: "Use the power rule on each term: d/dx[xⁿ] = n·xⁿ⁻¹",
    steps: [
      `f(x) = ${cleanExpr}`,
      `Apply the power rule to each term: d/dx[k·xⁿ] = k·n·xⁿ⁻¹`,
      `d/dx[${a}x^${n1}] = ${a * n1}x^${n1 - 1}`,
      `d/dx[${b}x] = ${b}`,
      c !== 0 ? `d/dx[${c}] = 0  (constant term)` : `(no constant term)`,
      `f'(x) = ${derivative(cleanExpr.replace(/\s/g, ""), "x").toString()}`,
    ],
    check: (input: string) => {
      try {
        const trueFn = derivative(cleanExpr.replace(/\s/g, ""), "x").compile();
        const userFn = parse(input).compile();
        const pts = [0.6, 1.4, -0.9, 2.2, -1.7];
        return pts.every((x) => {
          const a2 = trueFn.evaluate({ x });
          const b2 = userFn.evaluate({ x });
          return typeof a2 === "number" && typeof b2 === "number" && numericallyClose(a2, b2);
        });
      } catch {
        return false;
      }
    },
  };
}

function genDerivativeTrig(diff: Difficulty): Problem {
  const a = randNonZero(diff === "easy" ? -3 : -6, diff === "easy" ? 3 : 6);
  const b = diff === "hard" ? randNonZero(2, 4) : 1;
  const fn = pick(["sin", "cos"] as const);
  const inner = b === 1 ? "x" : `${b}x`;
  const exprStr = `${a}*${fn}(${inner})`;
  const trueAnswer = derivative(exprStr, "x").toString();

  return {
    category: "derivative",
    prompt: `Find f'(x) for f(x) = ${exprStr.replace("*", "·")}`,
    correctAnswer: trueAnswer,
    hint: fn === "sin" ? "d/dx[sin(u)] = cos(u)·u'  (chain rule)" : "d/dx[cos(u)] = -sin(u)·u'  (chain rule)",
    steps: [
      `f(x) = ${a}·${fn}(${inner})`,
      `Chain rule: d/dx[${fn}(${inner})] = ${fn === "sin" ? "cos" : "-sin"}(${inner}) · ${b}`,
      `f'(x) = ${a} · ${b} · ${fn === "sin" ? "cos" : "-sin"}(${inner})`,
      `f'(x) = ${trueAnswer}`,
    ],
    check: (input: string) => {
      try {
        const trueFn = derivative(exprStr, "x").compile();
        const userFn = parse(input).compile();
        const pts = [0.4, 1.1, -0.7, 2.0];
        return pts.every((x) => {
          const a2 = trueFn.evaluate({ x });
          const b2 = userFn.evaluate({ x });
          return typeof a2 === "number" && typeof b2 === "number" && numericallyClose(a2, b2);
        });
      } catch {
        return false;
      }
    },
  };
}

function genDerivativeExp(diff: Difficulty): Problem {
  const a = randNonZero(-5, 5);
  const b = diff === "hard" ? randNonZero(2, 3) : 1;
  const inner = b === 1 ? "x" : `${b}x`;
  const exprStr = `${a}*exp(${inner})`;
  const trueAnswer = derivative(exprStr, "x").toString();

  return {
    category: "derivative",
    prompt: `Find f'(x) for f(x) = ${a}·e^(${inner})`,
    correctAnswer: trueAnswer,
    hint: "d/dx[e^u] = e^u · u'  (chain rule)",
    steps: [
      `f(x) = ${a}·e^(${inner})`,
      `Chain rule: d/dx[e^u] = e^u · u'`,
      `f'(x) = ${a} · ${b} · e^(${inner})`,
      `f'(x) = ${trueAnswer}`,
    ],
    check: (input: string) => {
      try {
        const trueFn = derivative(exprStr, "x").compile();
        const userFn = parse(input).compile();
        const pts = [0.3, 0.8, -0.5, 1.2];
        return pts.every((x) => {
          const a2 = trueFn.evaluate({ x });
          const b2 = userFn.evaluate({ x });
          return typeof a2 === "number" && typeof b2 === "number" && numericallyClose(a2, b2);
        });
      } catch {
        return false;
      }
    },
  };
}

function genDerivative(diff: Difficulty): Problem {
  if (diff === "easy") return genDerivativePoly(diff);
  const generators = diff === "medium" ? [genDerivativePoly, genDerivativeTrig] : [genDerivativePoly, genDerivativeTrig, genDerivativeExp];
  return pick(generators)(diff);
}

// ── Integral problems ─────────────────────────────────────────────────────────
function genIntegralPower(diff: Difficulty): Problem {
  const range = diff === "easy" ? 5 : diff === "medium" ? 8 : 12;
  const a = randNonZero(-range, range);
  const n1 = randInt(1, diff === "easy" ? 2 : 3);
  const exprStr = `${a}*x^${n1}`;
  const antideriv = `${a}*x^${n1 + 1}/${n1 + 1}`;

  return {
    category: "integral",
    prompt: `Find ∫ (${a}x^${n1}) dx  (any constant C is fine)`,
    correctAnswer: `${antideriv} + C`,
    hint: "Power rule: ∫xⁿdx = xⁿ⁺¹/(n+1)",
    steps: [
      `∫ ${a}x^${n1} dx`,
      `Power Rule: ∫k·xⁿ dx = k·xⁿ⁺¹/(n+1)`,
      `= ${a}·x^${n1 + 1}/${n1 + 1} + C`,
      `= ${antideriv} + C`,
    ],
    check: (input: string) => {
      try {
        const fFn = parse(exprStr).compile();
        const cleaned = input.replace(/\+\s*C\b/i, "").trim() || "0";
        const FDeriv = derivative(parse(cleaned), "x").compile();
        const pts = [0.5, 1.3, -0.8, 2.1];
        return pts.every((x) => {
          const fv = fFn.evaluate({ x });
          const Fdv = FDeriv.evaluate({ x });
          return typeof fv === "number" && typeof Fdv === "number" && numericallyClose(fv, Fdv);
        });
      } catch {
        return false;
      }
    },
  };
}

function genIntegralTrig(diff: Difficulty): Problem {
  const a = randNonZero(-6, 6);
  const b = diff === "hard" ? randNonZero(2, 3) : 1;
  const fn = pick(["sin", "cos"] as const);
  const inner = b === 1 ? "x" : `${b}x`;
  const exprStr = `${a}*${fn}(${inner})`;
  const antideriv = fn === "sin" ? `${-a}/${b}*cos(${inner})` : `${a}/${b}*sin(${inner})`;

  return {
    category: "integral",
    prompt: `Find ∫ (${a}·${fn}(${inner})) dx  (any constant C is fine)`,
    correctAnswer: `${antideriv} + C`,
    hint: fn === "sin" ? "∫sin(u)du = -cos(u)/u'" : "∫cos(u)du = sin(u)/u'",
    steps: [
      `∫ ${a}·${fn}(${inner}) dx,  let u = ${inner}, du = ${b} dx`,
      fn === "sin" ? `∫sin(u) du = -cos(u)` : `∫cos(u) du = sin(u)`,
      `Divide by ${b} for the substitution: ${antideriv}`,
      `Result = ${antideriv} + C`,
    ],
    check: (input: string) => {
      try {
        const fFn = parse(exprStr).compile();
        const cleaned = input.replace(/\+\s*C\b/i, "").trim() || "0";
        const FDeriv = derivative(parse(cleaned), "x").compile();
        const pts = [0.4, 1.0, -0.6, 1.8];
        return pts.every((x) => {
          const fv = fFn.evaluate({ x });
          const Fdv = FDeriv.evaluate({ x });
          return typeof fv === "number" && typeof Fdv === "number" && numericallyClose(fv, Fdv);
        });
      } catch {
        return false;
      }
    },
  };
}

function genIntegralExp(diff: Difficulty): Problem {
  const a = randNonZero(-5, 5);
  const b = diff === "hard" ? randNonZero(2, 3) : 1;
  const inner = b === 1 ? "x" : `${b}x`;
  const exprStr = `${a}*exp(${inner})`;
  const antideriv = `${a}/${b}*exp(${inner})`;

  return {
    category: "integral",
    prompt: `Find ∫ (${a}·e^(${inner})) dx  (any constant C is fine)`,
    correctAnswer: `${antideriv} + C`,
    hint: "∫e^u du = e^u / u'",
    steps: [
      `∫ ${a}·e^(${inner}) dx,  let u = ${inner}, du = ${b} dx`,
      `∫e^u du = e^u`,
      `Divide by ${b}: ${antideriv}`,
      `Result = ${antideriv} + C`,
    ],
    check: (input: string) => {
      try {
        const fFn = parse(exprStr).compile();
        const cleaned = input.replace(/\+\s*C\b/i, "").trim() || "0";
        const FDeriv = derivative(parse(cleaned), "x").compile();
        const pts = [0.3, 0.7, -0.4, 1.1];
        return pts.every((x) => {
          const fv = fFn.evaluate({ x });
          const Fdv = FDeriv.evaluate({ x });
          return typeof fv === "number" && typeof Fdv === "number" && numericallyClose(fv, Fdv);
        });
      } catch {
        return false;
      }
    },
  };
}

function genIntegralPolySum(diff: Difficulty): Problem {
  const range = diff === "hard" ? 10 : 6;
  const a = randNonZero(-range, range);
  const n1 = randInt(2, 3);
  const b = randNonZero(-range, range);
  const exprStr = `${a}*x^${n1} ${signed(b)}*x`.replace(/\+ -/g, "- ");
  const antideriv = `${a}*x^${n1 + 1}/${n1 + 1} ${signed(b)}*x^2/2`.replace(/\+ -/g, "- ");

  return {
    category: "integral",
    prompt: `Find ∫ (${exprStr}) dx  (any constant C is fine)`,
    correctAnswer: `${antideriv} + C`,
    hint: "Integrate term by term using the power rule (sum rule).",
    steps: [
      `∫ (${exprStr}) dx`,
      `Sum Rule: integrate each term separately`,
      `∫ ${a}x^${n1} dx = ${a}x^${n1 + 1}/${n1 + 1}`,
      `∫ ${b}x dx = ${b}x²/2`,
      `Result = ${antideriv} + C`,
    ],
    check: (input: string) => {
      try {
        const fFn = parse(exprStr).compile();
        const cleaned = input.replace(/\+\s*C\b/i, "").trim() || "0";
        const FDeriv = derivative(parse(cleaned), "x").compile();
        const pts = [0.5, 1.2, -0.7, 1.9];
        return pts.every((x) => {
          const fv = fFn.evaluate({ x });
          const Fdv = FDeriv.evaluate({ x });
          return typeof fv === "number" && typeof Fdv === "number" && numericallyClose(fv, Fdv);
        });
      } catch {
        return false;
      }
    },
  };
}

function genIntegral(diff: Difficulty): Problem {
  if (diff === "easy") return pick([genIntegralPower, genIntegralTrig])(diff);
  if (diff === "medium") return pick([genIntegralPower, genIntegralTrig, genIntegralExp, genIntegralPolySum])(diff);
  return pick([genIntegralTrig, genIntegralExp, genIntegralPolySum])(diff);
}

// ── Linear equations ──────────────────────────────────────────────────────────
function genLinear(diff: Difficulty): Problem {
  const range = diff === "easy" ? 10 : diff === "medium" ? 20 : 40;
  const a = randNonZero(-9, 9);
  const x0 = randInt(-range, range);
  const b = randInt(-range, range);
  const c = a * x0 + b;
  const rhsHasX = diff !== "easy";
  const d = rhsHasX ? randNonZero(-5, 5) : 0;

  const lhs = `${a}x ${signed(b)}`;
  const rhs = rhsHasX ? `${d}x ${signed(c - d * x0)}` : `${c}`;

  return {
    category: "linear",
    prompt: `Solve for x: ${lhs} = ${rhs}`,
    correctAnswer: x0.toString(),
    hint: "Collect x-terms on one side, constants on the other.",
    steps: rhsHasX ? [
      `${lhs} = ${rhs}`,
      `Move x-terms to one side: ${a - d}x = ${signed(c - d * x0 - b)}`.replace("= +", "="),
      `${a}x - ${d}x = ${c - d * x0} - ${b}`,
      `${a - d}x = ${c - d * x0 - b}`,
      `x = ${c - d * x0 - b} / ${a - d} = ${x0}`,
    ] : [
      `${lhs} = ${rhs}`,
      `Subtract ${b} from both sides: ${a}x = ${c - b}`,
      `Divide both sides by ${a}: x = ${c - b}/${a}`,
      `x = ${x0}`,
    ],
    check: (input: string) => {
      const v = parseNumberAnswer(input);
      return v !== null && numericallyClose(v, x0, 1e-4);
    },
  };
}

// ── Quadratic equations (nice integer roots) ─────────────────────────────────
function genQuadratic(diff: Difficulty): Problem {
  const range = diff === "easy" ? 6 : diff === "medium" ? 10 : 15;
  const p = randNonZero(-range, range);
  const q = randNonZero(-range, range);
  const leading = diff === "hard" ? pick([1, 1, 2, 3]) : 1;
  const b = -leading * (p + q);
  const c = leading * p * q;
  const aTerm = leading === 1 ? "x^2" : `${leading}x^2`;
  const eq = `${aTerm} ${signed(b)}x ${signed(c)} = 0`;

  return {
    category: "quadratic",
    prompt: `Solve: ${eq}`,
    correctAnswer: `x = ${p}, x = ${q}`,
    hint: leading === 1 ? "Try factoring into (x - p)(x - q) = 0." : "Use the quadratic formula: x = (-b ± √(b²-4ac)) / 2a",
    steps: [
      `${eq}`,
      `a = ${leading}, b = ${b}, c = ${c}`,
      `Discriminant: D = b² - 4ac = ${b * b - 4 * leading * c}`,
      `x = (-(${b}) ± √${b * b - 4 * leading * c}) / ${2 * leading}`,
      `x = ${p}  or  x = ${q}`,
    ],
    check: (input: string) => {
      const nums = input
        .split(/[,;\s]+/)
        .map((s) => s.replace(/^x\s*=\s*/i, ""))
        .map((s) => parseNumberAnswer(s))
        .filter((v): v is number => v !== null);
      if (nums.length < 2) return false;
      const hasP = nums.some((v) => numericallyClose(v, p, 1e-4));
      const hasQ = nums.some((v) => numericallyClose(v, q, 1e-4));
      return hasP && hasQ;
    },
  };
}

// ── Word problems ─────────────────────────────────────────────────────────────
const WORD_TEMPLATES: ((diff: Difficulty) => Problem)[] = [
  (diff) => {
    const range = diff === "easy" ? 20 : 50;
    const l = randInt(3, range), w = randInt(3, range);
    return {
      category: "word",
      prompt: `A rectangular garden is ${l} m long and ${w} m wide. What is its area in square meters?`,
      correctAnswer: `${l * w}`,
      hint: "Area of a rectangle = length × width",
      steps: [`Area = length × width`, `Area = ${l} × ${w}`, `Area = ${l * w} m²`],
      check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, l * w, 1e-3); },
    };
  },
  (diff) => {
    const v = randInt(diff === "easy" ? 20 : 40, 120);
    const t = randInt(1, diff === "easy" ? 5 : 10);
    return {
      category: "word",
      prompt: `A car travels at a constant speed of ${v} km/h for ${t} hours. How far does it travel, in km?`,
      correctAnswer: `${v * t}`,
      hint: "Distance = speed × time",
      steps: [`Distance = speed × time`, `Distance = ${v} × ${t}`, `Distance = ${v * t} km`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, v * t, 1e-3); },
    };
  },
  (diff) => {
    const s = randInt(20, diff === "easy" ? 60 : 150);
    const d = randInt(2, Math.floor(s / 2) - 1 || 1);
    const larger = (s + d) / 2;
    return {
      category: "word",
      prompt: `The sum of two numbers is ${s} and their difference is ${d}. What is the larger number?`,
      correctAnswer: `${larger}`,
      hint: "larger = (sum + difference) / 2",
      steps: [`Let the numbers be a and b, with a + b = ${s} and a - b = ${d}`, `Adding both equations: 2a = ${s + d}`, `a = ${larger}`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, larger, 1e-3); },
    };
  },
  (diff) => {
    const p = randInt(diff === "easy" ? 100 : 500, 5000);
    const r = randInt(2, 10);
    const t = randInt(1, 5);
    const interest = (p * r * t) / 100;
    return {
      category: "word",
      prompt: `You invest $${p} at a simple interest rate of ${r}% per year. How much interest do you earn after ${t} years (in $)?`,
      correctAnswer: `${interest}`,
      hint: "Simple Interest = Principal × Rate × Time / 100",
      steps: [`SI = P × R × T / 100`, `SI = ${p} × ${r} × ${t} / 100`, `SI = $${interest}`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, interest, 1e-2); },
    };
  },
  (diff) => {
    const base = randInt(4, diff === "easy" ? 15 : 30);
    const height = randInt(4, diff === "easy" ? 15 : 30);
    const area = 0.5 * base * height;
    return {
      category: "word",
      prompt: `A triangular flag has a base of ${base} cm and a height of ${height} cm. What is its area in cm²?`,
      correctAnswer: `${area}`,
      hint: "Area of a triangle = ½ × base × height",
      steps: [`Area = ½ × base × height`, `Area = ½ × ${base} × ${height}`, `Area = ${area} cm²`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, area, 1e-3); },
    };
  },
  (diff) => {
    const price = randInt(diff === "easy" ? 100 : 300, 2000);
    const discount = randInt(5, 40);
    const final = price - (price * discount) / 100;
    return {
      category: "word",
      prompt: `A jacket originally costs $${price}. It's on sale with a ${discount}% discount. What is the sale price (in $)?`,
      correctAnswer: `${final}`,
      hint: "Sale price = price − (price × discount%)",
      steps: [`Discount amount = ${price} × ${discount}/100 = ${(price * discount) / 100}`, `Sale price = ${price} - ${(price * discount) / 100}`, `Sale price = $${final}`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, final, 1e-2); },
    };
  },
  (diff) => {
    const rate = randInt(2, diff === "easy" ? 8 : 15);
    const hours = randInt(2, diff === "easy" ? 8 : 12);
    const total = rate * hours;
    return {
      category: "word",
      prompt: `A water tank is filled at a rate of ${rate} liters per minute for ${hours} minutes. How many liters are in the tank?`,
      correctAnswer: `${total}`,
      hint: "Total = rate × time",
      steps: [`Total volume = rate × time`, `Total = ${rate} × ${hours}`, `Total = ${total} liters`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, total, 1e-3); },
    };
  },
  (diff) => {
    const r = randInt(3, diff === "easy" ? 10 : 20);
    const area = Math.round(Math.PI * r * r * 100) / 100;
    return {
      category: "word",
      prompt: `A circular pool has a radius of ${r} m. What is its area in m² (use π ≈ 3.1416, round to 2 decimals)?`,
      correctAnswer: `${area}`,
      hint: "Area of a circle = π × r²",
      steps: [`Area = π × r²`, `Area = π × ${r}²`, `Area ≈ ${area} m²`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, area, 1e-1); },
    };
  },
  (diff) => {
    const now1 = randInt(diff === "easy" ? 20 : 15, 50);
    const yearsAgo = randInt(2, 10);
    const ratio = randInt(2, 4);
    // x years ago, parent was `ratio` times child's age. Find child's current age given parent's current age.
    const parentNow = now1;
    const childNow = Math.round((parentNow - yearsAgo) / ratio + yearsAgo);
    return {
      category: "word",
      prompt: `A parent is currently ${parentNow} years old. ${yearsAgo} years ago, the parent was ${ratio} times as old as their child. How old is the child now?`,
      correctAnswer: `${childNow}`,
      hint: "Set up: (parent's age then) = ratio × (child's age then), then add the years back.",
      steps: [
        `Parent's age ${yearsAgo} years ago = ${parentNow - yearsAgo}`,
        `Child's age then = (${parentNow - yearsAgo}) / ${ratio} = ${(parentNow - yearsAgo) / ratio}`,
        `Child's age now = ${(parentNow - yearsAgo) / ratio} + ${yearsAgo} = ${childNow}`,
      ],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, childNow, 0.6); },
    };
  },
  (diff) => {
    const rateA = randInt(2, diff === "easy" ? 6 : 10);
    const rateB = randInt(2, diff === "easy" ? 6 : 10);
    const combined = Math.round((1 / (1 / rateA + 1 / rateB)) * 100) / 100;
    return {
      category: "word",
      prompt: `Pipe A can fill a tank in ${rateA} hours alone, and Pipe B can fill it in ${rateB} hours alone. How many hours will it take both pipes together (round to 2 decimals)?`,
      correctAnswer: `${combined}`,
      hint: "Combined rate = 1/A + 1/B per hour; time = 1 / combined rate",
      steps: [
        `Rate of A = 1/${rateA} tank/hour, Rate of B = 1/${rateB} tank/hour`,
        `Combined rate = 1/${rateA} + 1/${rateB}`,
        `Time together = 1 / combined rate ≈ ${combined} hours`,
      ],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, combined, 0.05); },
    };
  },
  (diff) => {
    const total = randInt(diff === "easy" ? 20 : 40, 200);
    const ratioA = randInt(2, 5);
    const ratioB = randInt(1, 4);
    const partA = Math.round((total * ratioA) / (ratioA + ratioB));
    return {
      category: "word",
      prompt: `$${total} is split between two friends in the ratio ${ratioA}:${ratioB}. How much does the first friend get (in $)?`,
      correctAnswer: `${partA}`,
      hint: "First share = total × (ratioA / (ratioA + ratioB))",
      steps: [
        `Total parts = ${ratioA} + ${ratioB} = ${ratioA + ratioB}`,
        `Value per part = ${total} / ${ratioA + ratioB}`,
        `First friend's share = ${ratioA} × (${total}/${ratioA + ratioB}) ≈ ${partA}`,
      ],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, partA, 1); },
    };
  },
  (diff) => {
    const speed1 = randInt(diff === "easy" ? 30 : 50, 80);
    const speed2 = randInt(diff === "easy" ? 30 : 50, 80);
    const time = randInt(1, diff === "easy" ? 4 : 6);
    const dist = (speed1 + speed2) * time;
    return {
      category: "word",
      prompt: `Two cars start from the same point and drive in opposite directions, one at ${speed1} km/h and the other at ${speed2} km/h. How far apart are they after ${time} hours?`,
      correctAnswer: `${dist}`,
      hint: "Combined speed × time (opposite directions add speeds)",
      steps: [`Combined speed = ${speed1} + ${speed2} = ${speed1 + speed2} km/h`, `Distance apart = ${speed1 + speed2} × ${time}`, `Distance = ${dist} km`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, dist, 1e-2); },
    };
  },
  (diff) => {
    const liquidA = randInt(diff === "easy" ? 10 : 20, 50);
    const concA = randInt(10, 40);
    const liquidB = randInt(diff === "easy" ? 10 : 20, 50);
    const concB = randInt(10, 40);
    const mixedConc = Math.round(((liquidA * concA + liquidB * concB) / (liquidA + liquidB)) * 100) / 100;
    return {
      category: "word",
      prompt: `${liquidA} L of a ${concA}% acid solution is mixed with ${liquidB} L of a ${concB}% acid solution. What is the concentration of the mixture (in %, round to 2 decimals)?`,
      correctAnswer: `${mixedConc}`,
      hint: "Total acid / total volume × 100",
      steps: [
        `Acid from solution 1 = ${liquidA} × ${concA}/100 = ${(liquidA * concA) / 100} L`,
        `Acid from solution 2 = ${liquidB} × ${concB}/100 = ${(liquidB * concB) / 100} L`,
        `Mixture concentration = (total acid / total volume) × 100 ≈ ${mixedConc}%`,
      ],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, mixedConc, 0.1); },
    };
  },
  (diff) => {
    const principal = randInt(diff === "easy" ? 500 : 1000, 10000);
    const rate = randInt(3, 12);
    const years = randInt(1, diff === "easy" ? 3 : 5);
    const amount = Math.round(principal * Math.pow(1 + rate / 100, years) * 100) / 100;
    return {
      category: "word",
      prompt: `$${principal} is invested at ${rate}% annual compound interest for ${years} years. What is the total amount (round to 2 decimals)?`,
      correctAnswer: `${amount}`,
      hint: "A = P(1 + r/100)^t",
      steps: [`A = P(1 + r/100)^t`, `A = ${principal}(1 + ${rate}/100)^${years}`, `A ≈ $${amount}`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, amount, 0.5); },
    };
  },
  (diff) => {
    const l = randInt(4, diff === "easy" ? 15 : 25);
    const w = randInt(4, diff === "easy" ? 15 : 25);
    const h = randInt(4, diff === "easy" ? 15 : 25);
    const vol = l * w * h;
    return {
      category: "word",
      prompt: `A rectangular box has length ${l} cm, width ${w} cm, and height ${h} cm. What is its volume in cm³?`,
      correctAnswer: `${vol}`,
      hint: "Volume = length × width × height",
      steps: [`Volume = l × w × h`, `Volume = ${l} × ${w} × ${h}`, `Volume = ${vol} cm³`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, vol, 1e-3); },
    };
  },
  (diff) => {
    // Generate scores so that score4 stays between 30 and 100 (realistic)
    let score1: number, score2: number, score3: number, needed: number, score4: number;
    let attempts = 0;
    do {
      score1 = randInt(55, 85);
      score2 = randInt(55, 85);
      score3 = randInt(55, 85);
      needed = diff === "easy" ? randInt(65, 78) : diff === "medium" ? randInt(72, 85) : randInt(78, 90);
      score4 = needed * 4 - (score1 + score2 + score3);
      attempts++;
    } while ((score4 < 30 || score4 > 100) && attempts < 50);
    const total4 = needed * 4;
    return {
      category: "word",
      prompt: `A student scored ${score1}, ${score2}, and ${score3} on three tests. What score is needed on the 4th test for an average of ${needed}?`,
      correctAnswer: `${score4}`,
      hint: "average × number of tests − sum of known scores",
      steps: [`Required total = ${needed} × 4 = ${total4}`, `Sum of known scores = ${score1} + ${score2} + ${score3} = ${score1 + score2 + score3}`, `Score needed = ${total4} - ${score1 + score2 + score3} = ${score4}`],
      check: (input) => { const x = parseNumberAnswer(input); return x !== null && numericallyClose(x, score4, 1e-2); },
    };
  },
];

function genWord(diff: Difficulty): Problem {
  const pool = diff === "hard" ? WORD_TEMPLATES : WORD_TEMPLATES.slice(0, WORD_TEMPLATES.length - 2 + (diff === "medium" ? 1 : 0));
  return pick(pool.length ? pool : WORD_TEMPLATES)(diff);
}

const GENERATORS: Record<Category, (diff: Difficulty) => Problem> = {
  derivative: genDerivative,
  integral: genIntegral,
  linear: genLinear,
  quadratic: genQuadratic,
  word: genWord,
};

const CATEGORY_LABELS: Record<Category, string> = {
  derivative: "Derivatives",
  integral: "Integrals",
  linear: "Linear Equations",
  quadratic: "Quadratic Equations",
  word: "Word Problems",
};

const CATEGORIES: (Category | "mixed")[] = ["mixed", "derivative", "integral", "linear", "quadratic", "word"];

export function PracticeMode() {
  const [category, setCategory] = useState<Category | "mixed">("mixed");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [problem, setProblem] = useState<Problem>(() => {
    const cat = Object.keys(GENERATORS)[randInt(0, 4)] as Category;
    return GENERATORS[cat]("easy");
  });
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [problemKey, setProblemKey] = useState(0);
  const settings = useSettings();

  const newProblem = useCallback((cat: Category | "mixed", diff: Difficulty) => {
    const actualCat: Category = cat === "mixed" ? (Object.keys(GENERATORS)[randInt(0, 4)] as Category) : cat;
    setProblem(GENERATORS[actualCat](diff));
    setAnswer("");
    setFeedback(null);
    setShowAnswer(false);
    setProblemKey((k) => k + 1);
  }, []);

  const checkAnswer = () => {
    if (!problem || !answer.trim()) return;
    const ok = problem.check(answer);
    setFeedback(ok ? "correct" : "incorrect");
    setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GraduationCap className="h-5 w-5 text-primary" />
            Practice Mode
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Random problems to sharpen your skills — includes real-world word problems.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => { setCategory(c); newProblem(c, difficulty); }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {c === "mixed" ? "Mixed" : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => { setDifficulty(d); newProblem(category, d); }}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                  difficulty === d
                    ? d === "easy" ? "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30"
                    : d === "medium" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                    : "bg-muted text-muted-foreground border border-transparent hover:bg-muted/70"
                }`}
              >
                {d}
              </button>
            ))}
            <div className="flex-1" />
            <Badge variant="secondary" className="gap-1.5 font-mono">
              <Trophy className="h-3 w-3" /> {score.correct}/{score.total}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        {problem && (
          <motion.div
            key={problemKey}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className="border-primary/20 shadow-lg">
              <CardContent className="pt-6 space-y-4">
                <Badge variant="secondary" className="text-xs">
                  {CATEGORY_LABELS[problem.category]}
                </Badge>
                <div className="text-lg font-mono font-semibold text-foreground">
                  <MathText text={problem.prompt} />
                </div>

                <div className="flex gap-2">
                  <Input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Your answer"
                    className="font-mono"
                    onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
                  />
                  <Button onClick={checkAnswer} className="gap-1.5 shrink-0">
                    Check
                  </Button>
                </div>

                <AnimatePresence>
                  {feedback && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`flex items-center gap-2 p-3 rounded-lg ${
                        feedback === "correct"
                          ? "bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-300"
                          : "bg-destructive/10 border border-destructive/20 text-destructive"
                      }`}
                    >
                      {feedback === "correct" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                      <span className="text-sm font-medium">
                        {feedback === "correct" ? "Correct! Well done." : "Not quite — try again or reveal the answer."}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowAnswer((v) => !v)} className="gap-1.5 text-xs">
                    <Eye className="h-3.5 w-3.5" /> {showAnswer ? "Hide" : "Show"} Answer
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => newProblem(category, difficulty)} className="gap-1.5 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" /> New Problem
                  </Button>
                </div>

                {showAnswer && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-muted/50 text-sm font-mono">
                      <span className="text-muted-foreground">Answer: </span><MathText text={problem.correctAnswer} />
                      {problem.hint && <div className="text-xs text-muted-foreground mt-1">Hint: {problem.hint}</div>}
                    </div>
                    <StepsReveal steps={problem.steps} show={settings.showSteps} resetKey={`${problemKey}-answer`} title="Worked Solution:" />
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
