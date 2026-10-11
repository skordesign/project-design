"use client";

import { createContext, useContext, useMemo, useRef, type RefObject } from "react";

import type { ExportBackground } from "@/components/designer/export-image";
import type { NodeKind } from "@/lib/design/schema";

/** What the palette, inspector and validation panel can ask the canvas to do. */
export interface CanvasActions {
  /** Add a node of `kind` at the centre of the visible canvas (inside the selected container if needed). */
  addNodeAtCenter(kind: NodeKind): void;
  /** Add a node whose centre is at a flow-space point, e.g. after a palette drop. */
  addNodeAt(kind: NodeKind, center: { x: number; y: number }): void;
  /** Scroll the canvas so the node or edge is centred. */
  focus(target: { nodeId?: string; edgeId?: string }): void;
  /** Delete the selection, asking first when containers with children are included. */
  deleteSelection(): void;
  fitView(): void;
  /** Arrange what the current view shows with ELK layered flow, then frame it. */
  tidyLayout(options?: { direction?: "RIGHT" | "DOWN" }): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  exportImage(format: "png" | "svg"): Promise<void>;
  /** Renders the canvas to a data URL for in-dialog preview (null when unavailable). */
  renderPreviewImage(format: "png" | "svg", background: ExportBackground): Promise<string | null>;
}

const noop: CanvasActions = {
  addNodeAtCenter() {},
  addNodeAt() {},
  focus() {},
  deleteSelection() {},
  fitView() {},
  tidyLayout(_opts) {},
  zoomIn() {},
  zoomOut() {},
  resetZoom() {},
  async exportImage() {},
  async renderPreviewImage() {
    return null;
  },
};

const Ctx = createContext<RefObject<CanvasActions> | null>(null);

export function CanvasActionsProvider({
  actionsRef,
  children,
}: {
  actionsRef: RefObject<CanvasActions>;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={actionsRef}>{children}</Ctx.Provider>;
}

export function useActionsRef(): RefObject<CanvasActions> {
  const fallback = useRef<CanvasActions>(noop);
  return useContext(Ctx) ?? fallback;
}

/** Stable object delegating to whatever the canvas registered. */
export function useCanvasActions(): CanvasActions {
  const ref = useActionsRef();
  return useMemo(
    () => ({
      addNodeAtCenter: (k) => ref.current.addNodeAtCenter(k),
      addNodeAt: (k, c) => ref.current.addNodeAt(k, c),
      focus: (t) => ref.current.focus(t),
      deleteSelection: () => ref.current.deleteSelection(),
      fitView: () => ref.current.fitView(),
      tidyLayout: (opts) => ref.current.tidyLayout(opts),
      zoomIn: () => ref.current.zoomIn(),
      zoomOut: () => ref.current.zoomOut(),
      resetZoom: () => ref.current.resetZoom(),
      exportImage: (f) => ref.current.exportImage(f),
      renderPreviewImage: (f, b) => ref.current.renderPreviewImage(f, b),
    }),
    [ref],
  );
}
