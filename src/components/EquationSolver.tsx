import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calculator } from "lucide-react";
import { evaluate } from "mathjs";
import { StepsReveal } from "./StepsReveal";
import { FunctionGraph, type PlotMarker } from "./FunctionGraph";
import { makeEvaluator, findRoots, validate2D } from "@/lib/graph-utils";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { exprToLatex } from "@/lib/latex";
import { solveAny, solveEquation } from "@/lib/equation-solver";

export interface SolveResult {
  roots: string[];
  steps: string[];
  error?: string;
  numericRoots?: number[];
  variable?: string;
  graphExpr?: string;
  setAnswer?: string;
}

export function solveLinear(equation: string, fmt: (n: number) => string): SolveResult {
  try {
    const steps: string[] = [];
    const parts = equation.split("=");
    if (parts.length !== 2) return { roots: [], steps: [], error: "Use format: ax + b = c" };

    steps.push(`##Given\n$$${exprToLatex(parts[0].trim())} = ${exprToLatex(parts[1].trim())}$$`);

    const expr = `(${parts[0].trim()}) - (${parts[1].trim()})`;
    steps.push(`##Rearrange to Standard Form\n$$${exprToLatex(expr)} = 0$$`);

    const f0 = evaluate(expr, { x: 0 }) as number;
    const f1 = evaluate(expr, { x: 1 }) as number;
    const slope = f1 - f0;
    const probes = [-3, 2, 5.5].map((t) => evaluate(expr, { x: t }) as number);
    if (![f0, f1, ...probes].every((v) => typeof v === "number" && Number.isFinite(v)) || [-3, 2, 5.5].some((t, i) => Math.abs(probes[i] - (f0 + slope * t)) > 1e-8 * (1 + Math.abs(probes[i])))) {
      const g = solveEquation(equation, fmt);
      return { ...g, steps: ["##Note\nThis isn't linear, so the general solver was used instead.", ...g.steps] };
    }

    if (Math.abs(slope) < 1e-10) {
      if (Math.abs(f0) < 1e-10) return { roots: ["All real numbers"], steps: [...steps, "##Identity\n$$0 = 0 \\;\\Rightarrow\\; x \\in \\mathbb{R}$$"] };
      return { roots: [], steps: [...steps, `##Contradiction\n$$${exprToLatex(fmtNum2(f0))} = 0 \\;\\Rightarrow\\; \\text{no solution}$$`], error: "No solution" };
    }

    const root = -f0 / slope;
    steps.push(`##Linear Form\n$$${exprToLatex(fmtNum2(slope))}x + ${exprToLatex(fmtNum2(f0))} = 0$$`);
    steps.push(`##Solve for x\n$$x = \\frac{-(${exprToLatex(fmtNum2(f0))})}{${exprToLatex(fmtNum2(slope))}} = ${fmt(root)}$$`);

    return { roots: [root.toString()], steps, numericRoots: [root] };
  } catch (e: unknown) {
    return { roots: [], steps: [], error: e instanceof Error ? e.message : "Invalid equation" };
  }
}

function fmtNum2(n: number): string {
  const r = Math.round(n * 1e8) / 1e8;
  return r.toString();
}

export function solveQuadratic(a: number, b: number, c: number, fmt: (n: number) => string): SolveResult {
  const steps: string[] = [];
  const aL = fmtNum2(a), bL = fmtNum2(b), cL = fmtNum2(c);
  steps.push(`##Standard Form\n$$${aL}x^2 + ${bL}x + ${cL} = 0$$`);
  steps.push(`##Quadratic Formula\n$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$`);

  const discriminant = b * b - 4 * a * c;
  steps.push(`##Discriminant\n$$D = b^2-4ac = (${bL})^2 - 4(${aL})(${cL}) = ${fmtNum2(discriminant)}$$`);

  if (discriminant > 0) {
    const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
    steps.push(`##Two Real Roots ($D > 0$)\n$$x_1 = \\frac{-(${bL}) + \\sqrt{${fmtNum2(discriminant)}}}{${fmtNum2(2 * a)}} = ${fmt(x1)}$$\n$$x_2 = \\frac{-(${bL}) - \\sqrt{${fmtNum2(discriminant)}}}{${fmtNum2(2 * a)}} = ${fmt(x2)}$$`);
    return { roots: [x1.toFixed(6), x2.toFixed(6)], steps, numericRoots: [x1, x2] };
  } else if (Math.abs(discriminant) < 1e-9) {
    const x = -b / (2 * a);
    steps.push(`##One Repeated Root ($D = 0$)\n$$x = \\frac{-(${bL})}{${fmtNum2(2 * a)}} = ${fmt(x)}$$`);
    return { roots: [x.toFixed(6)], steps, numericRoots: [x] };
  } else {
    const real = fmt(-b / (2 * a));
    const imag = fmt(Math.sqrt(-discriminant) / (2 * a));
    steps.push(`##Complex Roots ($D < 0$)\n$$x_1 = ${real} + ${imag}i, \\qquad x_2 = ${real} - ${imag}i$$`);
    return { roots: [`${real} + ${imag}i`, `${real} - ${imag}i`], steps };
  }
}

// Extracts a, b, c for any quadratic-in-x equation (terms can be on both sides,
// e.g. "2x^2 + 3x = x^2 - 5") using finite differences — no manual coefficient entry needed.
export function solveQuadraticFromEquation(equation: string, fmt: (n: number) => string): SolveResult {
  const parts = equation.split("=");
  if (parts.length !== 2) return { roots: [], steps: [], error: "Use format: ax² + bx + c = 0 (any quadratic equation)" };
  const general = (note: string) => { const g = solveEquation(equation, fmt); return { ...g, steps: [`##Note\n${note}`, ...g.steps] }; };

  const expr = `(${parts[0].trim()}) - (${parts[1].trim()})`;
  const steps: string[] = [
    `##Given\n$$${exprToLatex(parts[0].trim())} = ${exprToLatex(parts[1].trim())}$$`,
    `##Rearrange to Standard Form\n$$${exprToLatex(expr)} = 0$$`,
  ];

  let f0: number, f1: number, fm1: number, f2: number;
  try {
    f0 = evaluate(expr, { x: 0 }) as number;
    f1 = evaluate(expr, { x: 1 }) as number;
    fm1 = evaluate(expr, { x: -1 }) as number;
    f2 = evaluate(expr, { x: 2 }) as number;
  } catch (e: unknown) {
    return { roots: [], steps: [], error: e instanceof Error ? e.message : "Invalid equation" };
  }
  if (![f0, f1, fm1, f2].every((v) => typeof v === "number" && Number.isFinite(v))) return general("This isn't a plain quadratic, so the general solver was used.");

  const c = f0;
  const a = (f1 + fm1 - 2 * c) / 2;
  const b = (f1 - fm1) / 2;

  const predicted2 = a * 4 + b * 2 + c;
  if (Math.abs(predicted2 - f2) > Math.max(1e-6, Math.abs(f2) * 1e-6)) {
    return general("This isn't a quadratic (higher degree or not a polynomial), so the general solver was used.");
  }
  if (Math.abs(a) < 1e-9) return general("The x² term cancels — it's linear, solved directly.");

  steps.push(`##Coefficients\n$$a = ${fmtNum2(a)}, \\quad b = ${fmtNum2(b)}, \\quad c = ${fmtNum2(c)}$$`);
  const quad = solveQuadratic(a, b, c, fmt);
  return { ...quad, steps: [...steps, ...quad.steps] };
}

function RootGraph({ expr, range }: { expr: string; range?: number }) {
  const settings = useSettings();
  const effectiveRange = range ?? settings.defaultGraphRange;
  const problem = useMemo(() => validate2D(expr, "x", -effectiveRange, effectiveRange), [expr, effectiveRange]);
  const roots = useMemo<PlotMarker[]>(() => {
    if (problem) return [];
    const f = makeEvaluator(expr, "x");
    return f ? findRoots(f, -effectiveRange, effectiveRange).slice(0, 30).map((x) => ({ x, y: 0, filled: true, color: "#ef4444", label: String(parseFloat(x.toPrecision(5))) })) : [];
  }, [expr, effectiveRange, problem]);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Graph of y = {expr} (crosses zero at the root)</p>
      {problem ? (
        <p className="text-sm text-destructive">{problem}</p>
      ) : (
        <FunctionGraph series={[{ expr, label: `y = ${expr}` }]} xRange={[-effectiveRange, effectiveRange]} markers={roots} />
      )}
    </div>
  );
}

export function EquationSolver() {
  const settings = useSettings();
  const [mode, setMode] = useState("quadratic");
  const [linearEq, setLinearEq] = useState("2x + 3 = 7");
  const [quadEq, setQuadEq] = useState("x^2 - 5x + 6 = 0");
  const [genEq, setGenEq] = useState("x^3 - 6x^2 + 11x - 6 = 0");
  const [result, setResult] = useState<SolveResult | null>(null);
  const [showSteps, setShowSteps] = useState(settings.showSteps);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const fmt = (n: number) => formatNumber(n, settings);

  const solve = () => {
    if (mode === "linear") {
      setResult(solveLinear(linearEq, fmt));
    } else if (mode === "quadratic") {
      setResult(solveQuadraticFromEquation(quadEq, fmt));
    } else {
      setResult(solveAny(genEq, fmt));
    }
  };

  useAutoRun([mode, linearEq, quadEq, genEq], solve, settings.autoCalculate);

  const activeExpr = useMemo(() => {
    if (mode === "general") {
      return result && !result.error && result.variable === "x" && result.graphExpr && !result.setAnswer?.startsWith("system") ? result.graphExpr : null;
    }
    const eq = mode === "linear" ? linearEq : quadEq;
    const parts = eq.split("=");
    if (parts.length !== 2) return null;
    return `(${parts[0].trim()}) - (${parts[1].trim()})`;
  }, [mode, linearEq, quadEq, result]);

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
      <div className="space-y-6 min-w-0">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5 text-primary" />
            Equation Solver
          </CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); solve(); }
          }}
        >
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="w-full">
              <TabsTrigger value="linear" className="flex-1">Linear</TabsTrigger>
              <TabsTrigger value="quadratic" className="flex-1">Quadratic</TabsTrigger>
              <TabsTrigger value="general" className="flex-1">Any Equation</TabsTrigger>
            </TabsList>

            <TabsContent value="linear" className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">Equation (use x)</Label>
                <MathInput
                  value={linearEq}
                  onChange={setLinearEq}
                  placeholder="e.g. 2x + 3 = 7"
                  onEnter={solve}
                />
              </div>
            </TabsContent>

            <TabsContent value="general" className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">Equation, inequality, or system (separate equations with commas)</Label>
                <MathInput
                  value={genEq}
                  onChange={setGenEq}
                  placeholder="e.g. x^3-6x^2+11x-6=0, sqrt(x+2)=x, x^2-4>0, 2x+y=5, x-y=1"
                  onEnter={solve}
                />
                <p className="text-xs text-muted-foreground">Any degree polynomial, fractions, roots, |x|, trig, exp/log, inequalities, and systems of equations.</p>
              </div>
            </TabsContent>

            <TabsContent value="quadratic" className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">Equation (use x) — any quadratic form</Label>
                <MathInput
                  value={quadEq}
                  onChange={setQuadEq}
                  placeholder="e.g. x^2 - 5x + 6 = 0, or 2x^2+3x = x^2-5"
                  onEnter={solve}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showSteps} onCheckedChange={setShowSteps} />
              Step-by-step
            </label>
          </div>

          {!settings.autoCalculate && (
            <Button onClick={solve} className="w-full gap-2">
              <Calculator className="h-4 w-4" /> Solve
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="shadow-lg border-border/50">
          <CardContent className="pt-6 space-y-4">
            {result.error ? (
              <p className="text-destructive font-medium">{result.error}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {result.roots.map((r, i) => (
                    <Badge key={i} variant="secondary" className="text-base font-mono px-3 py-1">
                      {result.setAnswer && result.setAnswer !== "all" && !result.setAnswer.startsWith("system") ? `${result.variable ?? "x"} ∈ ${r}` : /[=∈]/.test(r) || r.startsWith("All") || r.startsWith("True") ? r : `${result.variable ?? "x"}${result.roots.length > 1 ? `₍${i + 1}₎` : ""} = ${result.numericRoots?.[i] !== undefined ? formatNumber(result.numericRoots[i], settings) : r}`}
                    </Badge>
                  ))}
                </div>
                <StepsReveal steps={result.steps} show={showSteps} resetKey={result.roots.join(",")} />
              </>
            )}
          </CardContent>
        </Card>
        </motion.div>
      )}
      </div>

      {activeExpr && !result?.error && (
        <div className="lg:sticky lg:top-4 min-w-0">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="shadow-lg border-border/50">
              <CardContent className="pt-6">
                <RootGraph expr={activeExpr} />
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  );
}
