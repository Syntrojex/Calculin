import { useState, useEffect , useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { solveDerivative, solveNthDerivative, generateGraphPoints } from "@/lib/math-solver";
import { GraphCanvas } from "./GraphCanvas";
import { StepsReveal } from "./StepsReveal";
import type { MathResult } from "@/lib/math-solver";
import { ArrowRight, Sparkles } from "lucide-react";
import { MathText } from "./MathText";
import { LaTeXExportButton } from "./LaTeXExportButton";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";

export function DerivativeSolver() {
  const settings = useSettings();
  const [expr, setExpr] = useState("x^3 + 2*x^2 - 5*x + 3");
  const [variable, setVariable] = useState("x");
  const [order, setOrder] = useState(1);
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [showGraph, setShowGraph] = useState(settings.alwaysShowGraphs);
  const [result, setResult] = useState<MathResult | null>(null);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);
  useEffect(() => setShowGraph(settings.alwaysShowGraphs), [settings.alwaysShowGraphs]);

  const solve = useCallback(() => {
    const res = order === 1
      ? solveDerivative(expr, variable)
      : solveNthDerivative(expr, variable, order);
    setResult(res);
  }, [expr, variable, order]);

  useAutoRun([expr, variable, order], solve, settings.autoCalculate);

  const originalPoints = showGraph ? generateGraphPoints(expr, variable, -settings.defaultGraphRange, settings.defaultGraphRange) : [];
  const derivPoints = showGraph && result && !result.error
    ? generateGraphPoints(result.result, variable, -settings.defaultGraphRange, settings.defaultGraphRange)
    : [];

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Derivative Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Function f(x)</Label>
            <MathInput
              value={expr}
              onChange={setExpr}
              placeholder="e.g. x^3 + 2*x^2 - 5*x + 3"
              onEnter={solve}
            />
          </div>

          <div className="flex gap-4">
            <div className="space-y-2 w-24">
              <Label>Variable</Label>
              <Input
                value={variable}
                onChange={(e) => setVariable(e.target.value)}
                className="font-mono text-center"
              />
            </div>
            <div className="space-y-2 w-24">
              <Label>Order</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={order}
                onChange={(e) => setOrder(parseInt(e.target.value) || 1)}
                className="text-center"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showSteps} onCheckedChange={setShowSteps} />
              Step-by-step
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showGraph} onCheckedChange={setShowGraph} />
              Show Graph
            </label>
            {settings.autoCalculate && (
              <span className="text-xs text-muted-foreground italic">Auto-calculating as you type…</span>
            )}
          </div>

          {!settings.autoCalculate && (
            <Button onClick={solve} className="w-full gap-2">
              <ArrowRight className="h-4 w-4" />
              Solve Derivative
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
                    <div className="text-xl font-mono font-semibold text-foreground">
                      f{"'".repeat(order)}({variable}) = <MathText text={result.result} />
                    </div>
                  </div>

                  <StepsReveal steps={result.steps} show={showSteps} resetKey={result.result} />
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {showGraph && originalPoints.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
          <Card className="shadow-lg border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Original Function</CardTitle>
            </CardHeader>
            <CardContent>
              <GraphCanvas series={[{ expr, points: originalPoints }]} xMin={-settings.defaultGraphRange} xMax={settings.defaultGraphRange} />
            </CardContent>
          </Card>

          {derivPoints.length > 0 && (
            <Card className="shadow-lg border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Derivative</CardTitle>
              </CardHeader>
              <CardContent>
                <GraphCanvas
                  series={[{ expr: result?.result || "", points: derivPoints }]}
                  xMin={-settings.defaultGraphRange}
                  xMax={settings.defaultGraphRange}
                />
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </div>
  );
}
