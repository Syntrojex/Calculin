/**
 * Small labeled diagrams for the Geometry definitions page — the same idea as
 * the labeled axes on the 3D plots: a picture of the shape with its parts
 * (radius, chord, apothem, slant height…) marked, so a term like "sector" is
 * understood at a glance instead of only from prose.
 *
 * Everything is plain inline SVG using the app's theme variables, so the
 * diagrams follow the active accent color and work in light and dark mode.
 */

type DiagramKey =
  | "circle-radius" | "circle-diameter" | "chord" | "arc" | "sector" | "ring"
  | "rectangle" | "triangle" | "right-triangle" | "polygon" | "regular-polygon"
  | "parallelogram" | "trapezoid" | "rhombus" | "ellipse"
  | "congruent" | "similar" | "angle"
  | "cube" | "cuboid" | "cylinder" | "cone" | "sphere";

const S = "var(--color-primary)";       // shape stroke
const F = "color-mix(in oklch, var(--color-primary) 12%, transparent)"; // shape fill
const M = "var(--color-muted-foreground)"; // measurement lines / labels

/** Shared text style for a dimension label. */
function L({ x, y, children, anchor = "middle" }: { x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize="11" fontStyle="italic" fill={M} fontFamily="ui-monospace, monospace">
      {children}
    </text>
  );
}

/** A thin measurement line with small end ticks. */
function Dim({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={M} strokeWidth="1" strokeDasharray="3 2" />;
}

const DIAGRAMS: Record<DiagramKey, React.ReactNode> = {
  "circle-radius": (
    <>
      <circle cx="100" cy="70" r="48" fill={F} stroke={S} strokeWidth="2" />
      <circle cx="100" cy="70" r="2.5" fill={M} />
      <line x1="100" y1="70" x2="148" y2="70" stroke={M} strokeWidth="1.5" />
      <L x={124} y={64}>r</L>
      <L x={96} y={84} anchor="end">center</L>
    </>
  ),
  "circle-diameter": (
    <>
      <circle cx="100" cy="70" r="48" fill={F} stroke={S} strokeWidth="2" />
      <circle cx="100" cy="70" r="2.5" fill={M} />
      <line x1="52" y1="70" x2="148" y2="70" stroke={M} strokeWidth="1.5" />
      <L x={100} y={64}>d = 2r</L>
    </>
  ),
  chord: (
    <>
      <circle cx="100" cy="70" r="48" fill={F} stroke={S} strokeWidth="2" />
      <line x1="64" y1="38" x2="140" y2="88" stroke={M} strokeWidth="1.8" />
      <circle cx="64" cy="38" r="2.5" fill={M} />
      <circle cx="140" cy="88" r="2.5" fill={M} />
      <L x={96} y={58}>chord</L>
    </>
  ),
  arc: (
    <>
      <circle cx="100" cy="70" r="48" fill={F} stroke={S} strokeWidth="2" strokeOpacity="0.3" />
      <path d="M 148 70 A 48 48 0 0 0 100 22" fill="none" stroke={S} strokeWidth="3.5" />
      <circle cx="148" cy="70" r="2.5" fill={M} />
      <circle cx="100" cy="22" r="2.5" fill={M} />
      <L x={150} y={34} anchor="start">arc</L>
    </>
  ),
  sector: (
    <>
      <circle cx="100" cy="70" r="48" fill="none" stroke={S} strokeWidth="1.5" strokeOpacity="0.35" />
      <path d="M 100 70 L 148 70 A 48 48 0 0 0 100 22 Z" fill={F} stroke={S} strokeWidth="2" />
      <path d="M 118 70 A 18 18 0 0 0 100 52" fill="none" stroke={M} strokeWidth="1" />
      <L x={126} y={62}>θ</L>
      <L x={128} y={86}>r</L>
      <L x={152} y={30} anchor="start">sector</L>
    </>
  ),
  ring: (
    <>
      <circle cx="100" cy="70" r="48" fill={F} stroke={S} strokeWidth="2" />
      <circle cx="100" cy="70" r="26" fill="var(--color-background)" stroke={S} strokeWidth="2" />
      <line x1="100" y1="70" x2="126" y2="70" stroke={M} strokeWidth="1.5" />
      <line x1="100" y1="70" x2="100" y2="22" stroke={M} strokeWidth="1.5" />
      <L x={113} y={64}>r</L>
      <L x={92} y={44} anchor="end">R</L>
    </>
  ),
  rectangle: (
    <>
      <rect x="40" y="30" width="120" height="70" rx="2" fill={F} stroke={S} strokeWidth="2" />
      <Dim x1={40} y1={112} x2={160} y2={112} />
      <Dim x1={26} y1={30} x2={26} y2={100} />
      <L x={100} y={126}>length (l)</L>
      <L x={20} y={68} anchor="end">w</L>
    </>
  ),
  triangle: (
    <>
      <polygon points="40,105 160,105 110,25" fill={F} stroke={S} strokeWidth="2" />
      <line x1="110" y1="25" x2="110" y2="105" stroke={M} strokeWidth="1" strokeDasharray="3 2" />
      <path d="M 110 97 L 118 97 L 118 105" fill="none" stroke={M} strokeWidth="1" />
      <L x={116} y={70} anchor="start">h</L>
      <L x={75} y={120}>base (b)</L>
      <L x={62} y={62} anchor="end">c</L>
      <L x={142} y={62} anchor="start">a</L>
    </>
  ),
  "right-triangle": (
    <>
      <polygon points="45,105 155,105 45,30" fill={F} stroke={S} strokeWidth="2" />
      <path d="M 45 93 L 57 93 L 57 105" fill="none" stroke={M} strokeWidth="1.2" />
      <L x={100} y={122}>b (base)</L>
      <L x={38} y={70} anchor="end">a</L>
      <L x={108} y={60} anchor="start">c (hyp)</L>
    </>
  ),
  polygon: (
    <>
      <polygon points="45,95 70,35 125,25 165,70 130,108" fill={F} stroke={S} strokeWidth="2" />
      <L x={100} y={126}>5 straight sides, closed</L>
    </>
  ),
  "regular-polygon": (
    <>
      <polygon points="100,22 145,50 128,102 72,102 55,50" fill={F} stroke={S} strokeWidth="2" />
      <circle cx="100" cy="66" r="2.5" fill={M} />
      <line x1="100" y1="66" x2="100" y2="102" stroke={M} strokeWidth="1.2" strokeDasharray="3 2" />
      <line x1="100" y1="66" x2="145" y2="50" stroke={M} strokeWidth="1.2" strokeDasharray="3 2" />
      <L x={94} y={90} anchor="end">a</L>
      <L x={130} y={62} anchor="start">R</L>
      <L x={100} y={126}>all sides & angles equal</L>
    </>
  ),
  parallelogram: (
    <>
      <polygon points="35,100 105,100 165,35 95,35" fill={F} stroke={S} strokeWidth="2" />
      <line x1="105" y1="35" x2="105" y2="100" stroke={M} strokeWidth="1" strokeDasharray="3 2" />
      <path d="M 105 92 L 113 92 L 113 100" fill="none" stroke={M} strokeWidth="1" />
      <L x={112} y={70} anchor="start">h</L>
      <L x={70} y={118}>base (b)</L>
    </>
  ),
  trapezoid: (
    <>
      <polygon points="35,100 165,100 130,32 70,32" fill={F} stroke={S} strokeWidth="2" />
      <line x1="70" y1="32" x2="70" y2="100" stroke={M} strokeWidth="1" strokeDasharray="3 2" />
      <path d="M 70 92 L 78 92 L 78 100" fill="none" stroke={M} strokeWidth="1" />
      <L x={100} y={26}>a</L>
      <L x={100} y={118}>b</L>
      <L x={78} y={70} anchor="start">h</L>
    </>
  ),
  rhombus: (
    <>
      <polygon points="100,20 165,66 100,112 35,66" fill={F} stroke={S} strokeWidth="2" />
      <line x1="35" y1="66" x2="165" y2="66" stroke={M} strokeWidth="1.2" strokeDasharray="3 2" />
      <line x1="100" y1="20" x2="100" y2="112" stroke={M} strokeWidth="1.2" strokeDasharray="3 2" />
      <L x={140} y={60}>d₁</L>
      <L x={92} y={38} anchor="end">d₂</L>
      <L x={100} y={128}>all 4 sides equal</L>
    </>
  ),
  ellipse: (
    <>
      <ellipse cx="100" cy="66" rx="62" ry="38" fill={F} stroke={S} strokeWidth="2" />
      <line x1="100" y1="66" x2="162" y2="66" stroke={M} strokeWidth="1.5" />
      <line x1="100" y1="66" x2="100" y2="28" stroke={M} strokeWidth="1.5" />
      <circle cx="100" cy="66" r="2.5" fill={M} />
      <L x={134} y={60}>a</L>
      <L x={94} y={46} anchor="end">b</L>
    </>
  ),
  congruent: (
    <>
      <polygon points="25,100 85,100 55,35" fill={F} stroke={S} strokeWidth="2" />
      <polygon points="115,100 175,100 145,35" fill={F} stroke={S} strokeWidth="2" />
      <L x={55} y={122}>same size</L>
      <L x={145} y={122}>same shape</L>
      <text x="100" y="78" textAnchor="middle" fontSize="16" fill={M}>≅</text>
    </>
  ),
  similar: (
    <>
      <polygon points="20,100 80,100 50,40" fill={F} stroke={S} strokeWidth="2" />
      <polygon points="125,100 165,100 145,60" fill={F} stroke={S} strokeWidth="2" />
      <text x="102" y="86" textAnchor="middle" fontSize="16" fill={M}>~</text>
      <L x={100} y={122}>same angles, scaled sides</L>
    </>
  ),
  angle: (
    <>
      <line x1="40" y1="100" x2="170" y2="100" stroke={S} strokeWidth="2" />
      <line x1="40" y1="100" x2="145" y2="30" stroke={S} strokeWidth="2" />
      <path d="M 80 100 A 40 40 0 0 0 66 76" fill="none" stroke={M} strokeWidth="1.3" />
      <L x={88} y={88}>θ</L>
      <L x={40} y={118}>vertex</L>
    </>
  ),
  cube: (
    <>
      <polygon points="50,55 120,55 120,115 50,115" fill={F} stroke={S} strokeWidth="2" />
      <polygon points="50,55 78,28 148,28 120,55" fill={F} stroke={S} strokeWidth="2" />
      <polygon points="120,55 148,28 148,88 120,115" fill={F} stroke={S} strokeWidth="2" />
      <L x={85} y={132}>s</L>
      <L x={160} y={70} anchor="start">s</L>
      <L x={110} y={22}>s</L>
    </>
  ),
  cuboid: (
    <>
      <polygon points="40,60 125,60 125,112 40,112" fill={F} stroke={S} strokeWidth="2" />
      <polygon points="40,60 68,34 153,34 125,60" fill={F} stroke={S} strokeWidth="2" />
      <polygon points="125,60 153,34 153,86 125,112" fill={F} stroke={S} strokeWidth="2" />
      <L x={82} y={128}>l</L>
      <L x={165} y={76} anchor="start">h</L>
      <L x={140} y={28}>w</L>
    </>
  ),
  cylinder: (
    <>
      <ellipse cx="100" cy="36" rx="45" ry="14" fill={F} stroke={S} strokeWidth="2" />
      <path d="M 55 36 L 55 100 A 45 14 0 0 0 145 100 L 145 36" fill={F} stroke={S} strokeWidth="2" />
      <line x1="100" y1="36" x2="145" y2="36" stroke={M} strokeWidth="1.3" />
      <line x1="158" y1="36" x2="158" y2="100" stroke={M} strokeWidth="1" strokeDasharray="3 2" />
      <L x={122} y={30}>r</L>
      <L x={165} y={72} anchor="start">h</L>
    </>
  ),
  cone: (
    <>
      <path d="M 100 20 L 148 100 A 48 14 0 0 1 52 100 Z" fill={F} stroke={S} strokeWidth="2" />
      <ellipse cx="100" cy="100" rx="48" ry="14" fill="none" stroke={S} strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1="100" y1="20" x2="100" y2="100" stroke={M} strokeWidth="1" strokeDasharray="3 2" />
      <line x1="100" y1="100" x2="148" y2="100" stroke={M} strokeWidth="1.3" />
      <L x={94} y={64} anchor="end">h</L>
      <L x={126} y={114}>r</L>
      <L x={134} y={56} anchor="start">l (slant)</L>
    </>
  ),
  sphere: (
    <>
      <circle cx="100" cy="66" r="46" fill={F} stroke={S} strokeWidth="2" />
      <ellipse cx="100" cy="66" rx="46" ry="15" fill="none" stroke={S} strokeWidth="1.2" strokeDasharray="4 3" />
      <line x1="100" y1="66" x2="146" y2="66" stroke={M} strokeWidth="1.5" />
      <circle cx="100" cy="66" r="2.5" fill={M} />
      <L x={124} y={60}>r</L>
    </>
  ),
};

export type { DiagramKey };

export function ShapeDiagram({ name }: { name: string }) {
  const content = DIAGRAMS[name as DiagramKey];
  if (!content) return null;
  return (
    <div className="mt-2 flex justify-center rounded-lg bg-muted/30 border border-border/40 py-2">
      <svg viewBox="0 0 200 140" className="w-full max-w-[220px] h-auto" role="img" aria-label={`${name} diagram`}>
        {content}
      </svg>
    </div>
  );
}
