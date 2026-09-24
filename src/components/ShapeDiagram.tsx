/**
 * Small labeled diagrams for the Geometry definitions page — the same idea
 * as the labeled axes on the 3D plots: a picture of the shape with its parts
 * (radius, chord, apothem, slant height…) marked, so a term like "sector" is
 * understood at a glance instead of only from prose.
 *
 * The actual markup lives in shape-diagram-svg.ts, shared with the PDF
 * export so the shapes a person sees here are the same ones that end up in
 * the downloaded PDF.
 */
import { getShapeDiagramInnerSvg } from "@/lib/shape-diagram-svg";

export function ShapeDiagram({ name }: { name: string }) {
  const inner = getShapeDiagramInnerSvg(name);
  if (!inner) return null;
  return (
    <div className="mt-2 flex justify-center rounded-lg bg-muted/30 border border-border/40 py-2">
      <svg
        viewBox="0 0 200 140"
        className="w-full max-w-[220px] h-auto"
        role="img"
        aria-label={`${name} diagram`}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    </div>
  );
}
