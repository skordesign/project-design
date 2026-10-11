/**
 * High-resolution vector & raster image export for XYFlow architecture canvas.
 * Client-side component utility.
 */
import { getViewportForBounds, type Node } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";

export type ExportBackground = "light" | "dark" | "transparent";

export const EXPORT_BACKGROUNDS: Record<ExportBackground, { label: string; swatch: string }> = {
  light: { label: "White", swatch: "#ffffff" },
  dark: { label: "Dark", swatch: "#09090b" },
  transparent: { label: "Transparent", swatch: "transparent" },
};

export interface DiagramBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderCanvasOptions {
  viewportElement: HTMLElement;
  nodes: Node[];
  bounds?: DiagramBounds;
  format?: "png" | "svg";
  background?: ExportBackground;
  /** Resolution scale: 2 for razor-sharp final exports, 1 for fast previews. */
  pixelRatio?: number;
}

/**
 * Calculates tight bounding box around visible nodes, accounting for measured DOM dimensions
 * or catalog default sizes if unmeasured.
 */
export function resolveDiagramBounds(nodes: Node[], explicitBounds?: DiagramBounds): DiagramBounds {
  if (explicitBounds && explicitBounds.width > 0 && explicitBounds.height > 0) {
    return explicitBounds;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    // In React Flow, internals.positionAbsolute is the true origin on the canvas
    const x =
      (n as { internals?: { positionAbsolute?: { x: number } } }).internals?.positionAbsolute?.x ??
      n.position.x;
    const y =
      (n as { internals?: { positionAbsolute?: { y: number } } }).internals?.positionAbsolute?.y ??
      n.position.y;
    const w = n.measured?.width ?? n.width ?? n.initialWidth ?? 240;
    const h = n.measured?.height ?? n.height ?? n.initialHeight ?? 90;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  if (minX === Infinity || maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Renders the canvas to a data URL (for download or in-dialog preview).
 * Transparent omits the background so PNGs keep their alpha channel.
 * Auto-zooms to tightly frame the diagram content with balanced padding.
 */
export async function renderCanvasDataUrl({
  viewportElement,
  nodes,
  bounds: explicitBounds,
  format = "png",
  background = "dark",
  pixelRatio = 2,
}: RenderCanvasOptions): Promise<string> {
  if (nodes.length === 0) {
    throw new Error("Cannot export an empty canvas.");
  }

  const bounds = resolveDiagramBounds(nodes, explicitBounds);
  const paddingPx = 48;
  const contentWidth = Math.ceil(bounds.width + paddingPx * 2);
  const contentHeight = Math.ceil(bounds.height + paddingPx * 2);

  // Maintain actual diagram aspect ratio while guaranteeing high resolution (at least 1200px max dimension)
  const maxDim = Math.max(contentWidth, contentHeight);
  const minTargetDim = 1200;
  const scaleFactor = maxDim < minTargetDim ? minTargetDim / maxDim : 1;

  const imageWidth = Math.round(contentWidth * scaleFactor);
  const imageHeight = Math.round(contentHeight * scaleFactor);
  const scaledPadding = `${Math.round(paddingPx * scaleFactor)}px` as `${number}px`;

  // Auto-zoom to fit the bounds snugly inside the export frame
  const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.1, 4, scaledPadding);

  const backgroundColor =
    background === "transparent" ? undefined : EXPORT_BACKGROUNDS[background].swatch;

  const options = {
    ...(backgroundColor ? { backgroundColor } : {}),
    width: imageWidth,
    height: imageHeight,
    pixelRatio, // 2x Retina for final exports, 1x for fast in-dialog previews
    style: {
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
    filter: (node: HTMLElement) => {
      // Exclude minimap, panels and interactive helper controls from export
      const cl = node.classList;
      if (!cl) return true;
      if (cl.contains("react-flow__minimap")) return false;
      if (cl.contains("react-flow__panel")) return false;
      return true;
    },
  };

  let finalDataUrl =
    format === "svg"
      ? await toSvg(viewportElement, options)
      : await toPng(viewportElement, options);

  // Security sanitization for vector SVG exports (defense-in-depth against Stored XSS)
  if (format === "svg" && finalDataUrl.startsWith("data:image/svg+xml")) {
    const rawSvg = decodeURIComponent(
      finalDataUrl.replace(/^data:image\/svg\+xml(?:;charset=[^,]+)?,/, ""),
    );
    const sanitizedSvg = rawSvg
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/\s+on\w+\s*=\s*(["']).*?\1/gi, "")
      .replace(/javascript:/gi, "");
    finalDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizedSvg)}`;
  }

  return finalDataUrl;
}

export interface ExportImageOptions extends RenderCanvasOptions {
  fileName?: string;
}

export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9_\-.]/g, "_");
  const link = document.createElement("a");
  link.download = safeFileName;
  link.href = dataUrl;
  document.body.append(link);
  link.click();
  link.remove();
}

export async function exportCanvasImage({
  fileName = "architecture",
  format = "png",
  ...renderOptions
}: ExportImageOptions): Promise<void> {
  const dataUrl = await renderCanvasDataUrl({ format, ...renderOptions });
  downloadDataUrl(dataUrl, `${fileName}.${format}`);
}
