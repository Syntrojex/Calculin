import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  solveDefiniteIntegral,
  solveIndefiniteIntegral,
  validateGraphExpression,
} from "@/lib/math-solver";
import { FunctionGraph, type PlotShade } from "./FunctionGraph";
import { StepsReveal } from "./StepsReveal";
import type { MathResult } from "@/lib/math-solver";
import { ArrowRight, Infinity as InfinityIcon } from "lucide-react";
import { MathText } from "./MathText";
import { ResultMath } from "./ResultMath";
import { LaTeXExportButton } from "./LaTeXExportButton";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { exprToLatex } from "@/lib/latex";
import { parseNumericInput } from "@/lib/expression-clean";

/** Strips the trailing "+ C" from an indefinite-integral result so it can be
 *  plotted as a concrete function (C = 0, i.e. one representative member of
 *  the family of antiderivatives). */
function stripConstantOfIntegration(result: string): string {
  return result.replace(/\s*\+\s*C\s*$/, "").trim();
}

export function IntegrationSolver() {
  const settings = useSettings();
  const [expr, setExpr] = useState("x^2");
  const [variable, setVariable] = useState("x");
  const [lower, setLower] = useState("0");
  const [upper, setUpper] = useState("1");
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [mode, setMode] = useState<"definite" | "indefinite">("definite");
  const [result, setResult] = useState<MathResult | null>(null);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const solve = useCallback(() => {
    if (mode === "definite") {
      setResult(
        solveDefiniteIntegral(expr, variable, parseNumericInput(lower), parseNumericInput(upper), 1000, settings, { lower, upper }),
      );
    } else {
      setResult(solveIndefiniteIntegral(expr, variable));
    }
  }, [mode, expr, variable, lower, upper, settings]);

  useAutoRun([expr, variable, lower, upper, mode, settings.numberForm, settings.decimalPlaces], solve, settings.autoCalculate);

  // Graphs are no longer behind a toggle — they're generated automatically
  // whenever the expression (and result, for the antiderivative graph) can
  // actually be plotted.
  const R = settings.defaultGraphRange;
  const graphProblem = validateGraphExpression(expr, variable, -R, R);

  const antiderivativeExpr = mode === "indefinite" && result && !result.error ? stripConstantOfIntegration(result.result) : "";
  const antiderivativeProblem = antiderivativeExpr ? validateGraphExpression(antiderivativeExpr, variable, -R, R) : "none";

  // Definite integral: show the area between the bounds, with the window sized to fit them.
  const lo = parseNumericInput(lower);
  const hi = parseNumericInput(upper);
  let definiteRange: [number, number] | undefined;
  let shades: PlotShade[] | undefined;
  if (mode === "definite" && !Number.isNaN(lo) && !Number.isNaN(hi)) {
    const aFin = Number.isFinite(lo), bFin = Number.isFinite(hi);
    if (aFin && bFin) {
      const a = Math.min(lo, hi), b = Math.max(lo, hi);
      const pad = Math.max((b - a) * 0.35, 1);
      definiteRange = [a - pad, b + pad];
      shades = [{ seriesIndex: 0, from: a, to: b }];
    } else if (aFin || bFin) {
      const fin = aFin ? lo : hi;
      definiteRange = aFin ? [fin - 4, fin + 12] : [fin - 12, fin + 4];
      shades = [{ seriesIndex: 0, from: aFin ? fin : fin - 1e4, to: aFin ? fin + 1e4 : fin }];
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
      <div className="space-y-6 min-w-0">
        <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <InfinityIcon className="h-5 w-5 text-primary" />
            Integration Calculator
          </CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); solve(); }
          }}
        >
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="definite" className="flex-1">Definite ∫ₐᵇ</TabsTrigger>
              <TabsTrigger value="indefinite" className="flex-1">Indefinite ∫</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label>Integrand f(x)</Label>
            <MathInput
              value={expr}
              onChange={setExpr}
              placeholder="e.g. x^2, sin(x)"
              onEnter={solve}
            />
          </div>

          <div className="flex gap-4">
            <div className="space-y-2 w-24">
              <Label>Variable</Label>
              <Input value={variable} onChange={(e) => setVariable(e.target.value)} className="font-mono text-center" />
            </div>
            {mode === "definite" && (
              <>
                <div className="space-y-2 flex-1">
                  <Label>Lower (a)</Label>
                  <Input value={lower} onChange={(e) => setLower(e.target.value)} className="font-mono text-center" />
                </div>
                <div className="space-y-2 flex-1">
                  <Label>Upper (b)</Label>
                  <Input value={upper} onChange={(e) => setUpper(e.target.value)} className="font-mono text-center" />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showSteps} onCheckedChange={setShowSteps} />
              Step-by-step
            </label>
          </div>

          {!settings.autoCalculate && (
            <Button onClick={solve} className="w-full gap-2">
              <ArrowRight className="h-4 w-4" />
              Solve Integral
            </Button>
          )}
        </CardContent>
        </Card>

        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="border-primary/20 shadow-lg">
              <CardContent className="pt-6 space-y-4">
                {result.error ? (
                  <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {result.error}
                  </div>
                ) : (
                  <>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-muted-foreground">Result:</div>
                        <LaTeXExportButton text={result.result} />
                      </div>
                      {mode === "indefinite" ? (
                        <ResultMath
                          prefix={`\\int ${exprToLatex(expr)}\\,d${variable}`}
                          expr={result.result}
                          className="text-xl font-semibold text-foreground"
                        />
                      ) : (
                        <div className="text-xl font-mono font-semibold text-foreground">
                          <MathText
                            text={`∫ from ${lower.trim() || "?"} to ${upper.trim() || "?"} = ${
                              result.exactText ? `${result.exactText} ≈ ` : ""
                            }${result.numericResult !== undefined ? formatNumber(result.numericResult, settings) : result.result}`}
                          />
                        </div>
                      )}
                    </div>

                    <StepsReveal steps={result.steps} show={showSteps} resetKey={result.result} />
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 min-w-0">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
          <Card className="shadow-lg border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {mode === "definite" && shades ? `Area under f(${variable})` : `Graph of f(${variable})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {graphProblem ? (
                <p className="text-sm text-muted-foreground">{graphProblem}</p>
              ) : (
                <FunctionGraph
                  series={[{ expr, label: `f(${variable})` }]}
                  variable={variable}
                  xRange={definiteRange ?? [-R, R]}
                  shades={shades}
                />
              )}
              {mode === "definite" && shades && (
                <p className="mt-2 text-[11px] text-muted-foreground">Green = area above the axis (positive), red = below (negative).</p>
              )}
            </CardContent>
          </Card>

          {mode === "indefinite" && antiderivativeExpr && (
            <Card className="shadow-lg border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Graph of Antiderivative F({variable}) (with C = 0)</CardTitle>
              </CardHeader>
              <CardContent>
                {antiderivativeProblem ? (
                  <p className="text-sm text-muted-foreground">{antiderivativeProblem}</p>
                ) : (
                  <FunctionGraph series={[{ expr: antiderivativeExpr, label: `F(${variable})`, color: "#10b981" }]} variable={variable} xRange={[-R, R]} />
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}
