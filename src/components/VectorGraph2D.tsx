/**
 * A simple 2D arrow diagram for the Vector calculator — grid, axes, and one
 * arrow per vector (auto-scaled to fit, origin-anchored unless a `from`
 * point is given for tip-to-tail display). Plain SVG, same spirit as
 * ShapeDiagram, but computed from live vector values instead of a fixed
 * lookup table.
 */
interface VectorArrow {
  x: number;
  y: number;
  color: string;
  label: string;
  /** Tail point, default the origin — set this to draw tip-to-tail (e.g.
   *  showing v starting where u ends, to illustrate u+v geometrically). */
  from?: { x: number; y: number };
}

const SIZE = 280;
const PAD = 28;

export function VectorGraph2D({ vectors }: { vectors: VectorArrow[] }) {
  const usable = vectors.filter((v) => isFinite(v.x) && isFinite(v.y));
  if (usable.length === 0) return null;

  // Scale so every vector (tail and tip) fits inside the drawing area with
  // some breathing room, and the grid always includes the origin.
  let maxAbs = 1;
  for (const v of usable) {
    const fx = v.from?.x ?? 0, fy = v.from?.y ?? 0;
    maxAbs = Math.max(maxAbs, Math.abs(fx), Math.abs(fy), Math.abs(fx + v.x), Math.abs(fy + v.y));
  }
  const scale = ((SIZE - PAD * 2) / 2) / (maxAbs * 1.15);
  const cx = SIZE / 2, cy = SIZE / 2;
  const toPx = (x: number, y: number) => ({ px: cx + x * scale, py: cy - y * scale });

  // Grid lines at "nice" integer steps, however many fit.
  const step = Math.max(1, Math.round(maxAbs / 4));
  const gridLines: number[] = [];
  for (let g = -Math.ceil(maxAbs); g <= Math.ceil(maxAbs); g += step) gridLines.push(g);

  const axisColor = "var(--color-muted-foreground)";
  const gridColor = "color-mix(in oklch, var(--color-muted-foreground) 15%, transparent)";

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[280px] mx-auto" role="img" aria-label="2D vector diagram">
      {gridLines.map((g) => {
        const { px } = toPx(g, 0);
        const { py } = toPx(0, g);
        return (
          <g key={`grid-${g}`}>
            <line x1={px} y1={PAD} x2={px} y2={SIZE - PAD} stroke={gridColor} strokeWidth="1" />
            <line x1={PAD} y1={py} x2={SIZE - PAD} y2={py} stroke={gridColor} strokeWidth="1" />
          </g>
        );
      })}

      {/* axes */}
      <line x1={PAD} y1={cy} x2={SIZE - PAD} y2={cy} stroke={axisColor} strokeWidth="1.5" />
      <line x1={cx} y1={PAD} x2={cx} y2={SIZE - PAD} stroke={axisColor} strokeWidth="1.5" />

      {usable.map((v, i) => {
        const fx = v.from?.x ?? 0, fy = v.from?.y ?? 0;
        const tx = fx + v.x, ty = fy + v.y;
        const a = toPx(fx, fy);
        const b = toPx(tx, ty);
        const dx = b.px - a.px, dy = b.py - a.py;
        const len = Math.hypot(dx, dy);
        if (len < 1) return null;
        const ux = dx / len, uy = dy / len;
        const headLen = 9, headWidth = 5.5;
        const baseX = b.px - ux * headLen, baseY = b.py - uy * headLen;
        const perpX = -uy * headWidth, perpY = ux * headWidth;
        const labelX = (a.px + b.px) / 2 + (-uy) * 12;
        const labelY = (a.py + b.py) / 2 + ux * 12;

        return (
          <g key={i}>
            <line x1={a.px} y1={a.py} x2={baseX} y2={baseY} stroke={v.color} strokeWidth="2.5" strokeLinecap="round" />
            <polygon
              points={`${b.px},${b.py} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}`}
              fill={v.color}
            />
            <text x={labelX} y={labelY} fontSize="12" fontStyle="italic" fontWeight="600" fill={v.color} textAnchor="middle" fontFamily="ui-monospace, monospace">
              {v.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
