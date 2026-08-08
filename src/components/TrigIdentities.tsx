import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluate, simplify, type MathNode } from "mathjs";
import { MathText } from "./MathText";
import { StepsReveal } from "./StepsReveal";
import { CheckCircle, XCircle, Copy, Check } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";

// ── Trig-aware symbolic simplification engine ────────────────────────────────
// mathjs's default simplify() only knows algebra; these custom rules teach it
// the standard trig identities so it can reduce expressions step by step.
const TRIG_RULES = [
  { l: "sin(n1)^2 + cos(n1)^2", r: "1" },
  { l: "cos(n1)^2 + sin(n1)^2", r: "1" },
  { l: "1 - cos(n1)^2", r: "sin(n1)^2" },
  { l: "1 - sin(n1)^2", r: "cos(n1)^2" },
  { l: "sec(n1)^2 - tan(n1)^2", r: "1" },
  { l: "tan(n1)^2 + 1", r: "sec(n1)^2" },
  { l: "csc(n1)^2 - cot(n1)^2", r: "1" },
  { l: "cot(n1)^2 + 1", r: "csc(n1)^2" },
  { l: "tan(n1)", r: "sin(n1) / cos(n1)" },
  { l: "cot(n1)", r: "cos(n1) / sin(n1)" },
  { l: "sec(n1)", r: "1 / cos(n1)" },
  { l: "csc(n1)", r: "1 / sin(n1)" },
  { l: "sin(2 * n1)", r: "2 * sin(n1) * cos(n1)" },
  { l: "cos(2 * n1)", r: "cos(n1)^2 - sin(n1)^2" },
] as const;

// mathjs exposes .rules as a non-public field — typed accessor so we avoid
// `as unknown` in the actual integration code.
type SimplifyWithRules = typeof simplify & { rules: unknown[] };
const ALL_SIMPLIFY_RULES = [...(simplify as SimplifyWithRules).rules, ...TRIG_RULES];

function deepSimplifyTrace(expr: string, maxPasses = 6): { final: string; trace: string[] } {
  const trace: string[] = [];
  let current = expr;
  for (let i = 0; i < maxPasses; i++) {
    let next: string;
    try {
      next = (simplify(current, ALL_SIMPLIFY_RULES) as MathNode).toString();
    } catch {
      break;
    }
    if (next === current) break;
    trace.push(next);
    current = next;
  }
  return { final: current, trace };
}

const NAMED_IDENTITY_HINTS: { test: RegExp; name: string }[] = [
  { test: /sin\([^)]*\)\s*\^\s*2[^=]*\+\s*cos\([^)]*\)\s*\^\s*2|cos\([^)]*\)\s*\^\s*2[^=]*\+\s*sin\([^)]*\)\s*\^\s*2/, name: "Pythagorean identity (sin²θ + cos²θ = 1)" },
  { test: /tan\(/, name: "Quotient identity (tan θ = sin θ / cos θ)" },
  { test: /cot\(/, name: "Quotient identity (cot θ = cos θ / sin θ)" },
  { test: /sec\(/, name: "Reciprocal identity (sec θ = 1 / cos θ)" },
  { test: /csc\(/, name: "Reciprocal identity (csc θ = 1 / sin θ)" },
  { test: /\b2\s*\*?\s*sin\([^)]*\)\s*\*?\s*cos\(|sin\(\s*2\s*\*/, name: "Double angle identity (sin 2θ = 2 sin θ cos θ)" },
];

function detectIdentityHints(lhs: string, rhs: string): string[] {
  const combined = `${lhs} ${rhs}`;
  const found = new Set<string>();
  for (const { test, name } of NAMED_IDENTITY_HINTS) {
    if (test.test(combined)) found.add(name);
  }
  return Array.from(found);
}

const IDENTITIES = {
  pythagorean: {
    label: "Pythagorean",
    color: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
    items: [
      { name: "sin²θ + cos²θ = 1", latex: "\\sin^2\\theta + \\cos^2\\theta = 1" },
      { name: "1 + tan²θ = sec²θ", latex: "1 + \\tan^2\\theta = \\sec^2\\theta" },
      { name: "1 + cot²θ = csc²θ", latex: "1 + \\cot^2\\theta = \\csc^2\\theta" },
    ],
  },
  reciprocal: {
    label: "Reciprocal",
    color: "bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300",
    items: [
      { name: "sin θ = 1 / csc θ", latex: "\\sin\\theta = \\frac{1}{\\csc\\theta}" },
      { name: "cos θ = 1 / sec θ", latex: "\\cos\\theta = \\frac{1}{\\sec\\theta}" },
      { name: "tan θ = 1 / cot θ", latex: "\\tan\\theta = \\frac{1}{\\cot\\theta}" },
      { name: "tan θ = sin θ / cos θ", latex: "\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta}" },
      { name: "cot θ = cos θ / sin θ", latex: "\\cot\\theta = \\frac{\\cos\\theta}{\\sin\\theta}" },
    ],
  },
  double: {
    label: "Double Angle",
    color: "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300",
    items: [
      { name: "sin(2θ) = 2·sin θ·cos θ", latex: "\\sin(2\\theta) = 2\\sin\\theta\\cos\\theta" },
      { name: "cos(2θ) = cos²θ - sin²θ", latex: "\\cos(2\\theta) = \\cos^2\\theta - \\sin^2\\theta" },
      { name: "cos(2θ) = 2cos²θ - 1", latex: "\\cos(2\\theta) = 2\\cos^2\\theta - 1" },
      { name: "cos(2θ) = 1 - 2sin²θ", latex: "\\cos(2\\theta) = 1 - 2\\sin^2\\theta" },
      { name: "tan(2θ) = 2tan θ / (1 - tan²θ)", latex: "\\tan(2\\theta) = \\frac{2\\tan\\theta}{1-\\tan^2\\theta}" },
    ],
  },
  half: {
    label: "Half Angle",
    color: "bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-300",
    items: [
      { name: "sin(θ/2) = ±√((1-cosθ)/2)", latex: "\\sin\\frac{\\theta}{2} = \\pm\\sqrt{\\frac{1-\\cos\\theta}{2}}" },
      { name: "cos(θ/2) = ±√((1+cosθ)/2)", latex: "\\cos\\frac{\\theta}{2} = \\pm\\sqrt{\\frac{1+\\cos\\theta}{2}}" },
      { name: "tan(θ/2) = sinθ/(1+cosθ)", latex: "\\tan\\frac{\\theta}{2} = \\frac{\\sin\\theta}{1+\\cos\\theta}" },
      { name: "tan(θ/2) = (1-cosθ)/sinθ", latex: "\\tan\\frac{\\theta}{2} = \\frac{1-\\cos\\theta}{\\sin\\theta}" },
    ],
  },
  sum: {
    label: "Sum & Difference",
    color: "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300",
    items: [
      { name: "sin(A+B) = sinA cosB + cosA sinB", latex: "\\sin(A+B) = \\sin A\\cos B + \\cos A\\sin B" },
      { name: "sin(A-B) = sinA cosB - cosA sinB", latex: "\\sin(A-B) = \\sin A\\cos B - \\cos A\\sin B" },
      { name: "cos(A+B) = cosA cosB - sinA sinB", latex: "\\cos(A+B) = \\cos A\\cos B - \\sin A\\sin B" },
      { name: "cos(A-B) = cosA cosB + sinA sinB", latex: "\\cos(A-B) = \\cos A\\cos B + \\sin A\\sin B" },
      { name: "tan(A+B) = (tanA+tanB)/(1-tanA tanB)", latex: "\\tan(A+B) = \\frac{\\tan A+\\tan B}{1-\\tan A\\tan B}" },
      { name: "tan(A-B) = (tanA-tanB)/(1+tanA tanB)", latex: "\\tan(A-B) = \\frac{\\tan A-\\tan B}{1+\\tan A\\tan B}" },
    ],
  },
  product: {
    label: "Product-to-Sum",
    color: "bg-teal-500/10 border-teal-500/20 text-teal-700 dark:text-teal-300",
    items: [
      { name: "sinA sinB = ½[cos(A-B) - cos(A+B)]", latex: "\\sin A\\sin B = \\tfrac{1}{2}[\\cos(A-B)-\\cos(A+B)]" },
      { name: "cosA cosB = ½[cos(A-B) + cos(A+B)]", latex: "\\cos A\\cos B = \\tfrac{1}{2}[\\cos(A-B)+\\cos(A+B)]" },
      { name: "sinA cosB = ½[sin(A+B) + sin(A-B)]", latex: "\\sin A\\cos B = \\tfrac{1}{2}[\\sin(A+B)+\\sin(A-B)]" },
      { name: "cosA sinB = ½[sin(A+B) - sin(A-B)]", latex: "\\cos A\\sin B = \\tfrac{1}{2}[\\sin(A+B)-\\sin(A-B)]" },
    ],
  },
  sumtoprod: {
    label: "Sum-to-Product",
    color: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300",
    items: [
      { name: "sinA + sinB = 2 sin((A+B)/2) cos((A-B)/2)", latex: "\\sin A+\\sin B = 2\\sin\\frac{A+B}{2}\\cos\\frac{A-B}{2}" },
      { name: "sinA - sinB = 2 cos((A+B)/2) sin((A-B)/2)", latex: "\\sin A-\\sin B = 2\\cos\\frac{A+B}{2}\\sin\\frac{A-B}{2}" },
      { name: "cosA + cosB = 2 cos((A+B)/2) cos((A-B)/2)", latex: "\\cos A+\\cos B = 2\\cos\\frac{A+B}{2}\\cos\\frac{A-B}{2}" },
      { name: "cosA - cosB = -2 sin((A+B)/2) sin((A-B)/2)", latex: "\\cos A-\\cos B = -2\\sin\\frac{A+B}{2}\\sin\\frac{A-B}{2}" },
    ],
  },
  cofunction: {
    label: "Co-function",
    color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300",
    items: [
      { name: "sin(90°-θ) = cos θ", latex: "\\sin(90°-\\theta) = \\cos\\theta" },
      { name: "cos(90°-θ) = sin θ", latex: "\\cos(90°-\\theta) = \\sin\\theta" },
      { name: "tan(90°-θ) = cot θ", latex: "\\tan(90°-\\theta) = \\cot\\theta" },
      { name: "csc(90°-θ) = sec θ", latex: "\\csc(90°-\\theta) = \\sec\\theta" },
      { name: "sec(90°-θ) = csc θ", latex: "\\sec(90°-\\theta) = \\csc\\theta" },
      { name: "cot(90°-θ) = tan θ", latex: "\\cot(90°-\\theta) = \\tan\\theta" },
    ],
  },
};

function IdentityCard({ name, latex }: { name: string; latex: string }) {
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors group">
      <span className="text-sm font-mono flex-1"><MathText text={name} /></span>
      <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => copy(name)}
          className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
          title="Copy text"
          aria-label="Copy text"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
        <button
          onClick={() => copy(latex)}
          className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors text-xs font-mono"
          title="Copy LaTeX"
          aria-label="Copy LaTeX"
        >
          TeX
        </button>
      </div>
    </div>
  );
}

function ProveIdentity() {
  const settings = useSettings();
  const [lhs, setLhs] = useState("sin(x)^2 + cos(x)^2");
  const [rhs, setRhs] = useState("1");
  const [result, setResult] = useState<{
    match: boolean; tested: number; passed: number;
    lhsTrace: string[]; rhsTrace: string[]; lhsFinal: string; rhsFinal: string;
    converged: boolean; hints: string[];
  } | null>(null);

  const verify = () => {
    // Wide variety of angles: positive, negative, >π, near π/2 edges avoided
    const testAngles = [
      0.1, 0.3, 0.5, 0.7, 1.0, 1.2, 1.5,
      Math.PI / 6, Math.PI / 4, Math.PI / 3,
      2.0, 2.3, 2.7, 3.0,
      Math.PI + 0.2, Math.PI + 0.7, 4.2, 5.0, 5.5,
      -0.3, -0.8, -1.2, -2.0, -Math.PI / 4,
    ];
    let passed = 0;
    let tested = 0;

    for (const x of testAngles) {
      try {
        const l = evaluate(lhs, { x }) as number;
        const r = evaluate(rhs, { x }) as number;
        if (!isFinite(l) || !isFinite(r)) continue; // skip singularities (e.g. tan at π/2)
        tested++;
        if (Math.abs(l - r) < 1e-7) passed++;
      } catch { /* skip */ }
    }

    // Require at least 8 valid test points and all of them to match
    const match = tested >= 8 && passed === tested;
    const { final: lhsFinal, trace: lhsTrace } = deepSimplifyTrace(lhs);
    const { final: rhsFinal, trace: rhsTrace } = deepSimplifyTrace(rhs);
    const converged = lhsFinal === rhsFinal;
    const hints = detectIdentityHints(lhs, rhs);

    setResult({ match, tested, passed, lhsTrace, rhsTrace, lhsFinal, rhsFinal, converged, hints });
  };

  useAutoRun([lhs, rhs], verify, settings.autoCalculate);

  const steps: string[] = result ? [
    `LHS: ${lhs}`,
    ...result.lhsTrace.map((t, i) => `→ Simplify step ${i + 1}: ${t}`),
    `RHS: ${rhs}`,
    ...result.rhsTrace.map((t, i) => `→ Simplify step ${i + 1}: ${t}`),
    result.converged
      ? `Both sides reduce to the same expression: ${result.lhsFinal} → Identity proved ✓`
      : result.match
        ? `Both sides verified numerically equal across all test angles, though automatic simplification couldn't fully converge symbolically — this identity likely needs an extra algebraic step (e.g. cross-multiplying) beyond automatic rewriting.`
        : `LHS and RHS do not match — this is not an identity.`,
  ] : [];

  return (
    <Card className="border-border/50 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Prove Identity</CardTitle>
        <p className="text-xs text-muted-foreground">Enter both sides using x as the angle variable — get a step-by-step proof using trig identities.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Input value={lhs} onChange={e => setLhs(e.target.value)} placeholder="LHS e.g. sin(x)^2+cos(x)^2" className="font-mono text-sm" />
          <span className="text-sm font-bold text-muted-foreground">=</span>
          <Input value={rhs} onChange={e => setRhs(e.target.value)} placeholder="RHS e.g. 1" className="font-mono text-sm" />
        </div>
        {!settings.autoCalculate && <Button onClick={verify} className="w-full">Prove Identity</Button>}
        {result && (
          <motion.div
            key={`${result.match}-${result.passed}`}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
          >
            <div className={`flex items-center gap-3 p-3 rounded-lg ${result.match ? "bg-green-500/10 border border-green-500/20" : "bg-destructive/10 border border-destructive/20"}`}>
              {result.match
                ? <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                : <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />}
              <div>
                <p className={`text-sm font-semibold ${result.match ? "text-green-700 dark:text-green-300" : "text-destructive"}`}>
                  {result.match ? "✓ Identity Proved!" : "✗ Not an Identity"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Verified for {result.passed}/{result.tested} test angles
                </p>
              </div>
            </div>

            {result.hints.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.hints.map((h, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">{h}</span>
                ))}
              </div>
            )}

            <StepsReveal steps={steps} show={settings.showSteps} resetKey={`${lhs}=${rhs}`} title="Proof:" />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

export function TrigIdentities() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="identities">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="identities" className="flex-1">Identities</TabsTrigger>
          <TabsTrigger value="prove" className="flex-1">Prove Identity</TabsTrigger>
        </TabsList>

        <TabsContent value="identities">
          <Card className="border-border/50 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="text-primary text-xl">sin cos tan</span>
                All Trigonometric Identities
              </CardTitle>
              <p className="text-xs text-muted-foreground">Hover any identity to copy text or LaTeX</p>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="pythagorean">
                <TabsList className="flex-wrap h-auto gap-1 p-1 mb-4">
              {Object.entries(IDENTITIES).map(([key, cat]) => (
                <TabsTrigger key={key} value={key} className="text-xs px-2 py-1">
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {Object.entries(IDENTITIES).map(([key, cat]) => (
              <TabsContent key={key} value={key}>
                <div className={`rounded-lg border p-3 mb-3 ${cat.color}`}>
                  <p className="text-xs font-semibold">{cat.label} Identities — {cat.items.length} formulas</p>
                </div>
                <div className="space-y-1">
                  {cat.items.map((item, i) => (
                    <IdentityCard key={i} name={item.name} latex={item.latex} />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="prove">
          <ProveIdentity />
        </TabsContent>
      </Tabs>
    </div>
  );
}
