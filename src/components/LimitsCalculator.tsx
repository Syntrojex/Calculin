import { useState, useEffect , useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { evaluate } from "mathjs";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";

interface LimitResult {
  value: string;
  steps: string[];
  error?: string;
  /** Raw numeric value (when the limit is a finite number) so the UI can
   *  apply the user's Decimal/Fraction/Scientific display setting instead
   *  of an always-decimal fixed string. */
  numericValue?: number;
}

function computeLimit(expr: string, variable: string, approaching: string, fmt: (n: number) => string): LimitResult {
  try {
    if (!expr || !expr.trim()) {
      return { value: "", steps: [], error: "Please enter a function." };
    }
    if (!variable || !variable.trim()) {
      return { value: "", steps: [], error: "Please enter a variable name." };
    }
    const steps: string[] = [];
    steps.push(`Find: lim(${variable}→${approaching}) ${expr}`);

    let target: number;
    if (approaching === "Infinity" || approaching === "inf" || approaching === "∞") {
      target = Infinity;
    } else if (approaching === "-Infinity" || approaching === "-inf" || approaching === "-∞") {
      target = -Infinity;
    } else {
      try {
        const v = evaluate(approaching);
        target = typeof v === "number" ? v : NaN;
      } catch {
        target = NaN;
      }
    }

    if (isNaN(target)) {
      return { value: "", steps: [], error: "Invalid approach value — use a number, an expression like pi/2, or Infinity" };
    }

    // Numerical approach from both sides
    const scope: Record<string, number> = {};

    if (isFinite(target)) {
      // Approach from left and right
      const deltas = [0.1, 0.01, 0.001, 0.0001, 0.00001];
      const leftVals: number[] = [];
      const rightVals: number[] = [];

      steps.push(`Numerical approach from both sides:`);

      for (const d of deltas) {
        scope[variable] = target - d;
        const lv = evaluate(expr, scope) as number;
        leftVals.push(lv);

        scope[variable] = target + d;
        const rv = evaluate(expr, scope) as number;
        rightVals.push(rv);
      }

      steps.push(`  Left:  ${leftVals.map(v => fmt(v)).join(" → ")}`);
      steps.push(`  Right: ${rightVals.map(v => fmt(v)).join(" → ")}`);

      const leftLimit = leftVals[leftVals.length - 1];
      const rightLimit = rightVals[rightVals.length - 1];

      if (!isFinite(leftLimit) && !isFinite(rightLimit)) {
        if (leftLimit === rightLimit) {
          steps.push(`Both sides → ${leftLimit > 0 ? "+∞" : "-∞"}`);
          return { value: leftLimit > 0 ? "+∞" : "-∞", steps };
        }
        steps.push(`Left → ${leftLimit > 0 ? "+∞" : "-∞"}, Right → ${rightLimit > 0 ? "+∞" : "-∞"}`);
        return { value: "DNE (Does Not Exist)", steps };
      }

      if (Math.abs(leftLimit - rightLimit) < 0.001) {
        const avg = (leftLimit + rightLimit) / 2;
        const rounded = Math.abs(avg - Math.round(avg)) < 0.0001 ? Math.round(avg) : parseFloat(avg.toFixed(6));
        steps.push(`Left limit ≈ Right limit ≈ ${fmt(rounded)}`);
        steps.push(`∴ Limit exists = ${fmt(rounded)}`);
        return { value: rounded.toString(), steps, numericValue: rounded };
      } else {
        steps.push(`Left limit (${fmt(leftLimit)}) ≠ Right limit (${fmt(rightLimit)})`);
        return { value: "DNE (Does Not Exist)", steps };
      }
    } else {
      // Infinity approach
      const vals = target > 0 ? [10, 100, 1000, 10000, 100000] : [-10, -100, -1000, -10000, -100000];
      const results: number[] = [];

      for (const v of vals) {
        scope[variable] = v;
        results.push(evaluate(expr, scope) as number);
      }

      steps.push(`Values as ${variable} → ${approaching}:`);
      steps.push(`  ${vals.map((v, i) => `f(${v})=${fmt(results[i])}`).join(", ")}`);

      const last = results[results.length - 1];
      const secondLast = results[results.length - 2];

      if (!isFinite(last)) {
        return { value: last > 0 ? "+∞" : "-∞", steps: [...steps, `Limit = ${last > 0 ? "+∞" : "-∞"}`] };
      }

      if (Math.abs(last - secondLast) < 0.01) {
        const rounded = parseFloat(last.toFixed(6));
        steps.push(`Converges to ${fmt(rounded)}`);
        return { value: rounded.toString(), steps, numericValue: rounded };
      }

      steps.push(`Limit ≈ ${fmt(last)}`);
      return { value: last.toFixed(6), steps, numericValue: last };
    }
  } catch (e: unknown) {
    return { value: "", steps: [], error: e instanceof Error ? e.message : "Error" };
  }
}

export function LimitsCalculator() {
  const settings = useSettings();
  const [expr, setExpr] = useState("sin(x)/x");
  const [variable, setVariable] = useState("x");
  const [approaching, setApproaching] = useState("0");
  const [result, setResult] = useState<LimitResult | null>(null);
  const [showSteps, setShowSteps] = useState(settings.showSteps);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const solve = useCallback(
    () => setResult(computeLimit(expr, variable, approaching, (n) => formatNumber(n, settings))),
    [expr, variable, approaching, settings]
  );

  useAutoRun([expr, variable, approaching, settings.numberForm, settings.decimalPlaces], solve, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowRight className="h-5 w-5 text-primary" />
            Limits Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Function f(x)</Label>
            <MathInput value={expr} onChange={setExpr} placeholder="e.g. sin(x)/x" onEnter={solve} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Variable</Label>
              <Input value={variable} onChange={(e) => setVariable(e.target.value)} className="text-center font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Approaching (e.g. 0, pi, Infinity)</Label>
              <Input value={approaching} onChange={(e) => setApproaching(e.target.value)} className="text-center font-mono" onKeyDown={(e) => e.key === "Enter" && solve()} />
            </div>
          </div>
          {!settings.autoCalculate && (
            <Button onClick={solve} className="w-full gap-2">
              <ArrowRight className="h-4 w-4" /> Calculate Limit
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
                <Badge variant="secondary" className="text-base font-mono px-3 py-1">
                  lim = {result.numericValue !== undefined ? formatNumber(result.numericValue, settings) : result.value}
                </Badge>
                <StepsReveal steps={result.steps} show={showSteps} resetKey={result.value} title="Steps:" />
                <Button variant="ghost" size="sm" onClick={() => setShowSteps((v) => !v)} className="text-xs">
                  {showSteps ? "Hide" : "Show"} Steps
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        </motion.div>
      )}
    </div>
  );
}
