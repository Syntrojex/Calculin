/**
 * Vector calculator logic — 2D and 3D. Every operation returns the same
 * shape (either a resulting vector or a scalar, plus fully worked steps),
 * built the same terse, math-first way as the rest of the app: a short
 * "Given" listing the input(s), the formula, the substitution, and the
 * result — no restated preamble sentences.
 */
import { toFractionLatex } from "./number-format";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface VectorResult {
  /** Set when the operation returns a vector (add, subtract, scale, unit, cross, vector projection). */
  resultVector?: Vec3;
  /** Set when the operation returns a single number (magnitude, dot, angle, scalar projection). */
  resultScalar?: number;
  /** Degrees, when resultScalar represents an angle. */
  isAngle?: boolean;
  /** Short text verdict (e.g. "Orthogonal") shown instead of a number/vector. */
  verdict?: string;
  is3D: boolean;
  steps: string[];
  error?: string;
}

function vecLatex(v: Vec3, is3D: boolean, name?: string): string {
  const comps = is3D ? [v.x, v.y, v.z] : [v.x, v.y];
  const body = comps.map((c) => toFractionLatex(c)).join(", ");
  return name ? `\\vec{${name}} = \\langle ${body} \\rangle` : `\\langle ${body} \\rangle`;
}

function dot(u: Vec3, v: Vec3, is3D: boolean): number {
  return u.x * v.x + u.y * v.y + (is3D ? u.z * v.z : 0);
}

/** A negative value written right after a "+" or "×" reads oddly bare
 *  ("3+-2", "-1\cdot -2") — wrapping it in parens ("3+(-2)", "(-1)\cdot(-2)")
 *  is the standard, unambiguous textbook way to write it. */
function w(n: number): string {
  const s = toFractionLatex(n);
  return n < 0 ? `(${s})` : s;
}

function magnitude(v: Vec3, is3D: boolean): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + (is3D ? v.z * v.z : 0));
}

function magLatex(name: string, v: Vec3, is3D: boolean): string {
  const parts = is3D
    ? `${toFractionLatex(v.x)}^2 + ${toFractionLatex(v.y)}^2 + ${toFractionLatex(v.z)}^2`
    : `${toFractionLatex(v.x)}^2 + ${toFractionLatex(v.y)}^2`;
  return `|\\vec{${name}}| = \\sqrt{${parts}}`;
}

function assertVectorsUsable(u: Vec3, v: Vec3 | null, is3D: boolean): void {
  const check = (n: number, label: string) => {
    if (!isFinite(n)) throw new Error(`${label} isn't a valid number.`);
  };
  check(u.x, "u\u2093"); check(u.y, "u\u1d67");
  if (is3D) check(u.z, "u\u2098");
  if (v) {
    check(v.x, "v\u2093"); check(v.y, "v\u1d67");
    if (is3D) check(v.z, "v\u2098");
  }
}

export function vecAdd(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const r: Vec3 = { x: u.x + v.x, y: u.y + v.y, z: is3D ? u.z + v.z : 0 };
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, is3D, "u")}, \\quad ${vecLatex(v, is3D, "v")}$$`);
    const comp = is3D
      ? `(${toFractionLatex(u.x)}+${w(v.x)}, \\; ${toFractionLatex(u.y)}+${w(v.y)}, \\; ${toFractionLatex(u.z)}+${w(v.z)})`
      : `(${toFractionLatex(u.x)}+${w(v.x)}, \\; ${toFractionLatex(u.y)}+${w(v.y)})`;
    steps.push(`##Add Component-Wise\n$$\\vec{u}+\\vec{v} = ${comp}$$`);
    steps.push(`##Result\n$$${vecLatex(r, is3D)}$$`);
    return { resultVector: r, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

export function vecSubtract(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const r: Vec3 = { x: u.x - v.x, y: u.y - v.y, z: is3D ? u.z - v.z : 0 };
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, is3D, "u")}, \\quad ${vecLatex(v, is3D, "v")}$$`);
    const comp = is3D
      ? `(${toFractionLatex(u.x)}-(${toFractionLatex(v.x)}), \\; ${toFractionLatex(u.y)}-(${toFractionLatex(v.y)}), \\; ${toFractionLatex(u.z)}-(${toFractionLatex(v.z)}))`
      : `(${toFractionLatex(u.x)}-(${toFractionLatex(v.x)}), \\; ${toFractionLatex(u.y)}-(${toFractionLatex(v.y)}))`;
    steps.push(`##Subtract Component-Wise\n$$\\vec{u}-\\vec{v} = ${comp}$$`);
    steps.push(`##Result\n$$${vecLatex(r, is3D)}$$`);
    return { resultVector: r, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

export function vecScale(u: Vec3, k: number, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, null, is3D);
    if (!isFinite(k)) throw new Error("The scalar isn't a valid number.");
    const r: Vec3 = { x: k * u.x, y: k * u.y, z: is3D ? k * u.z : 0 };
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, is3D, "u")}, \\quad k = ${toFractionLatex(k)}$$`);
    const comp = is3D
      ? `(${w(k)}\\cdot ${w(u.x)}, \\; ${w(k)}\\cdot ${w(u.y)}, \\; ${w(k)}\\cdot ${w(u.z)})`
      : `(${w(k)}\\cdot ${w(u.x)}, \\; ${w(k)}\\cdot ${w(u.y)})`;
    steps.push(`##Scale Each Component\n$$k\\vec{u} = ${comp}$$`);
    steps.push(`##Result\n$$${vecLatex(r, is3D)}$$`);
    return { resultVector: r, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

export function vecMagnitude(u: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, null, is3D);
    const m = magnitude(u, is3D);
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, is3D, "u")}$$`);
    steps.push(`##Magnitude Formula\n$$${magLatex("u", u, is3D)}$$`);
    steps.push(`##Result\n$$|\\vec{u}| = ${toFractionLatex(m)}$$`);
    return { resultScalar: m, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

export function vecUnit(u: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, null, is3D);
    const m = magnitude(u, is3D);
    if (m < 1e-12) throw new Error("The zero vector has no direction, so it has no unit vector.");
    const r: Vec3 = { x: u.x / m, y: u.y / m, z: is3D ? u.z / m : 0 };
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, is3D, "u")}$$`);
    steps.push(`##Magnitude\n$$${magLatex("u", u, is3D)} = ${toFractionLatex(m)}$$`);
    const comp = is3D
      ? `\\left(\\frac{${toFractionLatex(u.x)}}{${toFractionLatex(m)}}, \\; \\frac{${toFractionLatex(u.y)}}{${toFractionLatex(m)}}, \\; \\frac{${toFractionLatex(u.z)}}{${toFractionLatex(m)}}\\right)`
      : `\\left(\\frac{${toFractionLatex(u.x)}}{${toFractionLatex(m)}}, \\; \\frac{${toFractionLatex(u.y)}}{${toFractionLatex(m)}}\\right)`;
    steps.push(`##Divide by the Magnitude\n$$\\hat{u} = \\frac{\\vec{u}}{|\\vec{u}|} = ${comp}$$`);
    steps.push(`##Result\n$$\\hat{u} = ${vecLatex(r, is3D)}$$`);
    return { resultVector: r, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

export function vecDot(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const d = dot(u, v, is3D);
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, is3D, "u")}, \\quad ${vecLatex(v, is3D, "v")}$$`);
    const terms = is3D
      ? `(${toFractionLatex(u.x)})(${toFractionLatex(v.x)}) + (${toFractionLatex(u.y)})(${toFractionLatex(v.y)}) + (${toFractionLatex(u.z)})(${toFractionLatex(v.z)})`
      : `(${toFractionLatex(u.x)})(${toFractionLatex(v.x)}) + (${toFractionLatex(u.y)})(${toFractionLatex(v.y)})`;
    steps.push(`##Multiply Matching Components, Add\n$$\\vec{u}\\cdot\\vec{v} = ${terms}$$`);
    steps.push(`##Result\n$$\\vec{u}\\cdot\\vec{v} = ${toFractionLatex(d)}$$`);
    return { resultScalar: d, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

export function vecCross(u: Vec3, v: Vec3): VectorResult {
  try {
    assertVectorsUsable(u, v, true);
    const r: Vec3 = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, true, "u")}, \\quad ${vecLatex(v, true, "v")}$$`);
    steps.push(`##Determinant Form\n$$\\vec{u}\\times\\vec{v} = \\begin{vmatrix}\\hat{\\imath}&\\hat{\\jmath}&\\hat{k}\\\\${toFractionLatex(u.x)}&${toFractionLatex(u.y)}&${toFractionLatex(u.z)}\\\\${toFractionLatex(v.x)}&${toFractionLatex(v.y)}&${toFractionLatex(v.z)}\\end{vmatrix}$$`);
    steps.push(`##Expand Along Row 1\n$$\\hat{\\imath}\\left(${w(u.y)}\\cdot ${w(v.z)} - ${w(u.z)}\\cdot ${w(v.y)}\\right) - \\hat{\\jmath}\\left(${w(u.x)}\\cdot ${w(v.z)} - ${w(u.z)}\\cdot ${w(v.x)}\\right) + \\hat{k}\\left(${w(u.x)}\\cdot ${w(v.y)} - ${w(u.y)}\\cdot ${w(v.x)}\\right)$$`);
    steps.push(`##Result\n$$\\vec{u}\\times\\vec{v} = ${vecLatex(r, true)}$$`);
    return { resultVector: r, is3D: true, steps };
  } catch (e) {
    return { is3D: true, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

export function vecAngle(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const mu = magnitude(u, is3D), mv = magnitude(v, is3D);
    if (mu < 1e-12 || mv < 1e-12) throw new Error("The zero vector has no direction, so the angle is undefined.");
    const d = dot(u, v, is3D);
    const cosT = Math.max(-1, Math.min(1, d / (mu * mv)));
    const deg = (Math.acos(cosT) * 180) / Math.PI;
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, is3D, "u")}, \\quad ${vecLatex(v, is3D, "v")}$$`);
    steps.push(`##Angle Formula\n$$\\cos\\theta = \\frac{\\vec{u}\\cdot\\vec{v}}{|\\vec{u}|\\,|\\vec{v}|}$$`);
    steps.push(`##Dot Product and Magnitudes\n$$\\vec{u}\\cdot\\vec{v} = ${toFractionLatex(d)}, \\quad |\\vec{u}| = ${toFractionLatex(mu)}, \\quad |\\vec{v}| = ${toFractionLatex(mv)}$$`);
    steps.push(`##Substitute\n$$\\cos\\theta = \\frac{${toFractionLatex(d)}}{${toFractionLatex(mu)}\\cdot ${toFractionLatex(mv)}} = ${toFractionLatex(cosT)}$$`);
    steps.push(`##Result\n$$\\theta = \\cos^{-1}\\left(${toFractionLatex(cosT)}\\right) = ${toFractionLatex(deg)}°$$`);
    return { resultScalar: deg, isAngle: true, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

export function vecScalarProjection(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const mv = magnitude(v, is3D);
    if (mv < 1e-12) throw new Error("Can't project onto the zero vector.");
    const d = dot(u, v, is3D);
    const comp = d / mv;
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, is3D, "u")}, \\quad ${vecLatex(v, is3D, "v")}$$`);
    steps.push(`##Scalar Projection Formula\n$$\\text{comp}_{\\vec{v}}\\vec{u} = \\frac{\\vec{u}\\cdot\\vec{v}}{|\\vec{v}|}$$`);
    steps.push(`##Dot Product and Magnitude\n$$\\vec{u}\\cdot\\vec{v} = ${toFractionLatex(d)}, \\quad |\\vec{v}| = ${toFractionLatex(mv)}$$`);
    steps.push(`##Result\n$$\\text{comp}_{\\vec{v}}\\vec{u} = \\frac{${toFractionLatex(d)}}{${toFractionLatex(mv)}} = ${toFractionLatex(comp)}$$`);
    return { resultScalar: comp, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

export function vecVectorProjection(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const mv2 = v.x * v.x + v.y * v.y + (is3D ? v.z * v.z : 0);
    if (mv2 < 1e-12) throw new Error("Can't project onto the zero vector.");
    const d = dot(u, v, is3D);
    const k = d / mv2;
    const r: Vec3 = { x: k * v.x, y: k * v.y, z: is3D ? k * v.z : 0 };
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, is3D, "u")}, \\quad ${vecLatex(v, is3D, "v")}$$`);
    steps.push(`##Vector Projection Formula\n$$\\text{proj}_{\\vec{v}}\\vec{u} = \\frac{\\vec{u}\\cdot\\vec{v}}{|\\vec{v}|^2}\\,\\vec{v}$$`);
    steps.push(`##Scalar Factor\n$$\\vec{u}\\cdot\\vec{v} = ${toFractionLatex(d)}, \\quad |\\vec{v}|^2 = ${toFractionLatex(mv2)}, \\quad k = \\frac{${toFractionLatex(d)}}{${toFractionLatex(mv2)}} = ${toFractionLatex(k)}$$`);
    const comp = is3D
      ? `(${w(k)}\\cdot ${w(v.x)}, \\; ${w(k)}\\cdot ${w(v.y)}, \\; ${w(k)}\\cdot ${w(v.z)})`
      : `(${w(k)}\\cdot ${w(v.x)}, \\; ${w(k)}\\cdot ${w(v.y)})`;
    steps.push(`##Multiply k by v\n$$${comp}$$`);
    steps.push(`##Result\n$$\\text{proj}_{\\vec{v}}\\vec{u} = ${vecLatex(r, is3D)}$$`);
    return { resultVector: r, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

// ── Many vectors & the scalar triple product ─────────────────────────────────
export const VECTOR_NAMES = ["u", "v", "w", "a", "b", "c"];

/** u + v + w + … (any number of vectors, component by component). */
export function vecSumMany(vs: Vec3[], is3D: boolean): VectorResult {
  try {
    if (vs.length < 2) throw new Error("Add at least two vectors.");
    vs.forEach((v, i) => {
      const n = VECTOR_NAMES[i] ?? `v${i + 1}`;
      if (!isFinite(v.x) || !isFinite(v.y) || (is3D && !isFinite(v.z))) throw new Error(`Vector ${n} has a component that isn't a valid number.`);
    });
    const r: Vec3 = { x: 0, y: 0, z: 0 };
    vs.forEach((v) => { r.x += v.x; r.y += v.y; r.z += is3D ? v.z : 0; });
    const names = vs.map((_, i) => VECTOR_NAMES[i] ?? `v${i + 1}`);
    const sumName = names.map((n) => `\\vec{${n}}`).join("+");
    const steps: string[] = [];
    steps.push(`##Given\n$$${vs.map((v, i) => vecLatex(v, is3D, names[i])).join(", \\quad ")}$$`);
    const axis = (pick: (v: Vec3) => number) => vs.map((v, i) => (i === 0 ? toFractionLatex(pick(v)) : `+${w(pick(v))}`)).join("");
    const comp = is3D ? `(${axis((v) => v.x)}, \\; ${axis((v) => v.y)}, \\; ${axis((v) => v.z)})` : `(${axis((v) => v.x)}, \\; ${axis((v) => v.y)})`;
    steps.push(`##Add Component-Wise\n$$${sumName} = ${comp}$$`);
    steps.push(`##Result\n$$${vecLatex(r, is3D)}$$`);
    return { resultVector: r, is3D, steps };
  } catch (e) {
    return { is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}

/** u · (v × w): signed volume of the parallelepiped built on the three vectors. */
export function vecTripleProduct(u: Vec3, v: Vec3, wv: Vec3): VectorResult {
  try {
    for (const [n, q] of [["u", u], ["v", v], ["w", wv]] as const) {
      if (!isFinite(q.x) || !isFinite(q.y) || !isFinite(q.z)) throw new Error(`Vector ${n} has a component that isn't a valid number.`);
    }
    const c: Vec3 = { x: v.y * wv.z - v.z * wv.y, y: v.z * wv.x - v.x * wv.z, z: v.x * wv.y - v.y * wv.x };
    const val = u.x * c.x + u.y * c.y + u.z * c.z;
    const steps: string[] = [];
    steps.push(`##Given\n$$${vecLatex(u, true, "u")}, \\quad ${vecLatex(v, true, "v")}, \\quad ${vecLatex(wv, true, "w")}$$`);
    steps.push(`##Cross Product $\\vec{v}\\times\\vec{w}$\n$$\\vec{v}\\times\\vec{w} = ${vecLatex(c, true)}$$`);
    steps.push(`##Dot with $\\vec{u}$\n$$\\vec{u}\\cdot(\\vec{v}\\times\\vec{w}) = ${w(u.x)}\\cdot ${w(c.x)} + ${w(u.y)}\\cdot ${w(c.y)} + ${w(u.z)}\\cdot ${w(c.z)} = ${toFractionLatex(val)}$$`);
    steps.push(`##Volume\n$$V = \\left|\\vec{u}\\cdot(\\vec{v}\\times\\vec{w})\\right| = ${toFractionLatex(Math.abs(val))}$$\n${Math.abs(val) < 1e-12 ? "The three vectors are coplanar (volume 0)." : val > 0 ? "Positive: $\\vec{u},\\vec{v},\\vec{w}$ form a right-handed set." : "Negative: $\\vec{u},\\vec{v},\\vec{w}$ form a left-handed set."}`);
    return { resultScalar: val, is3D: true, steps };
  } catch (e) {
    return { is3D: true, steps: [], error: e instanceof Error ? e.message : "Invalid input" };
  }
}


// ── extra operations ─────────────────────────────────────────────────────────

const fail = (is3D: boolean, e: unknown): VectorResult => ({ is3D, steps: [], error: e instanceof Error ? e.message : "Invalid input" });

/** Distance between the points u and v. */
export function vecDistance(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const dx = v.x - u.x, dy = v.y - u.y, dz = is3D ? v.z - u.z : 0;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = [
      `##Given (as points)\n$$P = ${vecLatex(u, is3D)}, \\quad Q = ${vecLatex(v, is3D)}$$`,
      `##Distance Formula\n$$d = \\sqrt{(${w(v.x)}-${w(u.x)})^2 + (${w(v.y)}-${w(u.y)})^2${is3D ? ` + (${w(v.z)}-${w(u.z)})^2` : ""}}$$`,
      `##Result\n$$d = \\sqrt{${toFractionLatex(dx * dx + dy * dy + dz * dz)}} = ${toFractionLatex(d)}$$`,
    ];
    return { resultScalar: d, is3D, steps };
  } catch (e) { return fail(is3D, e); }
}

/** Midpoint of the segment from u to v. */
export function vecMidpoint(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const m: Vec3 = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2, z: is3D ? (u.z + v.z) / 2 : 0 };
    const steps = [
      `##Given (as points)\n$$P = ${vecLatex(u, is3D)}, \\quad Q = ${vecLatex(v, is3D)}$$`,
      `##Midpoint Formula\n$$M = \\left(\\frac{x_1+x_2}{2}, \\frac{y_1+y_2}{2}${is3D ? ", \\frac{z_1+z_2}{2}" : ""}\\right)$$`,
      `##Result\n$$M = ${vecLatex(m, is3D)}$$`,
    ];
    return { resultVector: m, is3D, steps };
  } catch (e) { return fail(is3D, e); }
}

/** Area of the parallelogram spanned by u and v, and of the triangle they form. */
export function vecArea(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const cx = u.y * (is3D ? v.z : 0) - (is3D ? u.z : 0) * v.y;
    const cy = (is3D ? u.z : 0) * v.x - u.x * (is3D ? v.z : 0);
    const cz = u.x * v.y - u.y * v.x;
    const area = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const steps: string[] = [`##Given\n$$${vecLatex(u, is3D, "u")}, \\quad ${vecLatex(v, is3D, "v")}$$`];
    if (is3D) {
      steps.push(`##Cross Product\n$$\\vec{u}\\times\\vec{v} = ${vecLatex({ x: cx, y: cy, z: cz }, true)}$$`);
      steps.push(`##Parallelogram Area = |u × v|\n$$A = \\sqrt{${toFractionLatex(cx)}^2 + ${toFractionLatex(cy)}^2 + ${toFractionLatex(cz)}^2} = ${toFractionLatex(area)}$$`);
    } else {
      steps.push(`##2D Cross Product (a Determinant)\n$$A = \\left|\\begin{vmatrix}${toFractionLatex(u.x)}&${toFractionLatex(u.y)}\\\\${toFractionLatex(v.x)}&${toFractionLatex(v.y)}\\end{vmatrix}\\right| = |${toFractionLatex(cz)}| = ${toFractionLatex(area)}$$`);
    }
    steps.push(`##Triangle Area = Half of That\n$$A_{\\triangle} = \\tfrac{1}{2}A = ${toFractionLatex(area / 2)}$$`);
    return { resultScalar: area, is3D, steps };
  } catch (e) { return fail(is3D, e); }
}

/** Direction cosines (cos α, cos β, cos γ) of u. */
export function vecDirectionCosines(u: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, null, is3D);
    const m = magnitude(u, is3D);
    if (m === 0) throw new Error("The zero vector has no direction.");
    const r: Vec3 = { x: u.x / m, y: u.y / m, z: is3D ? u.z / m : 0 };
    const deg = (c: number) => toFractionLatex((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
    const steps = [
      `##Given\n$$${vecLatex(u, is3D, "u")}, \\quad ${magLatex("u", u, is3D)} = ${toFractionLatex(m)}$$`,
      `##Direction Cosines\n$$\\cos\\alpha = \\frac{u_x}{|\\vec{u}|}, \\quad \\cos\\beta = \\frac{u_y}{|\\vec{u}|}${is3D ? ", \\quad \\cos\\gamma = \\frac{u_z}{|\\vec{u}|}" : ""}$$`,
      `##Result\n$$\\langle\\cos\\alpha, \\cos\\beta${is3D ? ", \\cos\\gamma" : ""}\\rangle = ${vecLatex(r, is3D)}$$`,
      `##Direction Angles\n$$\\alpha = ${deg(r.x)}^\\circ, \\quad \\beta = ${deg(r.y)}^\\circ${is3D ? `, \\quad \\gamma = ${deg(r.z)}^\\circ` : ""}$$`,
      ...(is3D ? [`##Check\n$$\\cos^2\\alpha + \\cos^2\\beta + \\cos^2\\gamma = ${toFractionLatex(r.x * r.x + r.y * r.y + r.z * r.z)}$$`] : []),
    ];
    return { resultVector: r, is3D, steps };
  } catch (e) { return fail(is3D, e); }
}

/** Are u and v orthogonal, parallel, or neither? */
export function vecRelation(u: Vec3, v: Vec3, is3D: boolean): VectorResult {
  try {
    assertVectorsUsable(u, v, is3D);
    const d = dot(u, v, is3D);
    const cx = u.y * (is3D ? v.z : 0) - (is3D ? u.z : 0) * v.y;
    const cy = (is3D ? u.z : 0) * v.x - u.x * (is3D ? v.z : 0);
    const cz = u.x * v.y - u.y * v.x;
    const crossZero = Math.abs(cx) < 1e-9 && Math.abs(cy) < 1e-9 && Math.abs(cz) < 1e-9;
    const dotZero = Math.abs(d) < 1e-9;
    let verdict = "Neither parallel nor orthogonal";
    if (u.x === 0 && u.y === 0 && (!is3D || u.z === 0) || v.x === 0 && v.y === 0 && (!is3D || v.z === 0)) verdict = "A zero vector is both parallel and orthogonal to everything";
    else if (dotZero) verdict = "Orthogonal (perpendicular)";
    else if (crossZero) verdict = d > 0 ? "Parallel (same direction)" : "Parallel (opposite direction)";
    const steps = [
      `##Given\n$$${vecLatex(u, is3D, "u")}, \\quad ${vecLatex(v, is3D, "v")}$$`,
      `##Test for Orthogonal: Dot Product = 0\n$$\\vec{u}\\cdot\\vec{v} = ${toFractionLatex(d)}${dotZero ? " = 0" : " \\ne 0"}$$`,
      `##Test for Parallel: Cross Product = 0\n$$\\vec{u}\\times\\vec{v} = ${is3D ? vecLatex({ x: cx, y: cy, z: cz }, true) : toFractionLatex(cz)}${crossZero ? " = \\vec{0}" : " \\ne \\vec{0}"}$$`,
      `##Conclusion\n${verdict}.`,
    ];
    return { verdict, is3D, steps };
  } catch (e) { return fail(is3D, e); }
}
