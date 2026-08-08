import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Binary, ArrowLeftRight } from "lucide-react";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function subscript(n: number): string {
  const map: Record<string, string> = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉" };
  return n.toString().split("").map(d => map[d] ?? d).join("");
}

function isValidForBase(value: string, base: number): boolean {
  let v = value.trim().toUpperCase();
  if (!v) return false;
  if (v.startsWith("-")) v = v.slice(1);
  if (!v) return false;
  for (const ch of v) {
    const idx = DIGITS.indexOf(ch);
    if (idx === -1 || idx >= base) return false;
  }
  return true;
}

function toDecimal(value: string, base: number): number {
  return parseInt(value.trim().toUpperCase(), base);
}

function fromDecimal(value: number, base: number): string {
  if (value === 0) return "0";
  const sign = value < 0 ? "-" : "";
  return sign + Math.abs(value).toString(base).toUpperCase();
}

const COMMON_BASES = [
  { base: 2, name: "Binary" },
  { base: 8, name: "Octal" },
  { base: 10, name: "Decimal" },
  { base: 16, name: "Hexadecimal" },
];

export function NumberConversions() {
  const settings = useSettings();
  const [value, setValue] = useState("42");
  const [fromBase, setFromBase] = useState("10");
  const [toBase, setToBase] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [allResults, setAllResults] = useState<Record<number, string> | null>(null);
  const [custom, setCustom] = useState<{ decimal: number; result: string; steps: string[] } | null>(null);

  const convert = () => {
    const fb = parseInt(fromBase);
    const tb = parseInt(toBase);

    if (!isValidForBase(value, fb)) {
      setError(`"${value}" has digits invalid for base ${fb}`);
      setAllResults(null);
      setCustom(null);
      return;
    }
    setError(null);

    const decimalValue = toDecimal(value, fb);

    const results: Record<number, string> = {};
    for (const { base } of COMMON_BASES) results[base] = fromDecimal(decimalValue, base);
    setAllResults(results);

    const isNegative = decimalValue < 0;
    const absDecimal = Math.abs(decimalValue);
    const magnitudeStr = value.trim().toUpperCase().replace(/^-/, "");

    const steps: string[] = [];
    if (isNegative) steps.push(`Note: value is negative — converting the magnitude, then re-applying the sign.`);

    if (fb !== 10) {
      steps.push(`Step 1 — Convert ${magnitudeStr} (base ${fb}) to decimal:`);
      const digits = magnitudeStr.split("");
      const terms = digits.map((d, i) => {
        const power = digits.length - 1 - i;
        const digitVal = DIGITS.indexOf(d);
        return `${digitVal}×${fb}${superscriptLike(power)}`;
      });
      steps.push(`= ${terms.join(" + ")} = ${absDecimal}₁₀${isNegative ? "  →  " + decimalValue + "₁₀" : ""}`);
    } else {
      steps.push(`Step 1 — Value is already in decimal: ${decimalValue}`);
    }

    if (tb !== 10) {
      steps.push(`Step 2 — Convert ${absDecimal} (decimal) to base ${tb} using repeated division:`);
      let n = absDecimal;
      const divisionSteps: string[] = [];
      if (n === 0) divisionSteps.push(`0 ÷ ${tb} = 0 remainder 0`);
      while (n > 0) {
        const r = n % tb;
        const q = Math.floor(n / tb);
        divisionSteps.push(`${n} ÷ ${tb} = ${q} remainder ${DIGITS[r]}`);
        n = q;
      }
      steps.push(...divisionSteps);
      steps.push(`Reading remainders bottom-to-top: ${fromDecimal(decimalValue, tb)}${subscript(tb)}`);
    } else {
      steps.push(`Step 2 — Target base is decimal, result = ${decimalValue}`);
    }

    setCustom({ decimal: decimalValue, result: fromDecimal(decimalValue, tb), steps });
  };

  useAutoRun([value, fromBase, toBase], convert, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Binary className="h-5 w-5 text-primary" />
            Number System Conversions
          </CardTitle>
          <p className="text-xs text-muted-foreground">Convert between binary, octal, decimal, hexadecimal — or any base from 2 to 36.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Number</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 42, 1010, FF"
              className="font-mono text-center text-lg"
              onKeyDown={(e) => e.key === "Enter" && convert()}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">From base</Label>
              <Select value={fromBase} onValueChange={setFromBase}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 35 }, (_, i) => i + 2).map((b) => (
                    <SelectItem key={b} value={b.toString()}>
                      Base {b}{COMMON_BASES.find((c) => c.base === b) ? ` (${COMMON_BASES.find((c) => c.base === b)!.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To base</Label>
              <Select value={toBase} onValueChange={setToBase}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 35 }, (_, i) => i + 2).map((b) => (
                    <SelectItem key={b} value={b.toString()}>
                      Base {b}{COMMON_BASES.find((c) => c.base === b) ? ` (${COMMON_BASES.find((c) => c.base === b)!.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={convert} className="w-full gap-2">
            <ArrowLeftRight className="h-4 w-4" /> Convert
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/20">
          <CardContent className="pt-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {!error && custom && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="border-primary/20 shadow-lg">
            <CardContent className="pt-6 space-y-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 text-center">
                <div className="text-xs text-muted-foreground mb-1">Result</div>
                <div className="text-2xl font-mono font-bold text-foreground">
                  {value}{subscript(parseInt(fromBase))} = {custom.result}{subscript(parseInt(toBase))}
                </div>
              </div>
              <StepsReveal steps={custom.steps} show={settings.showSteps} resetKey={custom.result} />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!error && allResults && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <Card className="shadow-lg border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Common base equivalents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {COMMON_BASES.map(({ base, name }) => (
                  <div key={base} className="p-3 rounded-lg bg-muted/50 border border-border/30 text-center">
                    <div className="text-xs text-muted-foreground">{name}</div>
                    <div className="text-base font-mono font-semibold break-all">{allResults[base]}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function superscriptLike(n: number): string {
  const map: Record<string, string> = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","-":"⁻" };
  return n.toString().split("").map(d => map[d] ?? d).join("");
}
