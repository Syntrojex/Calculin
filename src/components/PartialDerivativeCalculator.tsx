import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { solvePartialDerivative } from "@/lib/math-solver";
import type { MathResult } from "@/lib/math-solver";
import { PieChart, ArrowRight } from "lucide-react";
import { ResultMath } from "./ResultMath";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";

export function PartialDerivativeCalculator() {
  const settings = useSettings();
  const [expr, setExpr] = useState("x^2 + y^2");
  const [varX, setVarX] = useState("x");
  const [varY, setVarY] = useState("y");
  const [wrt, setWrt] = useState("x");
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [result, setResult] = useState<MathResult | null>(null);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const solve = () => setResult(solvePartialDerivative(expr, wrt, [varX, varY]));

  useAutoRun([expr, varX, varY, wrt, settings.numberForm, settings.decimalPlaces], solve, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <PieChart className="h-5 w-5 text-primary" />
            Partial Derivative
          </CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); solve(); }
          }}
        >
          <div className="space-y-2">
            <Label>Function f(x, y)</Label>
            <MathInput value={expr} onChange={setExpr} placeholder="e.g. x^2 + y^2 - 4*x" onEnter={solve} />
          </div>

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
                    <ResultMath
                      prefix={`\\frac{\\partial f}{\\partial ${wrt}}`}
                      expr={result.result}
                      className="text-lg font-semibold text-foreground"
                    />
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
