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
import { solveDerivative, solveIndefiniteIntegral } from "@/lib/math-solver";
import { solveLinear, solveQuadratic } from "./EquationSolver";
import { exprToLatex } from "@/lib/latex";

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

/** Plain number formatter for Practice Mode's generated steps — these run
 *  outside the component tree (in module-level generator functions), so
 *  they can't read the user's Decimal/Fraction/Scientific display setting
 *  the way the calculators do; a simple fixed-point string is fine here
 *  since these are throwaway practice numbers, not a persisted result. */
function plainFmt(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Number.isInteger(r) ? r.toString() : r.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function signed(n: number): string {
  return n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`;
}

/** Wraps a word-problem reasoning step in the same rich "##Header + LaTeX
 *  equation" format used everywhere else in the app, so Practice Mode's
 *  "Show Answer" steps look and feel identical to the calculators. */
function wordStep(header: string, latex: string): string {
  return `##${header}\n$$${latex}$$`;
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
    steps: solveDerivative(cleanExpr.replace(/\s/g, ""), "x").steps,
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
    steps: solveDerivative(exprStr, "x").steps,
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
    steps: solveDerivative(exprStr, "x").steps,
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
    steps: solveIndefiniteIntegral(exprStr, "x").steps,
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
    steps: solveIndefiniteIntegral(exprStr, "x").steps,
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
    steps: solveIndefiniteIntegral(exprStr, "x").steps,
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
    steps: solveIndefiniteIntegral(exprStr, "x").steps,
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
    steps: solveLinear(`${lhs}=${rhs}`.replace(/\s+/g, ""), plainFmt).steps,
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
    steps: solveQuadratic(leading, b, c, plainFmt).steps,
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
      steps: [wordStep("Formula", "A = l\\times w"), wordStep("Substitute", `A = ${l}\\times ${w} = ${l * w}\\text{ m}^2`)],
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
      steps: [wordStep("Formula", "d = v\\times t"), wordStep("Substitute", `d = ${v}\\times ${t} = ${v * t}\\text{ km}`)],
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
      steps: [wordStep("Set Up the System", `a+b=${s}, \\quad a-b=${d}`), wordStep("Add the Two Equations", `2a = ${s + d}`), wordStep("Solve for the Larger Number", `a = ${larger}`)],
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
      steps: [wordStep("Formula", "SI = \\frac{P\\times R\\times T}{100}"), wordStep("Substitute", `SI = \\frac{${p}\\times ${r}\\times ${t}}{100} = \\$${interest}`)],
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
      steps: [wordStep("Formula", "A = \\frac{1}{2}\\times b\\times h"), wordStep("Substitute", `A = \\frac{1}{2}\\times ${base}\\times ${height} = ${area}\\text{ cm}^2`)],
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
      steps: [wordStep("Discount Amount", `${price}\\times \\frac{${discount}}{100} = ${(price * discount) / 100}`), wordStep("Sale Price", `${price} - ${(price * discount) / 100} = \\$${final}`)],
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
      steps: [wordStep("Formula", "V = \\text{rate}\\times \\text{time}"), wordStep("Substitute", `V = ${rate}\\times ${hours} = ${total}\\text{ liters}`)],
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
      steps: [wordStep("Formula", "A = \\pi r^2"), wordStep("Substitute", `A = \\pi(${r})^2 \\approx ${area}\\text{ m}^2`)],
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
        wordStep("Parent's Age Then", `${parentNow} - ${yearsAgo} = ${parentNow - yearsAgo}`),
        wordStep("Child's Age Then", `\\frac{${parentNow - yearsAgo}}{${ratio}} = ${(parentNow - yearsAgo) / ratio}`),
        wordStep("Child's Age Now", `${(parentNow - yearsAgo) / ratio} + ${yearsAgo} = ${childNow}`),
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
        wordStep("Individual Rates", `\\text{Rate}_A = \\frac{1}{${rateA}}, \\quad \\text{Rate}_B = \\frac{1}{${rateB}}\\text{ (tank/hour)}`),
        wordStep("Combined Rate", `\\frac{1}{${rateA}} + \\frac{1}{${rateB}}`),
        wordStep("Time Together", `\\frac{1}{\\text{combined rate}} \\approx ${combined}\\text{ hours}`),
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
        wordStep("Total Parts", `${ratioA} + ${ratioB} = ${ratioA + ratioB}`),
        wordStep("Value per Part", `\\frac{${total}}{${ratioA + ratioB}}`),
        wordStep("First Friend's Share", `${ratioA}\\times \\frac{${total}}{${ratioA + ratioB}} \\approx ${partA}`),
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
      steps: [wordStep("Combined Speed", `${speed1} + ${speed2} = ${speed1 + speed2}\\text{ km/h}`), wordStep("Distance Apart", `${speed1 + speed2}\\times ${time} = ${dist}\\text{ km}`)],
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
        wordStep("Acid from Solution 1", `${liquidA}\\times \\frac{${concA}}{100} = ${(liquidA * concA) / 100}\\text{ L}`),
        wordStep("Acid from Solution 2", `${liquidB}\\times \\frac{${concB}}{100} = ${(liquidB * concB) / 100}\\text{ L}`),
        wordStep("Mixture Concentration", `\\frac{\\text{total acid}}{\\text{total volume}}\\times 100 \\approx ${mixedConc}\\%`),
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
      steps: [wordStep("Formula", "A = P\\left(1+\\frac{r}{100}\\right)^t"), wordStep("Substitute", `A = ${principal}\\left(1+\\frac{${rate}}{100}\\right)^{${years}} \\approx \\$${amount}`)],
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
      steps: [wordStep("Formula", "V = l\\times w\\times h"), wordStep("Substitute", `V = ${l}\\times ${w}\\times ${h} = ${vol}\\text{ cm}^3`)],
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
      steps: [wordStep("Required Total", `${needed}\\times 4 = ${total4}`), wordStep("Sum of Known Scores", `${score1} + ${score2} + ${score3} = ${score1 + score2 + score3}`), wordStep("Score Needed", `${total4} - ${score1 + score2 + score3} = ${score4}`)],
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
