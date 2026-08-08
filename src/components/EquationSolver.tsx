import { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calculator, LineChart } from "lucide-react";
import { evaluate } from "mathjs";
import { StepsReveal } from "./StepsReveal";
import { GraphCanvas } from "./GraphCanvas";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { generateGraphPoints, generateImplicitPoints2D } from "@/lib/math-solver";

const ImplicitSurface3D = lazy(() => import("./ImplicitSurface3D").then(m => ({ default: m.ImplicitSurface3D })));

interface SolveResult {
  roots: string[];
  steps: string[];
  error?: string;
  numericRoots?: number[];
}

function solveLinear(equation: string, fmt: (n: number) => string): SolveResult {
  try {
    const steps: string[] = [];
    const parts = equation.split("=");
    if (parts.length !== 2) return { roots: [], steps: [], error: "Use format: ax + b = c" };

    steps.push(`Given: ${equation}`);

    const expr = `(${parts[0].trim()}) - (${parts[1].trim()})`;
    steps.push(`Rearrange: ${expr} = 0`);

    const f0 = evaluate(expr, { x: 0 }) as number;
    const f1 = evaluate(expr, { x: 1 }) as number;
    const slope = f1 - f0;

    if (Math.abs(slope) < 1e-10) {
      if (Math.abs(f0) < 1e-10) return { roots: ["All real numbers"], steps: [...steps, "Identity: true for all x"] };
      return { roots: [], steps: [...steps, "No solution (contradiction)"], error: "No solution" };
    }

    const root = -f0 / slope;
    steps.push(`Slope (coefficient of x) = ${formatNum(slope)}`);
    steps.push(`Intercept = ${formatNum(f0)}`);
    steps.push(`x = -${formatNum(f0)} / ${formatNum(slope)} = ${fmt(root)}`);

    return { roots: [root.toString()], steps, numericRoots: [root] };
  } catch (e: unknown) {
    return { roots: [], steps: [], error: e instanceof Error ? e.message : "Invalid equation" };
  }
}

function formatNum(n: number): string {
  const r = Math.round(n * 1e8) / 1e8;
  return r.toString();
}

function solveQuadratic(a: number, b: number, c: number, fmt: (n: number) => string): SolveResult {
  const steps: string[] = [];
  steps.push(`Standard form: ${formatNum(a)}x² + ${formatNum(b)}x + ${formatNum(c)} = 0`);
  steps.push(`Using quadratic formula: x = (-b ± √(b²-4ac)) / 2a`);

  const discriminant = b * b - 4 * a * c;
  steps.push(`Discriminant: D = b² - 4ac = (${formatNum(b)})² - 4(${formatNum(a)})(${formatNum(c)}) = ${formatNum(discriminant)}`);

  if (discriminant > 0) {
    const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
    steps.push(`D > 0 → Two real roots`);
    steps.push(`x₁ = (-(${formatNum(b)}) + √${formatNum(discriminant)}) / ${formatNum(2 * a)} = ${fmt(x1)}`);
    steps.push(`x₂ = (-(${formatNum(b)}) - √${formatNum(discriminant)}) / ${formatNum(2 * a)} = ${fmt(x2)}`);
    return { roots: [x1.toFixed(6), x2.toFixed(6)], steps, numericRoots: [x1, x2] };
  } else if (Math.abs(discriminant) < 1e-9) {
    const x = -b / (2 * a);
    steps.push(`D = 0 → One repeated root`);
    steps.push(`x = -(${formatNum(b)}) / ${formatNum(2 * a)} = ${fmt(x)}`);
    return { roots: [x.toFixed(6)], steps, numericRoots: [x] };
  } else {
    const real = fmt(-b / (2 * a));
    const imag = fmt(Math.sqrt(-discriminant) / (2 * a));
    steps.push(`D < 0 → Two complex conjugate roots`);
    steps.push(`x₁ = ${real} + ${imag}i`);
    steps.push(`x₂ = ${real} - ${imag}i`);
    return { roots: [`${real} + ${imag}i`, `${real} - ${imag}i`], steps };
  }
}

// Extracts a, b, c for any quadratic-in-x equation (terms can be on both sides,
// e.g. "2x^2 + 3x = x^2 - 5") using finite differences — no manual coefficient entry needed.
function solveQuadraticFromEquation(equation: string, fmt: (n: number) => string): SolveResult {
  const parts = equation.split("=");
  if (parts.length !== 2) return { roots: [], steps: [], error: "Use format: ax² + bx + c = 0 (any quadratic equation)" };

  const expr = `(${parts[0].trim()}) - (${parts[1].trim()})`;
  const steps: string[] = [`Given: ${equation}`, `Rearrange to standard form: ${expr} = 0`];

  let f0: number, f1: number, fm1: number, f2: number;
  try {
    f0 = evaluate(expr, { x: 0 }) as number;
    f1 = evaluate(expr, { x: 1 }) as number;
    fm1 = evaluate(expr, { x: -1 }) as number;
    f2 = evaluate(expr, { x: 2 }) as number;
  } catch (e: unknown) {
    return { roots: [], steps: [], error: e instanceof Error ? e.message : "Invalid equation" };
  }

  const c = f0;
  const a = (f1 + fm1 - 2 * c) / 2;
  const b = (f1 - fm1) / 2;

  const predicted2 = a * 4 + b * 2 + c;
  if (Math.abs(predicted2 - f2) > Math.max(1e-6, Math.abs(f2) * 1e-6)) {
    return {
      roots: [], steps: [],
      error: "This doesn't reduce to a quadratic (degree > 2 detected) — try the Graph Equation tab instead, or check your input.",
    };
  }
  if (Math.abs(a) < 1e-9) {
    return { roots: [], steps: [], error: "Coefficient of x² is 0 — this is linear, not quadratic. Use the Linear tab." };
  }

  steps.push(`Extracted coefficients by sampling: a = ${formatNum(a)}, b = ${formatNum(b)}, c = ${formatNum(c)}`);
  const quad = solveQuadratic(a, b, c, fmt);
  return { ...quad, steps: [...steps, ...quad.steps] };
}

function extractVariables(equation: string): string[] {
  const knownFns = new Set(["sin", "cos", "tan", "sec", "csc", "cot", "log", "ln", "exp", "sqrt", "abs", "pi", "e"]);
  const matches = equation.match(/[a-zA-Z]+/g) || [];
  const vars = new Set<string>();
  for (const m of matches) {
    if (knownFns.has(m.toLowerCase())) continue;
    if (m.length === 1) vars.add(m);
  }
  return Array.from(vars).sort();
}

function GraphEquationTab() {
  const settings = useSettings();
  const [equation, setEquation] = useState("x^2 + y^2 = 25");
  const [range, setRange] = useState(settings.defaultGraphRange.toString());
  const [parsed, setParsed] = useState<{ vars: string[]; expr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plot = () => {
    const parts = equation.split("=");
    if (parts.length !== 2) {
      setError("Use format: expression = expression, e.g. x^2 + y^2 = 25");
      setParsed(null);
      return;
    }
    const expr = `(${parts[0].trim()}) - (${parts[1].trim()})`;
    const vars = extractVariables(expr);
    if (vars.length === 0) {
      setError("No variable detected — use x, y, and/or z");
      setParsed(null);
      return;
    }
    if (vars.length > 3) {
      setError("Only up to 3 variables (x, y, z) are supported for graphing");
      setParsed(null);
      return;
    }
    setError(null);
    setParsed({ vars, expr });
  };

  const r = Math.abs(parseFloat(range)) || 10;

  const points2d = useMemo(() => {
    if (!parsed || parsed.vars.length !== 1) return [];
    return generateGraphPoints(parsed.expr, parsed.vars[0], -r, r);
  }, [parsed, r]);

  const implicit2d = useMemo(() => {
    if (!parsed || parsed.vars.length !== 2) return [];
    return generateImplicitPoints2D(parsed.expr, parsed.vars[0], parsed.vars[1], -r, r, -r, r);
  }, [parsed, r]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Type any equation with x, y, and/or z. 1 variable → 2D function graph. 2 variables (x,y) → 2D implicit curve. 3 variables (x,y,z) → 3D surface.
      </p>
      <div className="space-y-1">
        <Label className="text-xs">Equation</Label>
        <MathInput
          value={equation}
          onChange={setEquation}
          placeholder="e.g. x^2+y^2=25, x+2y-z=4, x^2-5=0"
          onEnter={plot}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Range (± from 0)</Label>
        <Input value={range} onChange={(e) => setRange(e.target.value)} type="number" className="font-mono w-28" />
      </div>
      <Button onClick={plot} className="w-full gap-2">
        <LineChart className="h-4 w-4" /> Plot Equation
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {parsed && parsed.vars.length === 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <p className="text-xs text-muted-foreground mb-2">Single variable ({parsed.vars[0]}) → 2D graph of {parsed.expr} = 0 (roots are where it crosses zero)</p>
          <GraphCanvas series={[{ expr: parsed.expr, points: points2d }]} xMin={-r} xMax={r} />
        </motion.div>
      )}

      {parsed && parsed.vars.length === 2 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <p className="text-xs text-muted-foreground mb-2">Two variables ({parsed.vars.join(", ")}) → 2D implicit curve</p>
          <GraphCanvas
            series={[{ expr: equation, points: implicit2d, mode: "scatter" }]}
            xMin={-r} xMax={r} yMin={-r} yMax={r}
          />
        </motion.div>
      )}

      {parsed && parsed.vars.length === 3 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <p className="text-xs text-muted-foreground mb-2">Three variables ({parsed.vars.join(", ")}) → 3D surface</p>
          <Suspense fallback={<div className="h-[460px] rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground">Loading 3D engine…</div>}>
            <ImplicitSurface3D expression={parsed.expr} varNames={[parsed.vars[0], parsed.vars[1], parsed.vars[2]]} range={r} />
          </Suspense>
        </motion.div>
      )}
    </div>
  );
}

function RootGraph({ expr, range }: { expr: string; range?: number }) {
  const settings = useSettings();
  const effectiveRange = range ?? settings.defaultGraphRange;
  const points = useMemo(() => generateGraphPoints(expr, "x", -effectiveRange, effectiveRange), [expr, effectiveRange]);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Graph of y = {expr} (crosses zero at the root)</p>
      <GraphCanvas series={[{ expr, points }]} xMin={-effectiveRange} xMax={effectiveRange} />
    </div>
  );
}

export function EquationSolver() {
  const settings = useSettings();
  const [mode, setMode] = useState("quadratic");
  const [linearEq, setLinearEq] = useState("2x + 3 = 7");
  const [quadEq, setQuadEq] = useState("x^2 - 5x + 6 = 0");
  const [result, setResult] = useState<SolveResult | null>(null);
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [showGraph, setShowGraph] = useState(settings.alwaysShowGraphs);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);
  useEffect(() => setShowGraph(settings.alwaysShowGraphs), [settings.alwaysShowGraphs]);

  const fmt = (n: number) => formatNumber(n, settings);

  const solve = () => {
    if (mode === "linear") {
      setResult(solveLinear(linearEq, fmt));
    } else if (mode === "quadratic") {
      setResult(solveQuadraticFromEquation(quadEq, fmt));
    }
  };

  useAutoRun([mode, linearEq, quadEq], solve, settings.autoCalculate);

  const activeExpr = useMemo(() => {
    const eq = mode === "linear" ? linearEq : quadEq;
    const parts = eq.split("=");
    if (parts.length !== 2) return null;
    return `(${parts[0].trim()}) - (${parts[1].trim()})`;
  }, [mode, linearEq, quadEq]);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5 text-primary" />
            Equation Solver
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="w-full">
              <TabsTrigger value="linear" className="flex-1">Linear</TabsTrigger>
              <TabsTrigger value="quadratic" className="flex-1">Quadratic</TabsTrigger>
              <TabsTrigger value="graph" className="flex-1">Graph Equation</TabsTrigger>
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

            <TabsContent value="graph" className="pt-2">
              <GraphEquationTab />
            </TabsContent>
          </Tabs>

          {mode !== "graph" && (
            <>
              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={showSteps} onCheckedChange={setShowSteps} />
                  Step-by-step
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={showGraph} onCheckedChange={setShowGraph} />
                  Show Graph
                </label>
              </div>

              {!settings.autoCalculate && (
                <Button onClick={solve} className="w-full gap-2">
                  <Calculator className="h-4 w-4" /> Solve
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {mode !== "graph" && result && (
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
                      x{result.roots.length > 1 ? `₍${i + 1}₎` : ""} = {result.numericRoots?.[i] !== undefined ? formatNumber(result.numericRoots[i], settings) : r}
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

      {mode !== "graph" && showGraph && activeExpr && !result?.error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="shadow-lg border-border/50">
            <CardContent className="pt-6">
              <RootGraph expr={activeExpr} />
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
