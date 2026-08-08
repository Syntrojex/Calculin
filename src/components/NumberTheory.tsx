import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hash } from "lucide-react";
import { MathText } from "./MathText";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";

// ── helpers ──────────────────────────────────────────────────────────────────
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
function lcm(a: number, b: number): number { return Math.abs(a * b) / gcd(a, b); }

function gcdSteps(a: number, b: number): string[] {
  const steps: string[] = [];
  steps.push(`Euclidean Algorithm: gcd(${a}, ${b})`);
  let x = Math.abs(a), y = Math.abs(b);
  while (y !== 0) {
    const q = Math.floor(x / y);
    const r = x % y;
    steps.push(`${x} = ${q} × ${y} + ${r}`);
    x = y; y = r;
  }
  steps.push(`GCD = ${x}`);
  return steps;
}

function primeFactors(n: number): { factor: number; exp: number }[] {
  const factors: Map<number, number> = new Map();
  let d = 2;
  let num = Math.abs(n);
  while (d * d <= num) {
    while (num % d === 0) {
      factors.set(d, (factors.get(d) ?? 0) + 1);
      num = num / d;
    }
    d++;
  }
  if (num > 1) factors.set(num, (factors.get(num) ?? 0) + 1);
  return [...factors.entries()].map(([factor, exp]) => ({ factor, exp }));
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
}

function sieve(limit: number): number[] {
  const arr = Array(limit + 1).fill(true);
  arr[0] = arr[1] = false;
  for (let i = 2; i * i <= limit; i++) if (arr[i]) for (let j = i * i; j <= limit; j += i) arr[j] = false;
  return arr.map((v, i) => (v ? i : -1)).filter(v => v > 0);
}

// ── GCD/LCM ──────────────────────────────────────────────────────────────────
function GcdLcm() {
  const settings = useSettings();
  const [aVal, setAVal] = useState("48");
  const [bVal, setBVal] = useState("18");
  const [result, setResult] = useState<{ gcd: number; lcm: number; steps: string[] } | null>(null);

  const [error, setError] = useState<string | null>(null);

  const calculate = () => {
    const a = parseInt(aVal), b = parseInt(bVal);
    if (isNaN(a) || isNaN(b)) { setError("Please enter two valid whole numbers."); setResult(null); return; }
    if (a === 0 && b === 0) { setError("GCD and LCM of 0 and 0 are undefined."); setResult(null); return; }
    setError(null);
    const g = gcd(Math.abs(a), Math.abs(b));
    const l = a === 0 || b === 0 ? 0 : lcm(a, b);
    const steps = gcdSteps(a, b);
    steps.push(`LCM(${a}, ${b}) = |${a} × ${b}| / GCD = ${Math.abs(a * b)} / ${g} = ${l}`);
    setResult({ gcd: g, lcm: l, steps });
  };

  useAutoRun([aVal, bVal], calculate, settings.autoCalculate);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Label className="text-xs">Number A</Label><Input value={aVal} onChange={e => setAVal(e.target.value)} className="font-mono" /></div>
        <div className="space-y-1"><Label className="text-xs">Number B</Label><Input value={bVal} onChange={e => setBVal(e.target.value)} className="font-mono" onKeyDown={e => e.key === "Enter" && calculate()} /></div>
      </div>
      {!settings.autoCalculate && <Button onClick={calculate} className="w-full">Calculate GCD & LCM</Button>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 text-center">
              <div className="text-xs text-muted-foreground">GCD</div>
              <div className="text-2xl font-bold font-mono text-primary">{result.gcd}</div>
            </div>
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 text-center">
              <div className="text-xs text-muted-foreground">LCM</div>
              <div className="text-2xl font-bold font-mono text-primary">{result.lcm}</div>
            </div>
          </div>
          <StepsReveal steps={result.steps} show={settings.showSteps} resetKey={`${result.gcd}-${result.lcm}`} />
        </motion.div>
      )}
    </div>
  );
}

// ── Prime Factorization ───────────────────────────────────────────────────────
function PrimeFactorization() {
  const settings = useSettings();
  const [val, setVal] = useState("360");
  const [result, setResult] = useState<{ factors: { factor: number; exp: number }[]; isPrime: boolean; divisors: number[]; divisorCount: number; steps: string[] } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const MAX_N = 10_000_000;

  const calculate = () => {
    const n = parseInt(val);
    if (isNaN(n)) { setError("Please enter a valid whole number."); setResult(null); return; }
    if (n < 2) { setError("Please enter a whole number of 2 or higher."); setResult(null); return; }
    if (n > MAX_N) { setError(`Please enter a number up to ${MAX_N.toLocaleString()}.`); setResult(null); return; }
    setError(null);
    const factors = primeFactors(n);
    const prime = isPrime(n);
    const steps: string[] = [];
    steps.push(`Factorize: ${n}`);
    if (prime) { steps.push(`${n} is prime!`); }
    else {
      let cur = n;
      for (const { factor, exp } of factors) {
        for (let e = 0; e < exp; e++) {
          steps.push(`${cur} ÷ ${factor} = ${cur / factor}`);
          cur = cur / factor;
        }
      }
      steps.push(`Prime factorization: ${factors.map(({ factor, exp }) => exp > 1 ? `${factor}^${exp}` : `${factor}`).join(" × ")}`);
    }

    // Divisor count from the prime factorization: (e1+1)(e2+1)... — this is
    // exact and instant, unlike scanning every integer up to n (which used
    // to take a real, noticeable freeze for large n close to the 10M cap).
    const divisorCount = prime ? 2 : factors.reduce((acc, { exp }) => acc * (exp + 1), 1);

    // List a handful of divisors by combining prime-factor subsets (bounded
    // work regardless of how large n is), rather than a linear scan to n.
    let divs: number[] = [1];
    for (const { factor, exp } of factors) {
      const next: number[] = [];
      for (const d of divs) {
        let p = 1;
        for (let e = 0; e <= exp; e++) {
          next.push(d * p);
          p *= factor;
        }
      }
      divs = next;
      if (divs.length > 500) break; // safety cap, still cheap either way
    }
    divs = [...new Set(divs)].sort((a, b) => a - b);
    steps.push(`Number of divisors: ${divisorCount}`);

    setResult({ factors, isPrime: prime, divisors: divs.slice(0, 30), divisorCount, steps });
  };

  useAutoRun([val], calculate, settings.autoCalculate);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs">Number (up to 10,000,000)</Label>
        <Input value={val} onChange={e => setVal(e.target.value)} className="font-mono" type="number" onKeyDown={e => e.key === "Enter" && calculate()} />
      </div>
      {!settings.autoCalculate && <Button onClick={calculate} className="w-full">Factorize</Button>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-3">
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
            {result.isPrime ? (
              <p className="text-green-600 dark:text-green-400 font-semibold">✓ {val} is a Prime Number</p>
            ) : (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Prime Factorization</div>
                <div className="text-xl font-mono font-bold">
                  <MathText text={result.factors.map(({ factor, exp }) => exp > 1 ? `${factor}^${exp}` : `${factor}`).join(" × ")} />
                </div>
              </div>
            )}
          </div>
          {!result.isPrime && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">All Divisors ({result.divisorCount > 30 ? `first 30 of ${result.divisorCount}` : result.divisorCount}):</p>
              <div className="flex flex-wrap gap-1">
                {result.divisors.map(d => <span key={d} className="px-2 py-0.5 rounded bg-background text-xs font-mono border border-border/50">{d}</span>)}
              </div>
            </div>
          )}
          <StepsReveal steps={result.steps} show={settings.showSteps} resetKey={val} />
        </motion.div>
      )}
    </div>
  );
}

// ── Primes Sieve ─────────────────────────────────────────────────────────────
function PrimesList() {
  const settings = useSettings();
  const [limit, setLimit] = useState("100");
  const [primes, setPrimes] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = () => {
    const parsed = parseInt(limit);
    if (isNaN(parsed)) { setError("Please enter a valid whole number."); setPrimes(null); return; }
    if (parsed < 0) { setError("Please enter a non-negative number."); setPrimes(null); return; }
    setError(null);
    const n = Math.min(parsed, 10000);
    setPrimes(sieve(n));
  };

  useAutoRun([limit], generate, settings.autoCalculate);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs">List all primes up to (max 10,000)</Label>
        <Input value={limit} onChange={e => setLimit(e.target.value)} className="font-mono" type="number" onKeyDown={e => e.key === "Enter" && generate()} />
      </div>
      {!settings.autoCalculate && <Button onClick={generate} className="w-full">Generate Primes</Button>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {primes && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-2">
          <p className="text-xs text-muted-foreground">Found <strong>{primes.length}</strong> primes up to {limit}</p>
          <div className="rounded-lg bg-muted/50 p-3 max-h-48 overflow-y-auto">
            <div className="flex flex-wrap gap-1">
              {primes.map(p => (
                <span key={p} className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono">{p}</span>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function NumberTheory() {
  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Hash className="h-5 w-5 text-primary" />
            Number Theory Tools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="gcd">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="gcd" className="flex-1 text-xs">GCD & LCM</TabsTrigger>
              <TabsTrigger value="prime" className="flex-1 text-xs">Factorization</TabsTrigger>
              <TabsTrigger value="list" className="flex-1 text-xs">Prime List</TabsTrigger>
            </TabsList>
            <TabsContent value="gcd"><GcdLcm /></TabsContent>
            <TabsContent value="prime"><PrimeFactorization /></TabsContent>
            <TabsContent value="list"><PrimesList /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
