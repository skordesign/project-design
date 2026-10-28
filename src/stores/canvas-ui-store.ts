import { create } from "zustand";

import type { ExportBackground } from "@/components/designer/export-image";
import type { Perspective } from "@/lib/design/perspectives";
import type { NodeKind } from "@/lib/design/schema";

export type ViewMode = "all" | "levels";
export type LeftSidebarTab = "palette" | "explorer";
export type PaletteLayout = "grid" | "list";
export type CanvasLod = "compact" | "medium" | "detailed";

export function computeLod(zoom: number): CanvasLod {
  if (zoom < 0.6) return "compact";
  if (zoom > 1.1) return "detailed";
  return "medium";
}

interface CanvasUiState {
  /** Who the canvas is drawn for (see lib/design/perspectives.ts); independent of viewMode. */
  perspective: Perspective;
  /** "all": every node, nested. "levels": one level at a time (see lib/design/levels.ts). */
  viewMode: ViewMode;
  /** The container or module the levels view is drilled into; null = project level. */
  focusId: string | null;
  /** Levels view only: show the focus by itself, hiding everything outside it. */
  standalone: boolean;
  validationOpen: boolean;
  minimapOpen: boolean;
  /** The "changed elsewhere" dialog (opened by autosave or the header). */
  conflictOpen: boolean;
  /** Left sidebar visibility and active tab (Palette vs Project Explorer). */
  leftSidebarOpen: boolean;
  leftSidebarTab: LeftSidebarTab;
  /** Palette layout mode: "grid" (compact 2-column) or "list" (compact 1-column). */
  paletteLayout: PaletteLayout;
  /** Right sidebar (Inspector) visibility. */
  rightSidebarOpen: boolean;
  /** Explorer search and filtering. */
  searchQuery: string;
  activeFilterKind: NodeKind | "all";
  /** Focus mode: when a node is selected, dim unrelated nodes and edges. */
  focusMode: boolean;
  /** In architecture view, collapse datastores to summary cards hiding entity clutter. */
  collapseDatastores: boolean;
  /** Active tag for filtering/highlighting specific feature flows. */
  activeTag: string | null;
  /** Current Level of Detail (LOD) on the canvas driven by zoom. */
  lod: CanvasLod;
  zoom: number;
  /** Interactive flow walkthrough mode. */
  walkthroughActive: boolean;
  walkthroughStep: number;
  walkthroughTag: string | null;

  setPerspective(perspective: Perspective): void;
  setViewMode(mode: ViewMode): void;
  /** Drill into a node (switching to the levels view), or back to the project with null. */
  setFocus(focusId: string | null): void;
  /** Drill into a node with everything outside it hidden (see `standalone`). */
  openStandalone(focusId: string): void;
  toggleStandalone(): void;
  toggleValidation(open?: boolean): void;
  toggleMinimap(): void;
  setConflictOpen(open: boolean): void;
  toggleLeftSidebar(): void;
  setLeftSidebarOpen(open: boolean): void;
  setLeftSidebarTab(tab: LeftSidebarTab): void;
  setPaletteLayout(layout: PaletteLayout): void;
  toggleRightSidebar(): void;
  setRightSidebarOpen(open: boolean): void;
  setSearchQuery(query: string): void;
  setActiveFilterKind(kind: NodeKind | "all"): void;
  toggleFocusMode(): void;
  toggleCollapseDatastores(): void;
  setActiveTag(tag: string | null): void;
  updateZoom(zoom: number): void;
  startWalkthrough(tag?: string | null): void;
  stopWalkthrough(): void;
  setWalkthroughStep(step: number): void;
  nextWalkthroughStep(maxSteps: number): void;
  prevWalkthroughStep(): void;
  /** True while the ELK flow layout is running (Tidy button shows busy). */
  layoutBusy: boolean;
  setLayoutBusy(busy: boolean): void;
  exportImageHandler: ((format: "png" | "svg") => Promise<void>) | null;
  registerExportHandler(handler: ((format: "png" | "svg") => Promise<void>) | null): void;
  /** Renders the live canvas to a data URL for the export dialog preview. */
  renderPreviewHandler:
    ((format: "png" | "svg", background: ExportBackground) => Promise<string | null>) | null;
  registerPreviewHandler(
    handler:
      ((format: "png" | "svg", background: ExportBackground) => Promise<string | null>) | null,
  ): void;
}

export const PALETTE_LAYOUT_KEY = "pd:palette-layout";

function persistPaletteLayout(layout: PaletteLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PALETTE_LAYOUT_KEY, layout);
  } catch {
    // Storage unavailable
  }
}

/** View toggles shared by the project header and the canvas toolbar. */
export const useCanvasUi = create<CanvasUiState>((set) => ({
  perspective: "architecture",
  viewMode: "all",
  focusId: null,
  standalone: false,
  validationOpen: false,
  minimapOpen: true,
  conflictOpen: false,
  leftSidebarOpen: true,
  leftSidebarTab: "palette",
  paletteLayout: "grid",
  rightSidebarOpen: true,
  searchQuery: "",
  activeFilterKind: "all",
  focusMode: true,
  collapseDatastores: true,
  activeTag: null,
  lod: "medium",
  zoom: 1,
  walkthroughActive: false,
  walkthroughStep: 0,
  walkthroughTag: null,

  setPerspective: (perspective) => set({ perspective }),
  setViewMode(viewMode) {
    set({ viewMode, standalone: false });
  },
  setFocus: (focusId) => set({ viewMode: "levels", focusId, standalone: false }),
  openStandalone: (focusId) =>
    set({ perspective: "architecture", viewMode: "levels", focusId, standalone: true }),
  toggleStandalone: () => set((s) => ({ standalone: !s.standalone })),
  toggleValidation: (open) => set((s) => ({ validationOpen: open ?? !s.validationOpen })),
  toggleMinimap: () => set((s) => ({ minimapOpen: !s.minimapOpen })),
  setConflictOpen: (open) => set({ conflictOpen: open }),
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  setLeftSidebarOpen: (leftSidebarOpen) => set({ leftSidebarOpen }),
  setLeftSidebarTab: (leftSidebarTab) => set({ leftSidebarTab, leftSidebarOpen: true }),
  setPaletteLayout: (paletteLayout) => {
    persistPaletteLayout(paletteLayout);
    set({ paletteLayout });
  },
  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
  setRightSidebarOpen: (rightSidebarOpen) => set({ rightSidebarOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveFilterKind: (activeFilterKind) => set({ activeFilterKind }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleCollapseDatastores: () => set((s) => ({ collapseDatastores: !s.collapseDatastores })),
  setActiveTag: (activeTag) => set({ activeTag }),
  updateZoom: (zoom) => {
    const nextLod = computeLod(zoom);
    set((s) => (s.lod !== nextLod || Math.abs(s.zoom - zoom) > 0.05 ? { lod: nextLod, zoom } : s));
  },
  startWalkthrough: (tag) =>
    set({
      walkthroughActive: true,
      walkthroughStep: 0,
      walkthroughTag: tag ?? null,
      focusMode: true,
      rightSidebarOpen: true,
    }),
  stopWalkthrough: () =>
    set({
      walkthroughActive: false,
      walkthroughStep: 0,
      walkthroughTag: null,
    }),
  setWalkthroughStep: (step) => set({ walkthroughStep: step }),
  nextWalkthroughStep: (maxSteps) =>
    set((s) => ({
      walkthroughStep: Math.min(maxSteps - 1, s.walkthroughStep + 1),
    })),
  prevWalkthroughStep: () =>
    set((s) => ({
      walkthroughStep: Math.max(0, s.walkthroughStep - 1),
    })),
  layoutBusy: false,
  setLayoutBusy: (layoutBusy) => set({ layoutBusy }),
  exportImageHandler: null,
  registerExportHandler: (exportImageHandler) => set({ exportImageHandler }),
  renderPreviewHandler: null,
  registerPreviewHandler: (renderPreviewHandler) => set({ renderPreviewHandler }),
}));
