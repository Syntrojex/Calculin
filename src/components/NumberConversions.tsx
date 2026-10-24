import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Binary, ArrowLeftRight, Calculator } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function subscript(n: number): string {
  const map: Record<string, string> = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉" };
  return n.toString().split("").map(d => map[d] ?? d).join("");
}

export function isValidForBase(value: string, base: number): boolean {
  let v = value.trim().toUpperCase();
  if (!v) return false;
  if (v.startsWith("-")) v = v.slice(1);
  if (!v || (v.match(/\./g) ?? []).length > 1 || v === ".") return false;
  for (const ch of v) {
    if (ch === ".") continue;
    const idx = DIGITS.indexOf(ch);
    if (idx === -1 || idx >= base) return false;
  }
  return true;
}

/** Integer part kept as a string (BigInt later, so long binaries don't lose precision) + fractional digits. */
function splitParts(value: string): { neg: boolean; int: string; frac: string } {
  let v = value.trim().toUpperCase();
  const neg = v.startsWith("-");
  if (neg) v = v.slice(1);
  const [i, f = ""] = v.split(".");
  return { neg, int: i === "" ? "0" : i, frac: f };
}

function bigFromDigits(digits: string, base: number): bigint {
  let r = 0n;
  const B = BigInt(base);
  for (const ch of digits) r = r * B + BigInt(DIGITS.indexOf(ch));
  return r;
}

export function toDecimal(value: string, base: number): number {
  const { neg, int, frac } = splitParts(value);
  let r = Number(bigFromDigits(int, base));
  for (let k = 0; k < frac.length; k++) r += DIGITS.indexOf(frac[k]) / Math.pow(base, k + 1);
  return neg ? -r : r;
}

const FRAC_DIGITS = 12;

export function fromDecimal(value: number, base: number): string {
  if (value === 0) return "0";
  const neg = value < 0;
  const abs = Math.abs(value);
  const ip = Math.floor(abs);
  let out = BigInt(ip).toString(base).toUpperCase();
  let f = abs - ip;
  if (f > 1e-12) {
    let digits = "";
    for (let k = 0; k < FRAC_DIGITS && f > 1e-12; k++) {
      f *= base;
      const d = Math.floor(f + 1e-9);
      digits += DIGITS[d];
      f -= d;
    }
    out += "." + digits;
  }
  return (neg ? "-" : "") + out;
}

const COMMON_BASES = [
  { base: 2, name: "Binary" },
  { base: 8, name: "Octal" },
  { base: 10, name: "Decimal" },
  { base: 16, name: "Hexadecimal" },
];

type ArithOp = "add" | "subtract" | "multiply" | "divide";
const ARITH_OPS: { op: ArithOp; label: string; symbol: string }[] = [
  { op: "add", label: "Add", symbol: "+" },
  { op: "subtract", label: "Subtract", symbol: "−" },
  { op: "multiply", label: "Multiply", symbol: "×" },
  { op: "divide", label: "Divide", symbol: "÷" },
];

interface ArithResult {
  result: string;
  steps: string[];
  error?: string;
}

/**
 * Arithmetic is only performed when both numbers are given in the SAME
 * base (hex+hex, binary+binary, ...) — by design, not as a limitation:
 * mixing bases directly in one operation (e.g. "hex + binary") is asking
 * this calculator to silently guess which base the answer should come back
 * in, and that ambiguity is exactly what should surface as a clear error
 * instead of a guessed result. To combine numbers from different bases,
 * convert one of them first using the Convert tab, then do the arithmetic
 * here in a shared base.
 */
function performBaseArithmetic(aStr: string, bStr: string, baseA: number, baseB: number, op: ArithOp): ArithResult {
  if (baseA !== baseB) {
    return {
      result: "", steps: [],
      error: `Both numbers need to be in the same number system to do arithmetic directly (e.g. hex + hex, not hex + binary). Convert one of them first using the Convert tab, then try again.`,
    };
  }
  const base = baseA;
  if (!isValidForBase(aStr, base)) return { result: "", steps: [], error: `"${aStr}" has digits invalid for base ${base}` };
  if (!isValidForBase(bStr, base)) return { result: "", steps: [], error: `"${bStr}" has digits invalid for base ${base}` };

  const aDec = toDecimal(aStr, base);
  const bDec = toDecimal(bStr, base);
  const opInfo = ARITH_OPS.find((o) => o.op === op)!;
  const opLatex = op === "add" ? "+" : op === "subtract" ? "-" : op === "multiply" ? "\\times" : "\\div";
  const aClean = aStr.trim().toUpperCase();
  const bClean = bStr.trim().toUpperCase();

  const steps: string[] = [];
  steps.push(`##Given\n$$${aClean}_{${base}} \\;${opLatex}\\; ${bClean}_{${base}}$$`);
  steps.push(`##Convert Both to Decimal\n$$${aClean}_{${base}} = ${aDec}_{10}, \\qquad ${bClean}_{${base}} = ${bDec}_{10}$$`);

  if (op === "divide" && bDec === 0) {
    return { result: "", steps, error: "Division by zero is not allowed." };
  }

  let resultDec: number;
  let remainder: number | null = null;
  if (op === "add") resultDec = aDec + bDec;
  else if (op === "subtract") resultDec = aDec - bDec;
  else if (op === "multiply") resultDec = aDec * bDec;
  else {
    resultDec = Math.trunc(aDec / bDec);
    remainder = aDec % bDec;
  }

  steps.push(`##Operate in Decimal\n$$${aDec} \\;${opLatex}\\; ${bDec} = ${
    op === "divide" ? `${resultDec}\\text{ remainder }${remainder}` : resultDec
  }$$`);

  const resultBase = fromDecimal(resultDec, base);
  const remainderBase = remainder !== null ? fromDecimal(remainder, base) : null;
  steps.push(`##Back to Base ${base}\n$$${resultDec}_{10} = ${resultBase}_{${base}}${remainderBase !== null ? `, \\qquad \\text{remainder } ${remainder}_{10} = ${remainderBase}_{${base}}` : ""}$$`);

  return {
    result: remainderBase !== null ? `${resultBase} remainder ${remainderBase}` : resultBase,
    steps,
  };
}

export function NumberConversions() {
  const settings = useSettings();
  const [mode, setMode] = useState<"convert" | "arithmetic">("convert");

  const [value, setValue] = useState("42");
  const [fromBase, setFromBase] = useState("10");
  const [toBase, setToBase] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [allResults, setAllResults] = useState<Record<number, string> | null>(null);
  const [custom, setCustom] = useState<{ decimal: number; result: string; steps: string[] } | null>(null);

  const [arithA, setArithA] = useState("1010");
  const [arithB, setArithB] = useState("11");
  const [arithBaseA, setArithBaseA] = useState("2");
  const [arithBaseB, setArithBaseB] = useState("2");
  const [arithOp, setArithOp] = useState<ArithOp>("add");
  const [arithResult, setArithResult] = useState<ArithResult | null>(null);

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
    const { int: intStr, frac: fracStr } = splitParts(value);
    const magnitudeStr = fracStr ? `${intStr}.${fracStr}` : intStr;

    const steps: string[] = [];
    if (isNegative) steps.push(`##Negative Number\nConvert $|x|$, then re-apply the sign.`);

    if (fb !== 10) {
      const terms: string[] = [];
      intStr.split("").forEach((d, i) => terms.push(`${DIGITS.indexOf(d)}\\times ${fb}^{${intStr.length - 1 - i}}`));
      fracStr.split("").forEach((d, i) => terms.push(`${DIGITS.indexOf(d)}\\times ${fb}^{-${i + 1}}`));
      steps.push(`##Step 1 — To Decimal\n$$${magnitudeStr}_{${fb}} = ${terms.join(" + ")} = ${absDecimal}_{10}${isNegative ? ` \\;\\to\\; ${decimalValue}_{10}` : ""}$$`);
    } else {
      steps.push(`##Step 1 — Already in Decimal\n$$${decimalValue}_{10}$$`);
    }

    if (tb !== 10) {
      steps.push(`##Step 2 — To Base ${tb}`);
      let n = BigInt(Math.floor(absDecimal));
      const T = BigInt(tb);
      const divisionSteps: string[] = [];
      if (n === 0n) divisionSteps.push(`$$0 \\div ${tb} = 0 \\text{ remainder } 0$$`);
      while (n > 0n) {
        const r = n % T;
        const q = n / T;
        divisionSteps.push(`$$${n} \\div ${tb} = ${q} \\text{ remainder } ${DIGITS[Number(r)]}$$`);
        n = q;
      }
      steps.push(`##Whole Part — Repeated Division (remainders, bottom → top)\n${divisionSteps.join("\n\n")}`);
      let f = absDecimal - Math.floor(absDecimal);
      if (f > 1e-12) {
        const mulSteps: string[] = [];
        for (let k = 0; k < FRAC_DIGITS && f > 1e-12; k++) {
          const prod = f * tb;
          const d = Math.floor(prod + 1e-9);
          mulSteps.push(`$$${parseFloat(f.toPrecision(10))} \\times ${tb} = ${parseFloat(prod.toPrecision(10))} \\;\\Rightarrow\\; \\text{digit } ${DIGITS[d]}$$`);
          f = prod - d;
        }
        steps.push(`##Fractional Part — Repeated Multiplication (digits, top → bottom)\n${mulSteps.join("\n\n")}${f > 1e-12 ? `\n\nThe fraction doesn't terminate in base ${tb}, so it is cut off after ${FRAC_DIGITS} digits (approximate).` : ""}`);
      }
      steps.push(`##Result\n$$${fromDecimal(decimalValue, tb)}_{${tb}}$$`);
    } else {
      steps.push(`##Step 2 — Target Base is Decimal\n$$${decimalValue}$$`);
    }

    setCustom({ decimal: decimalValue, result: fromDecimal(decimalValue, tb), steps });
  };

  useAutoRun([value, fromBase, toBase], convert, settings.autoCalculate);

  const runArithmetic = () => {
    setArithResult(performBaseArithmetic(arithA, arithB, parseInt(arithBaseA), parseInt(arithBaseB), arithOp));
  };
  useAutoRun([arithA, arithB, arithBaseA, arithBaseB, arithOp], runArithmetic, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Binary className="h-5 w-5 text-primary" />
            Number System Conversions
          </CardTitle>
          <p className="text-xs text-muted-foreground">Convert between binary, octal, decimal, hexadecimal — or any base from 2 to 36 — and do arithmetic within a base.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "convert" | "arithmetic")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="convert" className="gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" /> Convert</TabsTrigger>
              <TabsTrigger value="arithmetic" className="gap-1.5"><Calculator className="h-3.5 w-3.5" /> Arithmetic</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "convert" && (
            <div
              className="space-y-4"
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); convert(); }
              }}
            >
              <div className="space-y-1">
                <Label className="text-xs">Number</Label>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 42, 1010, FF, 101.101, 0.625"
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
            </div>
          )}

          {mode === "arithmetic" && (
            <div
              className="space-y-4"
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); runArithmetic(); }
              }}
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Number A</Label>
                  <Input
                    value={arithA}
                    onChange={(e) => setArithA(e.target.value)}
                    placeholder="e.g. 1010"
                    className="font-mono text-center"
                    onKeyDown={(e) => e.key === "Enter" && runArithmetic()}
                  />
                  <Select value={arithBaseA} onValueChange={setArithBaseA}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                  <Label className="text-xs">Number B</Label>
                  <Input
                    value={arithB}
                    onChange={(e) => setArithB(e.target.value)}
                    placeholder="e.g. 11"
                    className="font-mono text-center"
                    onKeyDown={(e) => e.key === "Enter" && runArithmetic()}
                  />
                  <Select value={arithBaseB} onValueChange={setArithBaseB}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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

              <div className="flex flex-wrap gap-1.5">
                {ARITH_OPS.map(({ op, label, symbol }) => (
                  <button
                    key={op}
                    onClick={() => setArithOp(op)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      arithOp === op ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {symbol} {label}
                  </button>
                ))}
              </div>

              <Button onClick={runArithmetic} className="w-full gap-2">
                <Calculator className="h-4 w-4" /> Calculate
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {mode === "convert" && error && (
        <Card className="border-destructive/20">
          <CardContent className="pt-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {mode === "convert" && !error && custom && (
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

      {mode === "convert" && !error && allResults && (
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

      {mode === "arithmetic" && arithResult?.error && (
        <Card className="border-destructive/20">
          <CardContent className="pt-4 text-destructive text-sm">{arithResult.error}</CardContent>
        </Card>
      )}

      {mode === "arithmetic" && arithResult && !arithResult.error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="border-primary/20 shadow-lg">
            <CardContent className="pt-6 space-y-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 text-center">
                <div className="text-xs text-muted-foreground mb-1">Result</div>
                <div className="text-xl font-mono font-bold text-foreground break-all">
                  {arithA.toUpperCase()}{subscript(parseInt(arithBaseA))} {ARITH_OPS.find(o => o.op === arithOp)?.symbol} {arithB.toUpperCase()}{subscript(parseInt(arithBaseB))} = {arithResult.result}{subscript(parseInt(arithBaseA))}
                </div>
              </div>
              <StepsReveal steps={arithResult.steps} show={settings.showSteps} resetKey={arithResult.result} />
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
