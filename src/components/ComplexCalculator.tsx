import { evaluate as mathEvaluate } from "mathjs";
import { cleanExpression } from "@/lib/expression-clean";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MathText } from "./MathText";
import { StepsReveal } from "./StepsReveal";
import { Zap } from "lucide-react";
import { useSettings, type Settings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";

type ComplexOp = "add" | "subtract" | "multiply" | "divide" | "power" | "sqrt" | "polar" | "rect" | "conjugate" | "modulus" | "demoivre" | "nroots" | "exp" | "ln" | "reciprocal";

interface Complex {
  re: number;
  im: number;
}

function fmt(x: number, s: Settings): string {
  const snapped = Math.abs(x) < 1e-10 ? 0 : x;
  return formatNumber(snapped, s);
}

function fmtComplex(c: Complex, s: Settings): string {
  if (Math.abs(c.im) < 1e-10) return fmt(c.re, s);
  if (Math.abs(c.re) < 1e-10) return `${fmt(c.im, s)}i`;
  const sign = c.im < 0 ? " - " : " + ";
  return `${fmt(c.re, s)}${sign}${fmt(Math.abs(c.im), s)}i`;
}

/** Same as fmtComplex but with the sign-splitting done for LaTeX embedding
 *  (avoids "3 + -4i" when the imaginary part is negative). */
function czLatex(c: Complex, s: Settings): string {
  if (Math.abs(c.im) < 1e-10) return fmt(c.re, s);
  if (Math.abs(c.re) < 1e-10) return `${fmt(c.im, s)}i`;
  const sign = c.im < 0 ? "-" : "+";
  return `${fmt(c.re, s)} ${sign} ${fmt(Math.abs(c.im), s)}i`;
}

function fmtAngle(rad: number, s: Settings): string {
  const deg = rad * (180 / Math.PI);
  return s.useRadians ? `${fmt(rad, s)} rad (${fmt(deg, s)}°)` : `${fmt(deg, s)}° (${fmt(rad, s)} rad)`;
}

function add(a: Complex, b: Complex): Complex { return { re: a.re + b.re, im: a.im + b.im }; }
function sub(a: Complex, b: Complex): Complex { return { re: a.re - b.re, im: a.im - b.im }; }
function mul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function div(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) throw new Error("Division by zero");
  return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
}
function modulus(a: Complex): number { return Math.sqrt(a.re * a.re + a.im * a.im); }
function argument(a: Complex): number { return Math.atan2(a.im, a.re); }
function conjugate(a: Complex): Complex { return { re: a.re, im: -a.im }; }

function sqrtComplex(a: Complex): Complex {
  const r = modulus(a);
  return {
    re: Math.sqrt((r + a.re) / 2),
    im: Math.sign(a.im || 1) * Math.sqrt((r - a.re) / 2),
  };
}

function power(a: Complex, n: number): Complex {
  if (Number.isInteger(n) && Math.abs(n) <= 200) {
    let result: Complex = { re: 1, im: 0 };
    let base = a;
    let e = Math.abs(n);
    while (e > 0) { if (e & 1) result = mul(result, base); base = mul(base, base); e >>= 1; }
    return n < 0 ? div({ re: 1, im: 0 }, result) : result;
  }
  const r = modulus(a);
  const theta = argument(a);
  const rn = Math.pow(r, n);
  return { re: rn * Math.cos(n * theta), im: rn * Math.sin(n * theta) };
}

function parseComplex(re: string, im: string): Complex {
  const val = (raw: string, label: string): number => {
    const t = raw.trim();
    if (t === "") return 0;
    try {
      const v = mathEvaluate(cleanExpression(t));
      if (typeof v === "number" && Number.isFinite(v)) return v;
    } catch { /* fall through */ }
    throw new Error(`"${raw}" isn't a valid number for the ${label} part — use a number or something like 1/2, sqrt(2), pi.`);
  };
  return { re: val(re, "real"), im: val(im, "imaginary") };
}

function compute(op: ComplexOp, a: Complex, b: Complex, n: number, s: Settings): { result: string; steps: string[] } {
  const steps: string[] = [];
  const givenParts = [`z_1 = ${czLatex(a, s)}`];
  if (!["sqrt", "polar", "conjugate", "modulus", "demoivre", "nroots", "exp", "ln", "reciprocal", "power"].includes(op)) {
    givenParts.push(`z_2 = ${czLatex(b, s)}`);
  }
  steps.push(`##Given\n$$${givenParts.join(", \\quad ")}$$`);

  switch (op) {
    case "add": {
      const r = add(a, b);
      steps.push(`##Add Parts\n$$z_1 + z_2 = (${fmt(a.re, s)} + ${fmt(b.re, s)}) + (${fmt(a.im, s)} + ${fmt(b.im, s)})i = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "subtract": {
      const r = sub(a, b);
      steps.push(`##Subtract Parts\n$$z_1 - z_2 = (${fmt(a.re, s)} - ${fmt(b.re, s)}) + (${fmt(a.im, s)} - ${fmt(b.im, s)})i = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "multiply": {
      const r = mul(a, b);
      steps.push(`##FOIL, Using $i^2 = -1$\n$$(a+bi)(c+di) = (ac-bd) + (ad+bc)i$$`);
      steps.push(`##Substitute\n$$z_1 z_2 = (${fmt(a.re, s)}\\cdot ${fmt(b.re, s)} - ${fmt(a.im, s)}\\cdot ${fmt(b.im, s)}) + (${fmt(a.re, s)}\\cdot ${fmt(b.im, s)} + ${fmt(a.im, s)}\\cdot ${fmt(b.re, s)})i = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "divide": {
      if (b.re === 0 && b.im === 0) throw new Error("Division by zero — z₂ can't be 0.");
      const r = div(a, b);
      const denom = b.re * b.re + b.im * b.im;
      steps.push(`##Multiply by the Conjugate\n$$\\frac{z_1}{z_2} = \\frac{z_1\\,\\overline{z_2}}{z_2\\,\\overline{z_2}} = \\frac{z_1\\,\\overline{z_2}}{|z_2|^2}, \\qquad \\overline{z_2} = ${czLatex(conjugate(b), s)}$$`);
      steps.push(`##Compute\n$$z_1\\,\\overline{z_2} = ${czLatex(mul(a, conjugate(b)), s)}, \\qquad |z_2|^2 = ${fmt(denom, s)}$$`);
      steps.push(`##Result\n$$\\frac{z_1}{z_2} = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "power": {
      if (a.re === 0 && a.im === 0 && n <= 0) throw new Error("0 raised to a power ≤ 0 is undefined.");
      const r = power(a, n);
      const mod = modulus(a);
      const arg = argument(a);
      steps.push(`##Convert to Polar Form\n$$|z_1| = ${fmt(mod, s)}, \\qquad \\arg(z_1) = ${fmtAngle(arg, s)}$$`);
      steps.push(`##Apply $z^n = |z|^n(\\cos(n\\theta) + i\\sin(n\\theta))$\n$$z_1^{${n}} = ${fmt(mod, s)}^{${n}}\\left(\\cos(${fmt(n * arg, s)}) + i\\sin(${fmt(n * arg, s)})\\right) = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "sqrt": {
      const r = sqrtComplex(a);
      steps.push(`##Principal Square Root Formula\n$$\\sqrt{z} = \\sqrt{\\frac{|z|+\\operatorname{Re}(z)}{2}} + i\\cdot\\operatorname{sign}(\\operatorname{Im}(z))\\sqrt{\\frac{|z|-\\operatorname{Re}(z)}{2}}$$`);
      steps.push(`##Substitute\n$|z_1| = ${fmt(modulus(a), s)}$:\n$$\\sqrt{z_1} = ${czLatex(r, s)}$$`);
      return { result: `${fmtComplex(r, s)}  (principal root)`, steps };
    }
    case "polar": {
      const r = modulus(a);
      const theta = argument(a);
      steps.push(`##Modulus\n$$r = \\sqrt{(${fmt(a.re, s)})^2 + (${fmt(a.im, s)})^2} = ${fmt(r, s)}$$`);
      steps.push(`##Argument\n$$\\theta = \\operatorname{atan2}(${fmt(a.im, s)}, ${fmt(a.re, s)}) = ${fmtAngle(theta, s)}$$`);
      return { result: `r = ${fmt(r, s)},  θ = ${fmtAngle(theta, s)}`, steps };
    }
    case "rect": {
      const r = b.re;
      const theta = b.im * (Math.PI / 180);
      const re = r * Math.cos(theta);
      const im = r * Math.sin(theta);
      steps.push(`##Given (Polar Form)\n$$r = ${fmt(r, s)}, \\qquad \\theta = ${fmt(b.im, s)}°$$`);
      steps.push(`##Convert Using $x = r\\cos\\theta$, $y = r\\sin\\theta$\n$$\\operatorname{Re} = ${fmt(r, s)}\\cdot\\cos(\\theta) = ${fmt(re, s)}$$\n$$\\operatorname{Im} = ${fmt(r, s)}\\cdot\\sin(\\theta) = ${fmt(im, s)}$$`);
      return { result: fmtComplex({ re, im }, s), steps };
    }
    case "conjugate": {
      steps.push(`##Conjugate\n$$\\overline{a+bi} = a - bi \\quad\\Rightarrow\\quad \\overline{z_1} = ${czLatex(conjugate(a), s)}$$`);
      return { result: fmtComplex(conjugate(a), s), steps };
    }
    case "modulus": {
      const r = modulus(a);
      steps.push(`##Modulus Formula\n$$|z| = \\sqrt{\\operatorname{Re}(z)^2 + \\operatorname{Im}(z)^2}$$`);
      steps.push(`##Substitute\n$$|z_1| = \\sqrt{(${fmt(a.re, s)})^2 + (${fmt(a.im, s)})^2} = \\sqrt{${fmt(a.re * a.re, s)} + ${fmt(a.im * a.im, s)}} = ${fmt(r, s)}$$`);
      return { result: `|z₁| = ${fmt(r, s)}`, steps };
    }
    case "demoivre": {
      if (a.re === 0 && a.im === 0 && n <= 0) throw new Error("0 raised to a power ≤ 0 is undefined.");
      const mod = modulus(a);
      const arg = argument(a);
      const nArg = n * arg;
      const r = power(a, n);
      steps.push(`##De Moivre's Theorem\n$$\\left[r(\\cos\\theta + i\\sin\\theta)\\right]^n = r^n\\left(\\cos(n\\theta) + i\\sin(n\\theta)\\right)$$`);
      steps.push(`##Convert to Polar Form\n$$r = ${fmt(mod, s)}, \\qquad \\theta = ${fmtAngle(arg, s)}$$`);
      steps.push(`##Raise to Power\n$$r^{${n}} = ${fmt(Math.pow(mod, n), s)}, \\qquad n\\theta = ${n}\\times ${fmtAngle(arg, s)} = ${fmtAngle(nArg, s)}$$`);
      steps.push(`##Result\n$$z_1^{${n}} = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "nroots": {
      if (!Number.isInteger(n) || n < 1 || n > 24) throw new Error("For nth roots, n must be a whole number from 1 to 24.");
      if (a.re === 0 && a.im === 0) return { result: "0 (the only root)", steps };
      const mod = modulus(a);
      const arg = argument(a);
      const rootMod = Math.pow(mod, 1 / n);
      steps.push(`##Polar Form\n$$z = r(\\cos\\theta + i\\sin\\theta), \\qquad r = ${fmt(mod, s)}, \\quad \\theta = ${fmtAngle(arg, s)}$$`);
      steps.push(`##Formula for the nth Roots\n$$w_k = \\sqrt[n]{r}\\left(\\cos\\frac{\\theta + 2\\pi k}{n} + i\\sin\\frac{\\theta + 2\\pi k}{n}\\right), \\quad k = 0, 1, \\dots, n-1$$`);
      const roots: Complex[] = [];
      for (let k = 0; k < n; k++) {
        const th = (arg + 2 * Math.PI * k) / n;
        roots.push({ re: rootMod * Math.cos(th), im: rootMod * Math.sin(th) });
      }
      steps.push(`##The ${n} Roots\n$$\\begin{array}{l}${roots.map((r, k) => `w_{${k}} = ${czLatex(r, s)}`).join("\\\\")}\\end{array}$$`);
      return { result: roots.map((r, k) => `w${k} = ${fmtComplex(r, s)}`).join("\n"), steps };
    }
    case "exp": {
      const mag = Math.exp(a.re);
      const r = { re: mag * Math.cos(a.im), im: mag * Math.sin(a.im) };
      steps.push(`##Euler's Formula\n$$e^{x+iy} = e^{x}(\\cos y + i\\sin y)$$`);
      steps.push(`##Result\n$$e^{z_1} = e^{${fmt(a.re, s)}}\\left(\\cos ${fmt(a.im, s)} + i\\sin ${fmt(a.im, s)}\\right) = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "ln": {
      if (a.re === 0 && a.im === 0) throw new Error("ln(0) is undefined.");
      const r = { re: Math.log(modulus(a)), im: argument(a) };
      steps.push(`##Principal Logarithm\n$$\\ln z = \\ln|z| + i\\operatorname{Arg}(z)$$`);
      steps.push(`##Result\n$$\\ln z_1 = \\ln(${fmt(modulus(a), s)}) + i(${fmtAngle(argument(a), s)}) = ${czLatex(r, s)}$$\n\nGeneral value: add $2\\pi k\\,i$ for any integer $k$.`);
      return { result: fmtComplex(r, s), steps };
    }
    case "reciprocal": {
      if (a.re === 0 && a.im === 0) throw new Error("1/0 is undefined.");
      const r = div({ re: 1, im: 0 }, a);
      steps.push(`##Multiply by the Conjugate\n$$\\frac{1}{z} = \\frac{\\overline{z}}{|z|^2}, \\qquad |z_1|^2 = ${fmt(a.re * a.re + a.im * a.im, s)}$$`);
      steps.push(`##Result\n$$\\frac{1}{z_1} = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    default:
      return { result: "", steps: [] };
  }
}

const OPS: { value: ComplexOp; label: string; needsB: boolean; needsN: boolean; bLabel?: string }[] = [
  { value: "add", label: "z₁ + z₂", needsB: true, needsN: false },
  { value: "subtract", label: "z₁ − z₂", needsB: true, needsN: false },
  { value: "multiply", label: "z₁ × z₂", needsB: true, needsN: false },
  { value: "divide", label: "z₁ ÷ z₂", needsB: true, needsN: false },
  { value: "power", label: "z₁ ^ n", needsB: false, needsN: true },
  { value: "sqrt", label: "√z₁", needsB: false, needsN: false },
  { value: "modulus", label: "|z₁| (Modulus)", needsB: false, needsN: false },
  { value: "conjugate", label: "z̄₁ (Conjugate)", needsB: false, needsN: false },
  { value: "reciprocal", label: "1 / z₁", needsB: false, needsN: false },
  { value: "nroots", label: "ⁿ√z₁ (all n roots)", needsB: false, needsN: true },
  { value: "exp", label: "e^(z₁)", needsB: false, needsN: false },
  { value: "ln", label: "ln(z₁)", needsB: false, needsN: false },
  { value: "polar", label: "→ Polar Form (r, θ)", needsB: false, needsN: false },
  { value: "rect", label: "Polar → Rectangular", needsB: true, needsN: false, bLabel: "r  and  θ (degrees) as 'real + imag'" },
  { value: "demoivre", label: "De Moivre's Theorem", needsB: false, needsN: true },
];

export function ComplexCalculator() {
  const settings = useSettings();
  const [op, setOp] = useState<ComplexOp>("add");
  const [a1, setA1] = useState("3");
  const [b1, setB1] = useState("4");
  const [a2, setA2] = useState("1");
  const [b2, setB2] = useState("-2");
  const [n, setN] = useState("3");
  const [result, setResult] = useState<{ result: string; steps: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(settings.showSteps);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const currentOp = OPS.find(o => o.value === op)!;

  const calculate = () => {
    try {
      setError(null);
      const za = parseComplex(a1, b1);
      const zb = parseComplex(a2, b2);
      let nVal = 2;
      if (currentOp.needsN) {
        try { const t = mathEvaluate(cleanExpression(n.trim())); if (typeof t === "number" && Number.isFinite(t)) nVal = t; else throw new Error(); }
        catch { throw new Error(`"${n}" isn't a valid power — use a number like 3, -2 or 1/2.`); }
      }
      setResult(compute(op, za, zb, nVal, settings));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
      setResult(null);
    }
  };

  useAutoRun([op, a1, b1, a2, b2, n, settings.numberForm, settings.decimalPlaces, settings.useRadians], calculate, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-primary" />
            Complex Number Calculator
          </CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); calculate(); }
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Operation</Label>
            <Select value={op} onValueChange={v => { setOp(v as ComplexOp); setResult(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">z₁ = a + bi</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Real (a)</Label>
                  <Input value={a1} onChange={e => setA1(e.target.value)} className="font-mono" placeholder="3" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Imaginary (b)</Label>
                  <Input value={b1} onChange={e => setB1(e.target.value)} className="font-mono" placeholder="4" />
                </div>
              </div>
            </div>

            {currentOp.needsB && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {currentOp.bLabel ?? "z₂ = c + di"}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Real (c)</Label>
                    <Input value={a2} onChange={e => setA2(e.target.value)} className="font-mono" placeholder="1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Imaginary (d)</Label>
                    <Input value={b2} onChange={e => setB2(e.target.value)} className="font-mono" placeholder="-2" />
                  </div>
                </div>
              </div>
            )}

            {currentOp.needsN && (
              <div className="space-y-1">
                <Label className="text-xs">Exponent n</Label>
                <Input value={n} onChange={e => setN(e.target.value)} className="font-mono w-28" placeholder="3" type="number" />
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showSteps} onCheckedChange={setShowSteps} />
            Step-by-step
          </label>

          {!settings.autoCalculate && (
            <Button onClick={calculate} className="w-full gap-2">
              <Zap className="h-4 w-4" /> Calculate
            </Button>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/20">
          <CardContent className="pt-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-primary/20 shadow-lg">
          <CardContent className="pt-6 space-y-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
              <div className="text-sm text-muted-foreground mb-1">Result</div>
              <div className="text-xl font-mono font-semibold whitespace-pre-line">
                <MathText text={result.result} />
              </div>
            </div>
            <StepsReveal steps={result.steps} show={showSteps} resetKey={result.result} />
          </CardContent>
        </Card>
        </motion.div>
      )}
    </div>
  );
}
