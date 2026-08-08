import { useState, useEffect , useCallback } from "react";
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
  solveDoubleIntegral,
  generateGraphPoints,
} from "@/lib/math-solver";
import { GraphCanvas } from "./GraphCanvas";
import { StepsReveal } from "./StepsReveal";
import type { MathResult } from "@/lib/math-solver";
import { ArrowRight, Infinity as InfinityIcon } from "lucide-react";
import { MathText } from "./MathText";
import { LaTeXExportButton } from "./LaTeXExportButton";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";

export function IntegrationSolver() {
  const settings = useSettings();
  const [expr, setExpr] = useState("x^2");
  const [variable, setVariable] = useState("x");
  const [lower, setLower] = useState("0");
  const [upper, setUpper] = useState("1");
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [showGraph, setShowGraph] = useState(settings.alwaysShowGraphs);
  const [mode, setMode] = useState<"definite" | "indefinite" | "double">("definite");
  const [result, setResult] = useState<MathResult | null>(null);

  const [varY, setVarY] = useState("y");
  const [yLower, setYLower] = useState("0");
  const [yUpper, setYUpper] = useState("1");

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);
  useEffect(() => setShowGraph(settings.alwaysShowGraphs), [settings.alwaysShowGraphs]);

  const solve = useCallback(() => {
    if (mode === "definite") {
      setResult(solveDefiniteIntegral(expr, variable, parseFloat(lower), parseFloat(upper)));
    } else if (mode === "indefinite") {
      setResult(solveIndefiniteIntegral(expr, variable));
    } else {
      setResult(solveDoubleIntegral(
        expr, variable, varY,
        parseFloat(lower), parseFloat(upper),
        parseFloat(yLower), parseFloat(yUpper)
      ));
    }
  }, [mode, expr, variable, lower, upper, varY, yLower, yUpper]);

  useAutoRun([expr, variable, lower, upper, mode, varY, yLower, yUpper], solve, settings.autoCalculate);

  const points = showGraph && mode !== "double" ? generateGraphPoints(expr, variable, -settings.defaultGraphRange, settings.defaultGraphRange) : [];

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <InfinityIcon className="h-5 w-5 text-primary" />
            Integration Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="definite" className="flex-1">Definite ∫ₐᵇ</TabsTrigger>
              <TabsTrigger value="indefinite" className="flex-1">Indefinite ∫</TabsTrigger>
              <TabsTrigger value="double" className="flex-1">Double ∬</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label>{mode === "double" ? "Integrand f(x, y)" : "Integrand f(x)"}</Label>
            <MathInput
              value={expr}
              onChange={setExpr}
              placeholder={mode === "double" ? "e.g. x^2 + y^2" : "e.g. x^2, sin(x)"}
              onEnter={solve}
            />
          </div>

          {mode === "double" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Variable 1</Label>
                  <Input value={variable} onChange={(e) => setVariable(e.target.value)} className="font-mono text-center" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Variable 2</Label>
                  <Input value={varY} onChange={(e) => setVarY(e.target.value)} className="font-mono text-center" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{variable} lower</Label>
                  <Input value={lower} onChange={(e) => setLower(e.target.value)} className="font-mono text-center" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{variable} upper</Label>
                  <Input value={upper} onChange={(e) => setUpper(e.target.value)} className="font-mono text-center" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{varY} lower</Label>
                  <Input value={yLower} onChange={(e) => setYLower(e.target.value)} className="font-mono text-center" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{varY} upper</Label>
                  <Input value={yUpper} onChange={(e) => setYUpper(e.target.value)} className="font-mono text-center" />
                </div>
              </div>
            </>
          ) : (
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
          )}

          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showSteps} onCheckedChange={setShowSteps} />
              Step-by-step
            </label>
            {mode !== "double" && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={showGraph} onCheckedChange={setShowGraph} />
                Show Graph
              </label>
            )}
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
                    <div className="text-xl font-mono font-semibold text-foreground">
                      {mode === "definite"
                        ? <MathText text={`∫ from ${lower} to ${upper} = ${result.numericResult !== undefined ? formatNumber(result.numericResult, settings) : result.result}`} />
                        : mode === "double"
                        ? <MathText text={`∬ = ${result.numericResult !== undefined ? formatNumber(result.numericResult, settings) : result.result}`} />
                        : <MathText text={`∫ f(x) dx = ${result.result}`} />}
                    </div>
                  </div>

                  <StepsReveal steps={result.steps} show={showSteps} resetKey={result.result} />
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {showGraph && mode !== "double" && points.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="shadow-lg border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Graph of f(x)</CardTitle>
            </CardHeader>
            <CardContent>
              <GraphCanvas series={[{ expr, points }]} xMin={-settings.defaultGraphRange} xMax={settings.defaultGraphRange} />
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
