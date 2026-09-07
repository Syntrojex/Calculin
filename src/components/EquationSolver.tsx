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
import { exprToLatex } from "@/lib/latex";
import { generateGraphPoints, generateImplicitPoints2D, parseEquationToZeroForm } from "@/lib/math-solver";

const ImplicitSurface3D = lazy(() => import("./ImplicitSurface3D").then(m => ({ default: m.ImplicitSurface3D })));

export interface SolveResult {
  roots: string[];
  steps: string[];
  error?: string;
  numericRoots?: number[];
}

export function solveLinear(equation: string, fmt: (n: number) => string): SolveResult {
  try {
    const steps: string[] = [];
    const parts = equation.split("=");
    if (parts.length !== 2) return { roots: [], steps: [], error: "Use format: ax + b = c" };

    steps.push(`##Given\n$$${exprToLatex(parts[0].trim())} = ${exprToLatex(parts[1].trim())}$$`);

    const expr = `(${parts[0].trim()}) - (${parts[1].trim()})`;
    steps.push(`##Rearrange to Standard Form\nMove everything to one side so the equation equals $0$:\n$$${exprToLatex(expr)} = 0$$`);

    const f0 = evaluate(expr, { x: 0 }) as number;
    const f1 = evaluate(expr, { x: 1 }) as number;
    const slope = f1 - f0;

    if (Math.abs(slope) < 1e-10) {
      if (Math.abs(f0) < 1e-10) return { roots: ["All real numbers"], steps: [...steps, "##Identity\nThis holds true for every value of $x$ — every real number is a solution."] };
      return { roots: [], steps: [...steps, "##Contradiction\nThis simplifies to a false statement (e.g. $5 = 0$) — there is no solution."], error: "No solution" };
    }

    const root = -f0 / slope;
    steps.push(`##Identify Slope and Intercept\nThe rearranged expression is linear: $${exprToLatex(fmtNum2(slope))}x + ${exprToLatex(fmtNum2(f0))} = 0$.`);
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
    steps.push(`##Two Real Roots\n$D > 0$, so there are two distinct real solutions:\n$$x_1 = \\frac{-(${bL}) + \\sqrt{${fmtNum2(discriminant)}}}{${fmtNum2(2 * a)}} = ${fmt(x1)}$$\n$$x_2 = \\frac{-(${bL}) - \\sqrt{${fmtNum2(discriminant)}}}{${fmtNum2(2 * a)}} = ${fmt(x2)}$$`);
    return { roots: [x1.toFixed(6), x2.toFixed(6)], steps, numericRoots: [x1, x2] };
  } else if (Math.abs(discriminant) < 1e-9) {
    const x = -b / (2 * a);
    steps.push(`##One Repeated Root\n$D = 0$, so there's exactly one (repeated) solution:\n$$x = \\frac{-(${bL})}{${fmtNum2(2 * a)}} = ${fmt(x)}$$`);
    return { roots: [x.toFixed(6)], steps, numericRoots: [x] };
  } else {
    const real = fmt(-b / (2 * a));
    const imag = fmt(Math.sqrt(-discriminant) / (2 * a));
    steps.push(`##Two Complex Conjugate Roots\n$D < 0$, so the square root is imaginary — the two solutions are complex conjugates:\n$$x_1 = ${real} + ${imag}i, \\qquad x_2 = ${real} - ${imag}i$$`);
    return { roots: [`${real} + ${imag}i`, `${real} - ${imag}i`], steps };
  }
}

// Extracts a, b, c for any quadratic-in-x equation (terms can be on both sides,
// e.g. "2x^2 + 3x = x^2 - 5") using finite differences — no manual coefficient entry needed.
export function solveQuadraticFromEquation(equation: string, fmt: (n: number) => string): SolveResult {
  const parts = equation.split("=");
  if (parts.length !== 2) return { roots: [], steps: [], error: "Use format: ax² + bx + c = 0 (any quadratic equation)" };

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

  steps.push(`##Extract Coefficients\nSample the rearranged expression at a few points to identify $a$, $b$, $c$:\n$$a = ${fmtNum2(a)}, \\quad b = ${fmtNum2(b)}, \\quad c = ${fmtNum2(c)}$$`);
  const quad = solveQuadratic(a, b, c, fmt);
  return { ...quad, steps: [...steps, ...quad.steps] };
}

function GraphEquationTab() {
  const settings = useSettings();
  const [equation, setEquation] = useState("x^2 + y^2 = 25");
  const [range, setRange] = useState(settings.defaultGraphRange.toString());
  const [parsed, setParsed] = useState<{ vars: string[]; expr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plot = () => {
    const parsedResult = parseEquationToZeroForm(equation);
    if ("error" in parsedResult) {
      setError(parsedResult.error);
      setParsed(null);
      return;
    }
    setError(null);
    setParsed(parsedResult);
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

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

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

  const splitLayout = mode !== "graph";

  return (
    <div className={splitLayout ? "lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-6 lg:space-y-0" : "space-y-6"}>
      <div className={splitLayout ? "space-y-6 min-w-0" : "space-y-6"}>
      <Card className="border-border/50 shadow-lg">
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
      </div>

      {splitLayout && activeExpr && !result?.error && (
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
