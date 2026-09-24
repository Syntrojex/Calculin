/**
 * Plain SVG-markup source for the Geometry definitions' labeled diagrams —
 * the single source of truth for every shape picture (radius, chord,
 * sector, cone slant height, …). Used two ways:
 *  - on-screen, by ShapeDiagram.tsx, via dangerouslySetInnerHTML
 *  - in the definitions PDF export, which rasterizes this same markup to a
 *    PNG (jsPDF has no native SVG renderer) so the shapes a person sees on
 *    the website are the same ones that show up in the downloaded PDF.
 *
 * Colors are fixed hex values (not the app's CSS custom properties) since
 * this markup also has to render correctly off-DOM, inside an offscreen
 * <canvas> during PDF export, where CSS variables aren't available.
 */

const S = "#7c3aed";                     // shape stroke (violet, matches the app's brand accent)
const F = "rgba(124, 58, 237, 0.12)";    // shape fill
const M = "#6b6b80";                     // measurement lines / labels

function text(x: number, y: number, s: string, anchor: "start" | "middle" | "end" = "middle"): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="11" font-style="italic" fill="${M}" font-family="ui-monospace, monospace">${s}</text>`;
}
function dim(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${M}" stroke-width="1" stroke-dasharray="3 2" />`;
}

const BODIES: Record<string, string> = {
  "circle-radius": `
    <circle cx="100" cy="70" r="48" fill="${F}" stroke="${S}" stroke-width="2" />
    <circle cx="100" cy="70" r="2.5" fill="${M}" />
    <line x1="100" y1="70" x2="148" y2="70" stroke="${M}" stroke-width="1.5" />
    ${text(124, 64, "r")}
    ${text(96, 84, "center", "end")}`,
  "circle-diameter": `
    <circle cx="100" cy="70" r="48" fill="${F}" stroke="${S}" stroke-width="2" />
    <circle cx="100" cy="70" r="2.5" fill="${M}" />
    <line x1="52" y1="70" x2="148" y2="70" stroke="${M}" stroke-width="1.5" />
    ${text(100, 64, "d = 2r")}`,
  chord: `
    <circle cx="100" cy="70" r="48" fill="${F}" stroke="${S}" stroke-width="2" />
    <line x1="64" y1="38" x2="140" y2="88" stroke="${M}" stroke-width="1.8" />
    <circle cx="64" cy="38" r="2.5" fill="${M}" />
    <circle cx="140" cy="88" r="2.5" fill="${M}" />
    ${text(96, 58, "chord")}`,
  arc: `
    <circle cx="100" cy="70" r="48" fill="${F}" stroke="${S}" stroke-width="2" stroke-opacity="0.3" />
    <path d="M 148 70 A 48 48 0 0 0 100 22" fill="none" stroke="${S}" stroke-width="3.5" />
    <circle cx="148" cy="70" r="2.5" fill="${M}" />
    <circle cx="100" cy="22" r="2.5" fill="${M}" />
    ${text(150, 34, "arc", "start")}`,
  sector: `
    <circle cx="100" cy="70" r="48" fill="none" stroke="${S}" stroke-width="1.5" stroke-opacity="0.35" />
    <path d="M 100 70 L 148 70 A 48 48 0 0 0 100 22 Z" fill="${F}" stroke="${S}" stroke-width="2" />
    <path d="M 118 70 A 18 18 0 0 0 100 52" fill="none" stroke="${M}" stroke-width="1" />
    ${text(126, 62, "\u03b8")}
    ${text(128, 86, "r")}
    ${text(152, 30, "sector", "start")}`,
  ring: `
    <circle cx="100" cy="70" r="48" fill="${F}" stroke="${S}" stroke-width="2" />
    <circle cx="100" cy="70" r="26" fill="#ffffff" stroke="${S}" stroke-width="2" />
    <line x1="100" y1="70" x2="126" y2="70" stroke="${M}" stroke-width="1.5" />
    <line x1="100" y1="70" x2="100" y2="22" stroke="${M}" stroke-width="1.5" />
    ${text(113, 64, "r")}
    ${text(92, 44, "R", "end")}`,
  rectangle: `
    <rect x="40" y="30" width="120" height="70" rx="2" fill="${F}" stroke="${S}" stroke-width="2" />
    ${dim(40, 112, 160, 112)}
    ${dim(26, 30, 26, 100)}
    ${text(100, 126, "length (l)")}
    ${text(20, 68, "w", "end")}`,
  triangle: `
    <polygon points="40,105 160,105 110,25" fill="${F}" stroke="${S}" stroke-width="2" />
    <line x1="110" y1="25" x2="110" y2="105" stroke="${M}" stroke-width="1" stroke-dasharray="3 2" />
    <path d="M 110 97 L 118 97 L 118 105" fill="none" stroke="${M}" stroke-width="1" />
    ${text(116, 70, "h", "start")}
    ${text(75, 120, "base (b)")}
    ${text(62, 62, "c", "end")}
    ${text(142, 62, "a", "start")}`,
  "right-triangle": `
    <polygon points="45,105 155,105 45,30" fill="${F}" stroke="${S}" stroke-width="2" />
    <path d="M 45 93 L 57 93 L 57 105" fill="none" stroke="${M}" stroke-width="1.2" />
    ${text(100, 122, "b (base)")}
    ${text(38, 70, "a", "end")}
    ${text(108, 60, "c (hyp)", "start")}`,
  polygon: `
    <polygon points="45,95 70,35 125,25 165,70 130,108" fill="${F}" stroke="${S}" stroke-width="2" />
    ${text(100, 126, "5 straight sides, closed")}`,
  "regular-polygon": `
    <polygon points="100,22 145,50 128,102 72,102 55,50" fill="${F}" stroke="${S}" stroke-width="2" />
    <circle cx="100" cy="66" r="2.5" fill="${M}" />
    <line x1="100" y1="66" x2="100" y2="102" stroke="${M}" stroke-width="1.2" stroke-dasharray="3 2" />
    <line x1="100" y1="66" x2="145" y2="50" stroke="${M}" stroke-width="1.2" stroke-dasharray="3 2" />
    ${text(94, 90, "a", "end")}
    ${text(130, 62, "R", "start")}
    ${text(100, 126, "all sides & angles equal")}`,
  parallelogram: `
    <polygon points="35,100 105,100 165,35 95,35" fill="${F}" stroke="${S}" stroke-width="2" />
    <line x1="105" y1="35" x2="105" y2="100" stroke="${M}" stroke-width="1" stroke-dasharray="3 2" />
    <path d="M 105 92 L 113 92 L 113 100" fill="none" stroke="${M}" stroke-width="1" />
    ${text(112, 70, "h", "start")}
    ${text(70, 118, "base (b)")}`,
  trapezoid: `
    <polygon points="35,100 165,100 130,32 70,32" fill="${F}" stroke="${S}" stroke-width="2" />
    <line x1="70" y1="32" x2="70" y2="100" stroke="${M}" stroke-width="1" stroke-dasharray="3 2" />
    <path d="M 70 92 L 78 92 L 78 100" fill="none" stroke="${M}" stroke-width="1" />
    ${text(100, 26, "a")}
    ${text(100, 118, "b")}
    ${text(78, 70, "h", "start")}`,
  rhombus: `
    <polygon points="100,20 165,66 100,112 35,66" fill="${F}" stroke="${S}" stroke-width="2" />
    <line x1="35" y1="66" x2="165" y2="66" stroke="${M}" stroke-width="1.2" stroke-dasharray="3 2" />
    <line x1="100" y1="20" x2="100" y2="112" stroke="${M}" stroke-width="1.2" stroke-dasharray="3 2" />
    ${text(140, 60, "d\u2081")}
    ${text(92, 38, "d\u2082", "end")}
    ${text(100, 128, "all 4 sides equal")}`,
  ellipse: `
    <ellipse cx="100" cy="66" rx="62" ry="38" fill="${F}" stroke="${S}" stroke-width="2" />
    <line x1="100" y1="66" x2="162" y2="66" stroke="${M}" stroke-width="1.5" />
    <line x1="100" y1="66" x2="100" y2="28" stroke="${M}" stroke-width="1.5" />
    <circle cx="100" cy="66" r="2.5" fill="${M}" />
    ${text(134, 60, "a")}
    ${text(94, 46, "b", "end")}`,
  congruent: `
    <polygon points="25,100 85,100 55,35" fill="${F}" stroke="${S}" stroke-width="2" />
    <polygon points="115,100 175,100 145,35" fill="${F}" stroke="${S}" stroke-width="2" />
    ${text(55, 122, "same size")}
    ${text(145, 122, "same shape")}
    <text x="100" y="78" text-anchor="middle" font-size="16" fill="${M}">\u2245</text>`,
  similar: `
    <polygon points="20,100 80,100 50,40" fill="${F}" stroke="${S}" stroke-width="2" />
    <polygon points="125,100 165,100 145,60" fill="${F}" stroke="${S}" stroke-width="2" />
    <text x="102" y="86" text-anchor="middle" font-size="16" fill="${M}">~</text>
    ${text(100, 122, "same angles, scaled sides")}`,
  angle: `
    <line x1="40" y1="100" x2="170" y2="100" stroke="${S}" stroke-width="2" />
    <line x1="40" y1="100" x2="145" y2="30" stroke="${S}" stroke-width="2" />
    <path d="M 80 100 A 40 40 0 0 0 66 76" fill="none" stroke="${M}" stroke-width="1.3" />
    ${text(88, 88, "\u03b8")}
    ${text(40, 118, "vertex")}`,
  cube: `
    <polygon points="50,55 120,55 120,115 50,115" fill="${F}" stroke="${S}" stroke-width="2" />
    <polygon points="50,55 78,28 148,28 120,55" fill="${F}" stroke="${S}" stroke-width="2" />
    <polygon points="120,55 148,28 148,88 120,115" fill="${F}" stroke="${S}" stroke-width="2" />
    ${text(85, 132, "s")}
    ${text(160, 70, "s", "start")}
    ${text(110, 22, "s")}`,
  cuboid: `
    <polygon points="40,60 125,60 125,112 40,112" fill="${F}" stroke="${S}" stroke-width="2" />
    <polygon points="40,60 68,34 153,34 125,60" fill="${F}" stroke="${S}" stroke-width="2" />
    <polygon points="125,60 153,34 153,86 125,112" fill="${F}" stroke="${S}" stroke-width="2" />
    ${text(82, 128, "l")}
    ${text(165, 76, "h", "start")}
    ${text(140, 28, "w")}`,
  cylinder: `
    <ellipse cx="100" cy="36" rx="45" ry="14" fill="${F}" stroke="${S}" stroke-width="2" />
    <path d="M 55 36 L 55 100 A 45 14 0 0 0 145 100 L 145 36" fill="${F}" stroke="${S}" stroke-width="2" />
    <line x1="100" y1="36" x2="145" y2="36" stroke="${M}" stroke-width="1.3" />
    <line x1="158" y1="36" x2="158" y2="100" stroke="${M}" stroke-width="1" stroke-dasharray="3 2" />
    ${text(122, 30, "r")}
    ${text(165, 72, "h", "start")}`,
  cone: `
    <path d="M 100 20 L 148 100 A 48 14 0 0 1 52 100 Z" fill="${F}" stroke="${S}" stroke-width="2" />
    <ellipse cx="100" cy="100" rx="48" ry="14" fill="none" stroke="${S}" stroke-width="1.5" stroke-dasharray="4 3" />
    <line x1="100" y1="20" x2="100" y2="100" stroke="${M}" stroke-width="1" stroke-dasharray="3 2" />
    <line x1="100" y1="100" x2="148" y2="100" stroke="${M}" stroke-width="1.3" />
    ${text(94, 64, "h", "end")}
    ${text(126, 114, "r")}
    ${text(134, 56, "l (slant)", "start")}`,
  sphere: `
    <circle cx="100" cy="66" r="46" fill="${F}" stroke="${S}" stroke-width="2" />
    <ellipse cx="100" cy="66" rx="46" ry="15" fill="none" stroke="${S}" stroke-width="1.2" stroke-dasharray="4 3" />
    <line x1="100" y1="66" x2="146" y2="66" stroke="${M}" stroke-width="1.5" />
    <circle cx="100" cy="66" r="2.5" fill="${M}" />
    ${text(124, 60, "r")}`,
};

export const SHAPE_DIAGRAM_NAMES = Object.keys(BODIES);

/** The inner markup only (no wrapping <svg>) — what ShapeDiagram.tsx injects
 *  via dangerouslySetInnerHTML into its own themed, responsive <svg> tag. */
export function getShapeDiagramInnerSvg(name: string): string | null {
  return BODIES[name] ?? null;
}

/** A complete, standalone `<svg>...</svg>` document for this diagram — used
 *  by the PDF exporter, which rasterizes it via an offscreen canvas since
 *  jsPDF cannot render SVG directly. */
export function getShapeDiagramStandaloneSvg(name: string): string | null {
  const body = BODIES[name];
  if (!body) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140" width="200" height="140">${body}</svg>`;
}
