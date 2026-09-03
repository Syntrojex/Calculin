import type { RefObject } from "react";

/**
 * Downloads a <canvas> element (found inside `container`, or passed directly)
 * as a PNG file. Flattens onto the app's actual theme background color first —
 * canvases here often render with a transparent background (alpha:true) so
 * they composite nicely inside a card, but exporting that as-is leaves the
 * PNG's background transparent, which most image viewers just show as plain
 * white. This way the download looks like what's actually on screen.
 */
export async function downloadCanvasPNG(
  source: HTMLCanvasElement | RefObject<HTMLDivElement | null> | RefObject<HTMLCanvasElement | null>,
  filename: string
): Promise<void> {
  let sourceCanvas: HTMLCanvasElement | null = null;

  if (source instanceof HTMLCanvasElement) {
    sourceCanvas = source;
  } else if (source && "current" in source && source.current) {
    sourceCanvas =
      source.current instanceof HTMLCanvasElement
        ? source.current
        : (source.current.querySelector("canvas") as HTMLCanvasElement | null);
  }
  if (!sourceCanvas) return;

  const flattened = document.createElement("canvas");
  flattened.width = sourceCanvas.width;
  flattened.height = sourceCanvas.height;
  const ctx = flattened.getContext("2d");
  if (!ctx) return;

  const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  ctx.fillStyle = bg || (document.documentElement.classList.contains("dark") ? "#0a0a0f" : "#ffffff");
  ctx.fillRect(0, 0, flattened.width, flattened.height);
  ctx.drawImage(sourceCanvas, 0, 0);

  const blob: Blob | null = await new Promise((resolve) => flattened.toBlob(resolve, "image/png"));
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${filename}.png`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

/** Sanitizes an arbitrary math expression into a safe-ish filename fragment. */
export function slugifyForFilename(expr: string, maxLen = 24): string {
  const cleaned = expr.replace(/[^a-zA-Z0-9+\-*/^().]/g, "").slice(0, maxLen);
  return cleaned || "graph";
}
