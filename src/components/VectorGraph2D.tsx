import type { Scene, SArrow } from "@/lib/vector-scene";

/**
 * 2D vector diagram (plain SVG): grid with numbered axes, every arrow of the
 * scene (tip-to-tail chains, dashed helper copies, results), translucent
 * parallelograms, projection drop-lines, angle arcs — all computed from the
 * live vector values, auto-scaled to fit.
 */
const SIZE = 420;
const PAD = 40;

function niceStep(range: number): number {
  const raw = range / 5;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function tick(v: number, step: number): string {
  const digits = Math.min(4, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  return v.toFixed(digits).replace(/\.?0+$/, "");
}

export function VectorGraph2D({ scene }: { scene: Scene }) {
  if (scene.arrows.length === 0) return null;
  const half = scene.extent * 1.15;
  const scale = (SIZE / 2 - PAD) / half;
  const c = SIZE / 2;
  const X = (x: number) => c + x * scale;
  const Y = (y: number) => c - y * scale;
  const step = niceStep(half * 2);
  const ticks: number[] = [];
  for (let g = -Math.floor(half / step) * step; g <= half + 1e-9; g += step) ticks.push(parseFloat(g.toFixed(10)));

  const axisColor = "var(--color-muted-foreground)";
  const gridColor = "color-mix(in oklch, var(--color-muted-foreground) 14%, transparent)";
  const mutedText = "color-mix(in oklch, var(--color-muted-foreground) 90%, transparent)";

  const renderArrow = (a: SArrow, i: number) => {
    const x1 = X(a.from.x), y1 = Y(a.from.y);
    const x2 = X(a.from.x + a.vec.x), y2 = Y(a.from.y + a.vec.y);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1.5) return null;
    const ux = dx / len, uy = dy / len;
    const w = a.width ?? 2.6;
    const head = Math.min(len * 0.6, 8 + w * 1.6);
    const hw = head * 0.42;
    const bx = x2 - ux * head, by = y2 - uy * head;
    const op = a.faint ? 0.5 : 1;
    return (
      <g key={`a${i}`} opacity={op}>
        <line x1={x1} y1={y1} x2={bx} y2={by} stroke={a.color} strokeWidth={w} strokeLinecap="round" strokeDasharray={a.dashed ? "6 5" : undefined} />
        <polygon points={`${x2},${y2} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`} fill={a.color} />
        {a.label && (
          <text
            x={(x1 + x2) / 2 - uy * 14}
            y={(y1 + y2) / 2 + ux * 14}
            fontSize="13" fontStyle="italic" fontWeight="700" fill={a.color} textAnchor="middle" fontFamily="ui-monospace, monospace"
            style={{ paintOrder: "stroke", stroke: "var(--color-background)", strokeWidth: 3 }}
          >
            {a.label}
          </text>
        )}
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[440px] mx-auto" role="img" aria-label="2D vector diagram">
      {ticks.map((g) => (
        <g key={`g${g}`}>
          <line x1={X(g)} y1={PAD / 2} x2={X(g)} y2={SIZE - PAD / 2} stroke={gridColor} strokeWidth="1" />
          <line x1={PAD / 2} y1={Y(g)} x2={SIZE - PAD / 2} y2={Y(g)} stroke={gridColor} strokeWidth="1" />
          {Math.abs(g) > 1e-9 && (
            <>
              <text x={X(g)} y={c + 14} fontSize="10" fill={mutedText} textAnchor="middle" fontFamily="ui-monospace, monospace">{tick(g, step)}</text>
              <text x={c - 6} y={Y(g) + 3.5} fontSize="10" fill={mutedText} textAnchor="end" fontFamily="ui-monospace, monospace">{tick(g, step)}</text>
            </>
          )}
        </g>
      ))}
      <line x1={PAD / 2} y1={c} x2={SIZE - PAD / 2} y2={c} stroke={axisColor} strokeWidth="1.4" />
      <line x1={c} y1={PAD / 2} x2={c} y2={SIZE - PAD / 2} stroke={axisColor} strokeWidth="1.4" />
      <text x={SIZE - PAD / 2 - 4} y={c - 7} fontSize="12" fontStyle="italic" fill={axisColor} textAnchor="end">x</text>
      <text x={c + 8} y={PAD / 2 + 8} fontSize="12" fontStyle="italic" fill={axisColor}>y</text>

      {scene.polys.map((p, i) => (
        <polygon key={`p${i}`} points={p.points.map((q) => `${X(q.x)},${Y(q.y)}`).join(" ")} fill={p.color} fillOpacity={p.opacity} stroke="none" />
      ))}
      {scene.lines.map((l, i) => (
        <polyline
          key={`l${i}`}
          points={l.points.map((q) => `${X(q.x)},${Y(q.y)}`).join(" ")}
          fill="none" stroke={l.color} strokeWidth={l.faint ? 1.2 : 1.6} strokeDasharray={l.dashed ? "5 4" : undefined} opacity={l.faint ? 0.75 : 1}
        />
      ))}
      {scene.arcs.map((a, i) => {
        const mid = a.points[Math.floor(a.points.length / 2)];
        return (
          <g key={`r${i}`}>
            <polyline points={a.points.map((q) => `${X(q.x)},${Y(q.y)}`).join(" ")} fill="none" stroke={a.color} strokeWidth="2" />
            {a.label && (
              <text x={X(mid.x * 1.55)} y={Y(mid.y * 1.55) + 4} fontSize="11.5" fontWeight="700" fill={a.color} textAnchor="middle" fontFamily="ui-monospace, monospace"
                style={{ paintOrder: "stroke", stroke: "var(--color-background)", strokeWidth: 3 }}>
                {a.label}
              </text>
            )}
          </g>
        );
      })}
      {scene.arrows.map(renderArrow)}
      <circle cx={c} cy={c} r="2.6" fill={axisColor} />
    </svg>
  );
}
