import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  solvePartialDerivative,
  solveExtrema1D,
  solveExtrema2D,
} from "@/lib/math-solver";
import type { MathResult } from "@/lib/math-solver";
import { TrendingUp, ArrowRight } from "lucide-react";
import { MathText } from "./MathText";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";

type Mode = "partial" | "extrema1d" | "extrema2d";

export function CalculusPlus() {
  const settings = useSettings();
  const [mode, setMode] = useState<Mode>("partial");
  const [expr, setExpr] = useState("x^2 + y^2");
  const [varX, setVarX] = useState("x");
  const [varY, setVarY] = useState("y");
  const [wrt, setWrt] = useState("x");
  const [xMin, setXMin] = useState("-10");
  const [xMax, setXMax] = useState("10");
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [result, setResult] = useState<MathResult | null>(null);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const solve = () => {
    if (mode === "partial") {
      setResult(solvePartialDerivative(expr, wrt, [varX, varY]));
    } else if (mode === "extrema1d") {
      setResult(solveExtrema1D(expr, varX, parseFloat(xMin), parseFloat(xMax)));
    } else {
      setResult(solveExtrema2D(expr, varX, varY, 10));
    }
  };

  useAutoRun([mode, expr, varX, varY, wrt, xMin, xMax], solve, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Calculus+ — Partial Derivatives & Extrema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="partial" className="flex-1">∂f/∂x</TabsTrigger>
              <TabsTrigger value="extrema1d" className="flex-1">Max/Min f(x)</TabsTrigger>
              <TabsTrigger value="extrema2d" className="flex-1">Max/Min f(x,y)</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label>
              {mode === "extrema1d" ? "Function f(x)" : "Function f(x, y)"}
            </Label>
            <MathInput
              value={expr}
              onChange={setExpr}
              placeholder={mode === "extrema1d" ? "e.g. x^3 - 3*x" : "e.g. x^2 + y^2 - 4*x"}
              onEnter={solve}
            />
          </div>

          {mode === "partial" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Var 1</Label>
                <Input value={varX} onChange={(e) => setVarX(e.target.value)} className="font-mono text-center" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Var 2</Label>
                <Input value={varY} onChange={(e) => setVarY(e.target.value)} className="font-mono text-center" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">∂ w.r.t.</Label>
                <Input value={wrt} onChange={(e) => setWrt(e.target.value)} className="font-mono text-center" />
              </div>
            </div>
          )}

          {mode === "extrema1d" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Variable</Label>
                <Input value={varX} onChange={(e) => setVarX(e.target.value)} className="font-mono text-center" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">x min</Label>
                <Input value={xMin} onChange={(e) => setXMin(e.target.value)} className="font-mono text-center" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">x max</Label>
                <Input value={xMax} onChange={(e) => setXMax(e.target.value)} className="font-mono text-center" />
              </div>
            </div>
          )}

          {mode === "extrema2d" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Variable 1</Label>
                <Input value={varX} onChange={(e) => setVarX(e.target.value)} className="font-mono text-center" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Variable 2</Label>
                <Input value={varY} onChange={(e) => setVarY(e.target.value)} className="font-mono text-center" />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showSteps} onCheckedChange={setShowSteps} />
            Step-by-step
          </label>

          {!settings.autoCalculate && (
            <Button onClick={solve} className="w-full gap-2">
              <ArrowRight className="h-4 w-4" /> Solve
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-primary/20 shadow-lg">
          <CardContent className="pt-6 space-y-4">
            {result.error ? (
              <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">{result.error}</div>
            ) : (
              <>
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="text-sm text-muted-foreground mb-1">Result:</div>
                  <div className="text-lg font-mono font-semibold text-foreground">
                    <MathText text={result.result} />
                  </div>
                </div>

                <StepsReveal steps={result.steps} show={showSteps} resetKey={result.result} />
              </>
            )}
          </CardContent>
        </Card>
        </motion.div>
      )}
    </div>
  );
}
