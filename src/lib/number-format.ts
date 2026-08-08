// Centralized numeric display formatting — honors the user's global
// Decimal / Fraction / Scientific Notation + Decimal Places settings.

export type NumberForm = "decimal" | "fraction" | "scientific";

export interface FormatSettings {
  numberForm: NumberForm;
  decimalPlaces: number;
}

/**
 * Approximate a real number as a fraction using a continued-fraction
 * expansion (Stern–Brocot style convergents). Good enough for displaying
 * calculator results as fractions, including irrational approximations.
 */
export function toFraction(value: number, maxDenominator = 100000): string {
  if (!isFinite(value)) return value > 0 ? "∞" : value < 0 ? "-∞" : "NaN";
  if (value === 0) return "0";

  const sign = value < 0 ? "-" : "";
  const x = Math.abs(value);
  const whole = Math.floor(x);
  const frac = x - whole;

  if (frac < 1e-10) return `${sign}${whole}`;

  // Continued fraction convergents
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
  let b = frac;
  let num = 0, den = 1;

  for (let i = 0; i < 32; i++) {
    const a = Math.floor(b);
    const h = a * h1 + h2;
    const k = a * k1 + k2;
    if (k > maxDenominator) break;
    h2 = h1; h1 = h;
    k2 = k1; k1 = k;
    num = h1; den = k1;

    const remainder = b - a;
    if (Math.abs(remainder) < 1e-10) break;
    if (Math.abs(frac - num / den) < 1e-10) break;
    b = 1 / remainder;
  }

  if (den === 1) return `${sign}${whole + num}`;
  if (whole === 0) return `${sign}${num}/${den}`;
  return `${sign}${whole} ${num}/${den}`;
}

/** Format a finite number according to global display settings. */
export function formatNumber(value: number, settings: FormatSettings): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "NaN";
  if (!isFinite(value)) return value > 0 ? "∞" : "-∞";

  const places = Math.min(10, Math.max(0, settings.decimalPlaces));

  switch (settings.numberForm) {
    case "scientific": {
      if (value === 0) return `0e+0`;
      return value.toExponential(places);
    }
    case "fraction":
      return toFraction(value);
    case "decimal":
    default: {
      // Fixed decimal places, but don't show "3.0000" noise for whole numbers
      // beyond what's needed — still respects the user's chosen precision.
      return value.toFixed(places);
    }
  }
}

/** Round a number for *display in step text* without changing its real value. */
export function roundForSteps(value: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}

/** Convert radians to degrees. */
export function radToDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

/** Convert degrees to radians. */
export function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/** Format an angle in radians, displaying in the user's preferred unit. */
export function formatAngle(rad: number, useRadians: boolean, places = 4): string {
  if (!isFinite(rad)) return useRadians ? (rad > 0 ? "∞ rad" : "-∞ rad") : (rad > 0 ? "∞°" : "-∞°");
  if (useRadians) return `${roundForSteps(rad, places)} rad`;
  return `${roundForSteps(radToDeg(rad), places)}°`;
}
