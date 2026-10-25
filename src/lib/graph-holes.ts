import { makeEvaluator } from "./graph-utils";

/** Removable discontinuities ("holes"), e.g. (x²−1)/(x−1) at x = 1: the value is undefined but both sides head to the same number. */
export function findHoles(expr: string, lo: number, hi: number): { x: number; y: number }[] {
  const f = makeEvaluator(expr, "x");
  if (!f) return [];
  const byKey = new Map<number, number>();
  const add = (v: number) => { if (v >= lo && v <= hi) byKey.set(Math.round(v * 1e9), v); };
  const cands = { get size() { return byKey.size; }, [Symbol.iterator]: () => byKey.values() };
  for (let k = Math.ceil(lo * 4); k <= Math.floor(hi * 4) && cands.size < 500; k++) add(k / 4);
  for (let k = Math.ceil(lo * 3); k <= Math.floor(hi * 3) && cands.size < 800; k++) add(k / 3);
  for (let k = Math.ceil(lo / (Math.PI / 2)); k <= Math.floor(hi / (Math.PI / 2)) && cands.size < 1000; k++) add(k * (Math.PI / 2));
  const out: { x: number; y: number }[] = [];
  for (const c of cands) {
    if (Number.isFinite(f(c))) continue;
    const h = 1e-6 * Math.max(1, Math.abs(c));
    const l = f(c - h), r = f(c + h), l2 = f(c - 2 * h), r2 = f(c + 2 * h);
    if (![l, r, l2, r2].every(Number.isFinite)) continue;
    const y = (l + r) / 2;
    if (Math.abs(l - r) > 1e-4 * (1 + Math.abs(y)) || Math.abs(l - l2) > 1e-3 * (1 + Math.abs(y)) || Math.abs(y) > 1e6) continue;
    out.push({ x: c, y });
  }
  return out.slice(0, 12);
}
