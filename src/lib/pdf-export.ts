import type { FormulaTopic } from "./formula-sheet-data";
import { latexToPlainText, sanitizeAsciiForPdf } from "./latex-to-text";

// A deliberately fixed palette (not the app's live oklch-based theme
// variables) so the PDF always looks the same regardless of which
// dark/light/accent theme is active on screen — colors as [R, G, B] 0-255
// triples, since jsPDF's setFillColor/setTextColor take plain RGB.
const COLORS = {
  headerFrom: [79, 70, 229] as [number, number, number], // indigo-600
  headerTo: [124, 58, 237] as [number, number, number], // violet-600
  headerText: [255, 255, 255] as [number, number, number],
  headerSubtext: [224, 217, 251] as [number, number, number],
  text: [30, 27, 46] as [number, number, number],
  muted: [107, 101, 128] as [number, number, number],
  cardBg: [248, 247, 252] as [number, number, number],
  cardBorder: [230, 226, 242] as [number, number, number],
  accentBar: [124, 58, 237] as [number, number, number],
  footerText: [163, 156, 192] as [number, number, number],
};

function formatGeneratedDate(): string {
  return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * A formula containing \begin{bmatrix}...\end{bmatrix} used to be flattened
 * by latexToPlainText into a single run like "[a b ; c d]" and then
 * word-wrapped like ordinary prose — on a narrow PDF viewer (a phone) that
 * wrap could land mid-row, and even unwrapped it never looked like an
 * actual grid. This splits a formula's LaTeX into alternating plain-text
 * and matrix segments instead, so each matrix can be drawn as a real
 * bracketed grid (see drawMatrixGrid) rather than flattened text.
 */
type FormulaSegment = { type: "text"; content: string } | { type: "matrix"; rows: string[][] };

function splitFormulaSegments(latex: string): FormulaSegment[] {
  const segments: FormulaSegment[] = [];
  const re = /\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latex)) !== null) {
    if (m.index > lastIndex) segments.push({ type: "text", content: latex.slice(lastIndex, m.index) });
    const rows = m[1].split("\\\\").map((r) => r.trim().split("&").map((c) => c.trim()));
    segments.push({ type: "matrix", rows });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < latex.length) segments.push({ type: "text", content: latex.slice(lastIndex) });
  return segments;
}

/** Pixel footprint a matrix grid will take at the given font size — needed
 *  up front to lay out whatever text comes before/after it on the same
 *  line. */
function measureMatrixGrid(pdf: import("jspdf").jsPDF, rows: string[][], fontSize: number): { width: number; height: number; cellW: number; cellH: number } {
  pdf.setFont("courier", "normal");
  pdf.setFontSize(fontSize);
  let maxCellW = 0;
  for (const row of rows) for (const cell of row) {
    maxCellW = Math.max(maxCellW, pdf.getTextWidth(cell));
  }
  const cellW = maxCellW + 12;
  const cellH = fontSize + 7;
  const cols = rows[0]?.length ?? 0;
  const bracketW = 7;
  return { width: cols * cellW + bracketW * 2, height: rows.length * cellH, cellW, cellH };
}

/** Draws an actual bracketed grid — real rows and columns, not flattened
 *  text — so a matrix still reads as a matrix at any width or in a mobile
 *  PDF viewer's reflow mode. Returns the space it occupied. */
function drawMatrixGrid(
  pdf: import("jspdf").jsPDF,
  rows: string[][],
  x: number,
  yTop: number,
  fontSize: number,
  color: [number, number, number]
): { width: number; height: number } {
  const { cellW, cellH, width, height } = measureMatrixGrid(pdf, rows, fontSize);
  const bracketW = 7;
  const tick = bracketW * 0.6;

  pdf.setDrawColor(...color);
  pdf.setLineWidth(1);
  // Left bracket: one vertical stroke plus short top/bottom ticks.
  pdf.line(x, yTop, x, yTop + height);
  pdf.line(x, yTop, x + tick, yTop);
  pdf.line(x, yTop + height, x + tick, yTop + height);
  // Right bracket, mirrored.
  const xr = x + width;
  pdf.line(xr, yTop, xr, yTop + height);
  pdf.line(xr - tick, yTop, xr, yTop);
  pdf.line(xr - tick, yTop + height, xr, yTop + height);

  pdf.setFont("courier", "normal");
  pdf.setFontSize(fontSize);
  pdf.setTextColor(...color);
  rows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const cx = x + bracketW + ci * cellW + cellW / 2;
      const cy = yTop + ri * cellH + cellH / 2 + fontSize * 0.32;
      pdf.text(sanitizeAsciiForPdf(cell), cx, cy, { align: "center" });
    });
  });

  return { width, height };
}

/** Read-only counterpart to drawFormulaSegments — computes the total width
 *  and height the segments will occupy, without drawing anything, so the
 *  caller can size the card BEFORE any drawing happens. */
function measureFormulaSegments(
  pdf: import("jspdf").jsPDF,
  segments: FormulaSegment[],
  fontSize: number
): { width: number; height: number } {
  let width = 0;
  let maxHeight = fontSize + 7;
  for (const seg of segments) {
    if (seg.type === "matrix") {
      const m = measureMatrixGrid(pdf, seg.rows, fontSize);
      width += m.width + 6;
      maxHeight = Math.max(maxHeight, m.height);
    } else {
      const plain = latexToPlainText(seg.content).trim();
      if (!plain) continue;
      pdf.setFont("courier", "normal");
      pdf.setFontSize(fontSize);
      width += pdf.getTextWidth(plain) + 6;
    }
  }
  return { width, height: maxHeight };
}

/**
 * Draws one formula's segments left to right on a single baseline, mixing
 * plain text runs with matrix grids — e.g. "[a b; c d]^-1 = 1/(ad-bc) x
 * [d -b; -c a]" becomes: text, matrix, text, matrix, all aligned on one
 * row. Returns the total width and height used, so the caller can size the
 * card around it.
 */
function drawFormulaSegments(
  pdf: import("jspdf").jsPDF,
  segments: FormulaSegment[],
  x: number,
  yTop: number,
  fontSize: number,
  color: [number, number, number]
): { width: number; height: number } {
  let cursorX = x;
  let maxHeight = fontSize + 7;
  const textBaselineOffset = fontSize * 0.75;

  // First pass: measure total height (the tallest matrix present) so every
  // text run's baseline can be vertically centered against it.
  for (const seg of segments) {
    if (seg.type === "matrix") {
      const { height } = measureMatrixGrid(pdf, seg.rows, fontSize);
      maxHeight = Math.max(maxHeight, height);
    }
  }

  for (const seg of segments) {
    if (seg.type === "matrix") {
      const measured = measureMatrixGrid(pdf, seg.rows, fontSize);
      const { width } = drawMatrixGrid(pdf, seg.rows, cursorX, yTop + (maxHeight - measured.height) / 2, fontSize, color);
      cursorX += width + 6;
    } else {
      const plain = latexToPlainText(seg.content).trim();
      if (!plain) continue;
      pdf.setFont("courier", "normal");
      pdf.setFontSize(fontSize);
      pdf.setTextColor(...color);
      pdf.text(plain, cursorX, yTop + maxHeight / 2 + textBaselineOffset / 2 - 1);
      cursorX += pdf.getTextWidth(plain) + 6;
    }
  }

  return { width: cursorX - x, height: maxHeight };
}

/**
 * Draws a formula topic straight to jsPDF using its native text/shape API —
 * no DOM screenshot at all. The previous html2canvas-based approach tried
 * to rasterize dozens of fully-rendered KaTeX formulas (each one hundreds
 * of nested DOM nodes) in a single pass, which could hang the tab for a
 * long time (or indefinitely) on slower devices. This is slower to author
 * but fast and reliable to run: pure vector/text drawing, nothing to wait
 * on, nothing that can freeze the page.
 */
export async function exportFormulaSheetPDF(topic: FormulaTopic): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF("p", "pt", "a4");

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const gutter = 16;
  const colWidth = (pageWidth - margin * 2 - gutter) / 2;
  const footerHeight = 34;
  const contentBottom = pageHeight - footerHeight - 16;

  let page = 1;

  const drawFooter = () => {
    pdf.setDrawColor(...COLORS.cardBorder);
    pdf.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.footerText);
    pdf.text("Generated by Calculin - calculin.vercel.app", margin, pageHeight - footerHeight + 16);
    pdf.text(`${formatGeneratedDate()} - Page ${page}`, pageWidth - margin, pageHeight - footerHeight + 16, { align: "right" });
  };

  const drawHeaderBand = (compact: boolean): number => {
    const bandHeight = compact ? 56 : 128;
    // Fake a gradient with a handful of horizontal color-interpolated
    // strips — jsPDF has no native linear-gradient fill.
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.round(COLORS.headerFrom[0] + (COLORS.headerTo[0] - COLORS.headerFrom[0]) * t);
      const g = Math.round(COLORS.headerFrom[1] + (COLORS.headerTo[1] - COLORS.headerFrom[1]) * t);
      const b = Math.round(COLORS.headerFrom[2] + (COLORS.headerTo[2] - COLORS.headerFrom[2]) * t);
      pdf.setFillColor(r, g, b);
      const stripW = pageWidth / steps;
      pdf.rect(i * stripW, 0, stripW + 1, bandHeight, "F");
    }

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, compact ? 14 : 28, 26, 26, 6, 6, "F");
    pdf.setTextColor(...COLORS.headerFrom);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("C", margin + 13, compact ? 32 : 46, { align: "center" });

    pdf.setTextColor(...COLORS.headerText);
    pdf.setFontSize(13);
    pdf.text("Calculin", margin + 34, compact ? 31 : 45);

    if (!compact) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(24);
      pdf.text(sanitizeAsciiForPdf(topic.title), margin, 82);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(...COLORS.headerSubtext);
      const descLines = pdf.splitTextToSize(sanitizeAsciiForPdf(topic.description), pageWidth - margin * 2);
      pdf.text(descLines, margin, 104);
    } else {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text(sanitizeAsciiForPdf(topic.title), pageWidth - margin, 34, { align: "right" });
    }

    return bandHeight;
  };

  const startNewPage = () => {
    pdf.addPage();
    page++;
    const bandHeight = drawHeaderBand(true);
    drawFooter();
    return bandHeight + 20;
  };

  let y = drawHeaderBand(false) + 30;
  drawFooter();

  let leftColHeight = 0;
  let nextCol: 0 | 1 = 0;
  let pendingLeftOnly = false;

  topic.formulas.forEach((f, i) => {
    const hasMatrix = f.latex.includes("\\begin{bmatrix}");

    if (hasMatrix) {
      // A matrix formula always gets its own full-width row (a grid needs
      // room to breathe, and squeezing it into a half-width column is
      // exactly what used to force it to wrap mid-row). Close out any
      // dangling lone left-column card first, so the page still reads as
      // clean rows.
      if (pendingLeftOnly) {
        y += leftColHeight + 12;
        pendingLeftOnly = false;
      }

      const segments = splitFormulaSegments(f.latex);
      const fontSize = 11;
      const measured = measureFormulaSegments(pdf, segments, fontSize);
      const fullWidth = colWidth * 2 + gutter;

      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(8);
      const noteLines: string[] = f.note ? pdf.splitTextToSize(latexToPlainText(f.note), fullWidth - 24) : [];

      const nameHeight = 16;
      const noteHeight = noteLines.length ? noteLines.length * 10 + 6 : 0;
      const cardHeight = nameHeight + measured.height + noteHeight + 22;

      if (y + cardHeight > contentBottom) {
        y = startNewPage();
      }

      pdf.setFillColor(...COLORS.cardBg);
      pdf.setDrawColor(...COLORS.cardBorder);
      pdf.roundedRect(margin, y, fullWidth, cardHeight, 4, 4, "FD");
      pdf.setFillColor(...COLORS.accentBar);
      pdf.rect(margin, y, 3, cardHeight, "F");

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...COLORS.text);
      pdf.text(sanitizeAsciiForPdf(f.name), margin + 14, y + 15);

      drawFormulaSegments(pdf, segments, margin + 14, y + 15 + 10, fontSize, COLORS.text);

      if (noteLines.length) {
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(8);
        pdf.setTextColor(...COLORS.muted);
        pdf.text(noteLines, margin + 14, y + 15 + measured.height + 20);
      }

      y += cardHeight + 12;
      nextCol = 0; // whatever comes next starts a fresh row, not a stray right column
      return;
    }

    const col = nextCol;
    nextCol = col === 0 ? 1 : 0;
    const x = margin + col * (colWidth + gutter);

    const plain = latexToPlainText(f.latex);
    pdf.setFont("courier", "normal");
    pdf.setFontSize(10.5);
    const formulaLines: string[] = pdf.splitTextToSize(plain, colWidth - 24);

    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8);
    const noteLines: string[] = f.note ? pdf.splitTextToSize(latexToPlainText(f.note), colWidth - 24) : [];

    const nameHeight = 16;
    const formulaHeight = formulaLines.length * 13;
    const noteHeight = noteLines.length ? noteLines.length * 10 + 6 : 0;
    const cardHeight = nameHeight + formulaHeight + noteHeight + 18;

    // Only ever break pages at the start of a left column, so a page
    // always ends on a clean row boundary rather than mid-row.
    if (col === 0 && y + cardHeight > contentBottom) {
      y = startNewPage();
    }

    pdf.setFillColor(...COLORS.cardBg);
    pdf.setDrawColor(...COLORS.cardBorder);
    pdf.roundedRect(x, y, colWidth, cardHeight, 4, 4, "FD");
    pdf.setFillColor(...COLORS.accentBar);
    pdf.rect(x, y, 3, cardHeight, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...COLORS.text);
    pdf.text(sanitizeAsciiForPdf(f.name), x + 12, y + 15);

    pdf.setFont("courier", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(...COLORS.text);
    pdf.text(formulaLines, x + 12, y + 15 + 15);

    if (noteLines.length) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(8);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(noteLines, x + 12, y + 15 + formulaHeight + 16);
    }

    if (col === 0) {
      leftColHeight = cardHeight;
      pendingLeftOnly = true;
    }
    // Advance y once per row (after the right column, or after a lone
    // last left-column card), using the taller of the pair so rows never
    // overlap.
    const isLastFormula = i === topic.formulas.length - 1;
    if (col === 1 || isLastFormula) {
      const rowHeight = col === 1 ? Math.max(leftColHeight, cardHeight) : cardHeight;
      y += rowHeight + 12;
      pendingLeftOnly = false;
    }
  });

  pdf.save(`Calculin-${topic.key}-formula-sheet.pdf`);
}
