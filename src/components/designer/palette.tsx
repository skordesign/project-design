"use client";

import {
  FolderTree,
  GripVertical,
  LayoutGrid,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import { useCanvasActions } from "@/components/designer/canvas-actions";
import { KIND_STYLE } from "@/components/designer/nodes/kind-style";
import { useDesigner } from "@/components/designer/store-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { canContain, NODE_KIND_META } from "@/lib/design/catalog";
import { NODE_KINDS, type DesignNode, type NodeKind } from "@/lib/design/schema";
import { cn } from "@/lib/utils";
import { useCanvasUi, PALETTE_LAYOUT_KEY, type PaletteLayout } from "@/stores/canvas-ui-store";
import { useSelection } from "@/stores/selection-store";

export const DRAG_MIME = "application/x-design-kind";

interface KindCategory {
  title: string;
  kinds: NodeKind[];
}

const SOFTWARE_CATEGORIES: KindCategory[] = [
  {
    title: "Architecture & Code",
    kinds: ["service", "layer", "module"],
  },
  {
    title: "Data & Persistence",
    kinds: ["entity", "datastore"],
  },
  {
    title: "Interfaces & Events",
    kinds: ["api", "queue", "integration"],
  },
  {
    title: "Context & Documentation",
    kinds: ["actor", "note"],
  },
];

const GAME_CATEGORIES: KindCategory[] = [
  { title: "Game design", kinds: ["loop", "system", "mechanic", "resource", "content"] },
  {
    title: "Technical",
    kinds: ["service", "layer", "module", "datastore", "entity", "api", "queue", "integration"],
  },
  { title: "Context & Documentation", kinds: ["actor", "note"] },
];

function PaletteButton({
  kind,
  layout,
  selectedKind,
  focusKind,
  onAdd,
}: {
  kind: NodeKind;
  layout: PaletteLayout;
  selectedKind: NodeKind | null;
  focusKind: NodeKind | null;
  onAdd: (kind: NodeKind) => void;
}) {
  const meta = NODE_KIND_META[kind];
  const style = KIND_STYLE[kind];
  const Icon = style.icon;
  const needsParent = !canContain(null, kind);
  const canClickAdd =
    !needsParent ||
    Boolean(
      (selectedKind && canContain(selectedKind, kind)) ||
      (focusKind &&
        (focusKind === "module"
          ? true
          : canContain(focusKind, kind) || (kind === "layer" && focusKind === "layer"))),
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          draggable
          aria-label={`Add ${meta.label}`}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_MIME, kind);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onAdd(kind)}
          className={cn(
            "group relative flex w-full min-w-0 cursor-grab items-center rounded-lg border text-left transition-all active:cursor-grabbing",
            layout === "grid"
              ? "h-9 gap-2 border-border/70 bg-card/75 px-2 py-1.5 shadow-2xs hover:border-primary/40 hover:bg-accent/80 hover:shadow-xs"
              : "h-8.5 gap-2.5 border-border/60 bg-card/60 px-2.5 py-1.5 shadow-2xs hover:border-primary/40 hover:bg-accent/80",
          )}
        >
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-md border border-border/70 bg-background/90 shadow-2xs transition-transform group-hover:scale-105",
            )}
          >
            <Icon className={cn("size-3.5", style.text)} aria-hidden />
          </span>

          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate font-medium leading-none text-foreground group-hover:text-primary",
                layout === "grid" ? "text-[11.5px]" : "text-xs",
              )}
            >
              {meta.label}
            </span>
          </span>

          {meta.container && layout === "grid" && (
            <span
              title="Container Box"
              className="size-1.5 shrink-0 rounded-full bg-primary/70 ring-2 ring-primary/20"
              aria-hidden
            />
          )}

          {meta.container && layout === "list" && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground uppercase">
              Box
            </span>
          )}

          {layout === "list" && (
            <GripVertical
              className="size-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
              aria-hidden
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={8}
        className="z-50 flex w-70 flex-col gap-2 rounded-xl border border-border/80 bg-popover p-3 text-popover-foreground shadow-lg backdrop-blur-md [&>svg]:hidden"
      >
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md border border-border/70 bg-background shadow-2xs">
              <Icon className={cn("size-3.5", style.text)} />
            </span>
            <span className="text-xs font-semibold text-foreground">{meta.label}</span>
          </div>
          {meta.container && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary uppercase">
              Container Box
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
        {needsParent && !canClickAdd ? (
          <div className="flex flex-col gap-1 border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground">
            <span className="font-medium text-amber-600 dark:text-amber-400">
              Requires container: {meta.parents.filter(Boolean).join(" or ")}
            </span>
            <span>Drag onto a container, or select one and click to add</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground/70">
            <span>Click to add</span>
            <span>•</span>
            <span>Drag to canvas</span>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function PaletteContent() {
  const actions = useCanvasActions();
  const paletteLayout = useCanvasUi((s) => s.paletteLayout);
  const setPaletteLayout = useCanvasUi((s) => s.setPaletteLayout);
  const selectedId = useSelection((s) =>
    s.nodeIds.length === 1 && s.edgeIds.length === 0 ? s.nodeIds[0] : null,
  );
  const selectedKind = useDesigner(
    (s) => s.document.nodes.find((n) => n.id === selectedId)?.kind ?? null,
  );
  const mode = useDesigner((s) => s.document.overview.mode);
  const categories = mode === "game" ? GAME_CATEGORIES : SOFTWARE_CATEGORIES;
  const focusId = useCanvasUi((s) => s.focusId);
  const focusKind = useDesigner(
    (s) => (focusId ? s.document.nodes.find((n) => n.id === focusId)?.kind ?? null : null),
  );

  return (
    <div className="flex w-full flex-1 flex-col gap-3 p-2.5">
      {/* Subheader with View Switcher */}
      <div className="flex w-full items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Nodes ({categories.reduce((acc, c) => acc + c.kinds.length, 0)})
        </span>
        <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setPaletteLayout("grid")}
            className={cn(
              "rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
              paletteLayout === "grid" && "bg-background text-foreground shadow-2xs",
            )}
            title="Grid view (Compact 2-columns)"
            aria-label="Grid view"
          >
            <LayoutGrid className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => setPaletteLayout("list")}
            className={cn(
              "rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
              paletteLayout === "list" && "bg-background text-foreground shadow-2xs",
            )}
            title="List view (Full width rows)"
            aria-label="List view"
          >
            <List className="size-3" />
          </button>
        </div>
      </div>

      {categories.map((cat) => (
        <section key={cat.title} className="flex w-full flex-col gap-1.5">
          <h3 className="px-1 text-[10px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
            {cat.title}
          </h3>
          <div
            className={cn(
              "w-full",
              paletteLayout === "grid" ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-1",
            )}
          >
            {cat.kinds.map((kind) => (
              <PaletteButton
                key={kind}
                kind={kind}
                layout={paletteLayout}
                selectedKind={selectedKind}
                focusKind={focusKind}
                onAdd={(k) => {
                  actions.addNodeAtCenter(k);
                  if (typeof window !== "undefined" && window.innerWidth < 768) {
                    useCanvasUi.getState().setLeftSidebarOpen(false);
                  }
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ExplorerContent() {
  const document = useDesigner((s) => s.document);
  const actions = useCanvasActions();
  const searchQuery = useCanvasUi((s) => s.searchQuery);
  const activeFilterKind = useCanvasUi((s) => s.activeFilterKind);
  const selectedIds = useSelection((s) => s.nodeIds);

  const nodeMap = useMemo(() => {
    return new Map<string, DesignNode>(document.nodes.map((n) => [n.id, n]));
  }, [document.nodes]);

  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of document.nodes) {
      counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    }
    return counts;
  }, [document.nodes]);

  const filteredNodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return document.nodes.filter((node) => {
      if (activeFilterKind !== "all" && node.kind !== activeFilterKind) return false;
      if (!query) return true;
      const matchName = node.name.toLowerCase().includes(query);
      const matchId = node.id.toLowerCase().includes(query);
      const matchDesc = node.description.toLowerCase().includes(query);
      const matchKind = node.kind.toLowerCase().includes(query);
      return matchName || matchId || matchDesc || matchKind;
    });
  }, [document.nodes, searchQuery, activeFilterKind]);

  function handleSelectNode(nodeId: string) {
    useSelection.getState().set([nodeId], []);
    useCanvasUi.getState().setRightSidebarOpen(true);
    actions.focus({ nodeId });
  }

  function getParentPath(node: DesignNode): string | null {
    if (!node.parentId) return null;
    const parent = nodeMap.get(node.parentId);
    if (!parent) return null;
    if (parent.parentId) {
      const grandParent = nodeMap.get(parent.parentId);
      if (grandParent) return `${grandParent.name} › ${parent.name}`;
    }
    return parent.name;
  }

  return (
    <div className="flex w-full flex-1 flex-col overflow-hidden">
      {/* Search Bar */}
      <div className="border-b p-2.5">
        <div className="relative">
          <Search
            className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchQuery}
            placeholder={`Search ${document.nodes.length} components…`}
            onChange={(e) => useCanvasUi.getState().setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-7 text-xs"
            aria-label="Search components"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => useCanvasUi.getState().setSearchQuery("")}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="mt-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => useCanvasUi.getState().setActiveFilterKind("all")}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              activeFilterKind === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            All ({document.nodes.length})
          </button>
          {NODE_KINDS.map((kind) => {
            const count = kindCounts.get(kind) ?? 0;
            if (count === 0) return null;
            const active = activeFilterKind === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => useCanvasUi.getState().setActiveFilterKind(kind)}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                {NODE_KIND_META[kind].label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Nodes list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredNodes.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No components match &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredNodes.map((node) => {
              const isSelected = selectedIds.includes(node.id);
              const style = KIND_STYLE[node.kind];
              const Icon = style.icon;
              const parentPath = getParentPath(node);

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    handleSelectNode(node.id);
                    if (typeof window !== "undefined" && window.innerWidth < 768) {
                      useCanvasUi.getState().setLeftSidebarOpen(false);
                    }
                  }}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-lg p-2 text-left text-xs transition-colors hover:bg-muted/60",
                    isSelected && "border border-primary/40 bg-primary/5 font-medium",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-md border bg-background shadow-2xs",
                    )}
                  >
                    <Icon className={cn("size-3.5", style.text)} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-foreground">{node.name}</span>
                      <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
                        {node.kind}
                      </span>
                    </div>
                    {parentPath && (
                      <p className="truncate text-[10px] text-muted-foreground">{parentPath}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Collapsible left sidebar supporting Components Palette & Project Explorer. */
export function Palette() {
  const isOpen = useCanvasUi((s) => s.leftSidebarOpen);
  const activeTab = useCanvasUi((s) => s.leftSidebarTab);
  const toggleOpen = useCanvasUi((s) => s.toggleLeftSidebar);
  const setTab = useCanvasUi((s) => s.setLeftSidebarTab);
  const setPaletteLayout = useCanvasUi((s) => s.setPaletteLayout);
  const document = useDesigner((s) => s.document);

  // Restore saved palette layout preference from localStorage on mount & auto-collapse on mobile
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PALETTE_LAYOUT_KEY);
      if (saved === "grid" || saved === "list") {
        setPaletteLayout(saved);
      }
    } catch {
      // Storage unavailable
    }
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      useCanvasUi.getState().setLeftSidebarOpen(false);
    }
  }, [setPaletteLayout]);

  if (!isOpen) {
    return (
      <aside
        aria-label="Collapsed sidebar"
        className="hidden md:flex w-11 shrink-0 flex-col items-center border-r bg-background/95 py-2 backdrop-blur-sm transition-all"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={toggleOpen}
              aria-label="Expand sidebar ([)"
              className="mb-2 size-8 text-muted-foreground hover:text-foreground"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar ([)</TooltipContent>
        </Tooltip>

        <div className="flex flex-col gap-1 border-t pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeTab === "palette" ? "secondary" : "ghost"}
                size="icon-xs"
                onClick={() => setTab("palette")}
                aria-label="Add components"
                className="size-8"
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Add components</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeTab === "explorer" ? "secondary" : "ghost"}
                size="icon-xs"
                onClick={() => setTab("explorer")}
                aria-label="Project explorer"
                className="size-8"
              >
                <FolderTree className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Project explorer ({document.nodes.length})</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    );
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
        onClick={toggleOpen}
        aria-hidden
      />
      <aside
        aria-label="Components and Explorer"
        className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-hidden border-r bg-background shadow-2xl transition-all md:relative md:z-auto md:w-68 md:max-w-none md:shadow-none"
      >
        {/* Header with Tabs and Collapse button */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
          <div className="flex items-center gap-1 rounded-lg bg-muted/80 p-0.5">
            <button
              type="button"
              onClick={() => setTab("palette")}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                activeTab === "palette"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Plus className="size-3.5" />
              Add
            </button>
            <button
              type="button"
              onClick={() => setTab("explorer")}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                activeTab === "explorer"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FolderTree className="size-3.5" />
              Explorer
            </button>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={toggleOpen}
                aria-label="Collapse sidebar ([)"
                className="size-7 text-muted-foreground hover:text-foreground"
              >
                <PanelLeftClose className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse sidebar ([)</TooltipContent>
          </Tooltip>
        </header>

        {/* Body Content */}
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
          {activeTab === "palette" ? <PaletteContent /> : <ExplorerContent />}
        </div>
      </aside>
    </>
  );
}
