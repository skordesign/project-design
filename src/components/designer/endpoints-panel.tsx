"use client";

import {
  Cable,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useDesigner } from "@/components/designer/store-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { endpointsOf, type EndpointGroup } from "@/lib/design/levels";
import type { DesignNode, Operation } from "@/lib/design/schema";
import { cn } from "@/lib/utils";
import { useSelection } from "@/stores/selection-store";

const STORAGE_KEY = "pd:endpoints-panel-offset";
let inMemoryOffset: { x: number; y: number } | null = null;

function loadOffset(): { x: number; y: number } {
  if (inMemoryOffset) return inMemoryOffset;
  if (typeof window === "undefined") return { x: 0, y: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        inMemoryOffset = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { x: 0, y: 0 };
}

function saveOffset(offset: { x: number; y: number }) {
  inMemoryOffset = offset;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(offset));
  } catch {
    // ignore
  }
}

function MethodBadge({ method, fallback }: { method: string | null; fallback: string }) {
  const m = (method ?? fallback).toUpperCase();
  let colorClass = "border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300";
  if (m === "GET") {
    colorClass = "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  } else if (m === "POST") {
    colorClass = "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300";
  } else if (m === "PUT") {
    colorClass = "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300";
  } else if (m === "PATCH") {
    colorClass = "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300";
  } else if (m === "DELETE") {
    colorClass = "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300";
  }

  return (
    <span
      className={cn(
        "inline-flex w-12 shrink-0 items-center justify-center rounded border px-1 py-0.5 font-mono text-[9px] font-bold leading-none tracking-wider",
        colorClass,
      )}
    >
      {m}
    </span>
  );
}

function OperationRow({
  op,
  api,
  copiedPath,
  onCopy,
}: {
  op: Operation;
  api: EndpointGroup["api"];
  copiedPath: string | null;
  onCopy: (path: string) => void;
}) {
  const fullPath = op.path !== null ? `${api.data.basePath}${op.path}` : null;
  const isCopied = fullPath !== null && copiedPath === fullPath;

  return (
    <div className="group/op flex w-full items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-muted/80">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-2 text-left text-xs"
        title={op.summary || op.name}
        onClick={() => useSelection.getState().set([api.id], [])}
      >
        <MethodBadge method={op.method} fallback={api.data.style} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[11px] font-medium text-foreground">
            {fullPath ?? op.name}
          </span>
          {op.path !== null && op.name && (
            <span className="block truncate text-[10px] text-muted-foreground">{op.name}</span>
          )}
        </span>
      </button>
      {fullPath && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(fullPath);
          }}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover/op:opacity-100"
          title="Copy path"
          aria-label="Copy endpoint path"
        >
          {isCopied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
        </button>
      )}
    </div>
  );
}

function Group({
  group,
  searchQuery,
  copiedPath,
  onCopy,
}: {
  group: EndpointGroup;
  searchQuery: string;
  copiedPath: string | null;
  onCopy: (path: string) => void;
}) {
  const { api, operations, whole } = group;

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return operations;
    const q = searchQuery.toLowerCase().trim();
    return operations.filter((op) => {
      const fullPath = op.path !== null ? `${api.data.basePath}${op.path}` : "";
      return (
        op.name.toLowerCase().includes(q) ||
        (op.summary ?? "").toLowerCase().includes(q) ||
        fullPath.toLowerCase().includes(q) ||
        (op.method ?? "").toLowerCase().includes(q) ||
        api.name.toLowerCase().includes(q)
      );
    });
  }, [operations, searchQuery, api]);

  if (searchQuery.trim() && filtered.length === 0) {
    return null;
  }

  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center justify-between px-2 pb-1">
        <button
          type="button"
          className="flex items-baseline gap-1.5 text-left text-xs font-semibold hover:text-primary transition-colors"
          onClick={() => useSelection.getState().set([api.id], [])}
        >
          <span>{api.name}</span>
          <span className="text-[10px] font-normal text-muted-foreground">
            {api.data.style}
            {whole ? " · whole API" : ` · ${operations.length} of ${api.data.operations.length}`}
          </span>
        </button>
      </div>
      {operations.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">The API has no operations yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {filtered.map((op) => (
            <li key={op.id}>
              <OperationRow op={op} api={api} copiedPath={copiedPath} onCopy={onCopy} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The endpoints a focused module (a controller, say) implements and calls. */
export function EndpointsPanel({ focus }: { focus: DesignNode }) {
  const document = useDesigner((s) => s.document);
  const { implements: implemented, calls } = useMemo(
    () => endpointsOf(document, focus.id),
    [document, focus.id],
  );
  const total = [...implemented, ...calls].reduce((n, g) => n + g.operations.length, 0);

  // Default: start open only if there are endpoints, otherwise keep as unobtrusive pill so canvas is unblocked
  const [isOpen, setIsOpen] = useState(() => total > 0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Position offset (persists in localStorage & memory across switches)
  const [offset, setOffset] = useState<{ x: number; y: number }>(loadOffset);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    hasMoved: boolean;
    el: HTMLElement | null;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Don't drag if interacting with buttons, inputs, links, or scroll area
    if (target.closest("button, input, a, [data-slot='scroll-area']")) return;

    e.preventDefault();
    e.stopPropagation();

    const currentTarget = e.currentTarget;
    currentTarget.setPointerCapture(e.pointerId);

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
      hasMoved: false,
      el: currentTarget,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    if (!dragRef.current.hasMoved && Math.hypot(dx, dy) > 3) {
      dragRef.current.hasMoved = true;
      setIsDragging(true);
    }

    if (dragRef.current.hasMoved) {
      const nextX = dragRef.current.originX + dx;
      const nextY = dragRef.current.originY + dy;
      setOffset({ x: nextX, y: nextY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>, isPill = false) => {
    if (!dragRef.current) return;
    e.stopPropagation();

    const hadMoved = dragRef.current.hasMoved;
    const targetEl = dragRef.current.el;
    dragRef.current = null;
    setIsDragging(false);

    if (targetEl) {
      try {
        targetEl.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    if (hadMoved) {
      saveOffset(offset);
    } else if (isPill) {
      setIsOpen(true);
    }
  };

  const handleResetPosition = () => {
    const zero = { x: 0, y: 0 };
    setOffset(zero);
    saveOffset(zero);
  };

  const handleCopy = (path: string) => {
    navigator.clipboard?.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const isCustomPosition = offset.x !== 0 || offset.y !== 0;

  // Compact floating pill when closed
  if (!isOpen) {
    return (
      <div
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
          transition: isDragging ? "none" : "transform 0.1s ease-out",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => handlePointerUp(e, true)}
        onDoubleClick={handleResetPosition}
        className={cn(
          "group flex h-8 select-none items-center gap-1.5 rounded-full border border-border/80 bg-background/95 px-2.5 py-1 shadow-md backdrop-blur-md transition-shadow hover:border-primary/40 hover:bg-accent hover:shadow-lg",
          isDragging ? "cursor-grabbing opacity-90 shadow-xl" : "cursor-grab",
        )}
        role="button"
        tabIndex={0}
        title="Click to open · Drag to move anywhere · Double-click to reset"
        aria-label={`Open Endpoints panel for ${focus.name} (${total} operations)`}
      >
        <GripVertical
          className="size-3 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
          aria-hidden
        />
        <Cable
          className="size-3.5 text-sky-500 transition-transform group-hover:scale-110"
          aria-hidden
        />
        <span className="text-xs font-medium">Endpoints</span>
        <Badge
          variant={total > 0 ? "secondary" : "outline"}
          className={cn(
            "h-4 px-1.5 text-[10px] font-mono transition-colors",
            total > 0
              ? "border-sky-500/30 bg-sky-500/15 font-semibold text-sky-700 dark:text-sky-300"
              : "text-muted-foreground",
          )}
        >
          {total}
        </Badge>
      </div>
    );
  }

  return (
    <section
      aria-label="Endpoints"
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        transition: isDragging ? "none" : "transform 0.1s ease-out",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "flex w-84 sm:w-90 flex-col overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-xl shadow-black/10 backdrop-blur-md transition-shadow",
        isDragging && "shadow-2xl ring-2 ring-primary/25",
      )}
    >
      <header
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => handlePointerUp(e, false)}
        onDoubleClick={handleResetPosition}
        title="Drag header to move · Double-click to reset position"
        className={cn(
          "flex select-none items-center justify-between border-b px-3 py-2",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Cable className="size-3.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold leading-tight">Endpoints</h2>
              <Badge
                variant={total > 0 ? "secondary" : "outline"}
                className={cn(
                  "h-3.5 px-1 text-[9px] font-mono leading-none",
                  total > 0 && "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20",
                )}
              >
                {total}
              </Badge>
            </div>
            <p className="truncate text-[11px] text-muted-foreground leading-tight">
              {total === 0 ? focus.name : `${focus.name} · ${total} operations`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {isCustomPosition && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Reset position"
              onClick={handleResetPosition}
              title="Reset position to default"
            >
              <RotateCcw className="size-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand body" : "Collapse body"}
          >
            {isCollapsed ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronUp className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close panel"
            onClick={() => setIsOpen(false)}
            title="Close to pill"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </header>

      {!isCollapsed && (
        <>
          {total >= 4 && (
            <div className="border-b px-3 py-1.5">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2 size-3 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter endpoints..."
                  className="h-6.5 pl-6 pr-6 text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 text-muted-foreground hover:text-foreground"
                    aria-label="Clear filter"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <ScrollArea className="max-h-[min(24rem,calc(100vh-14rem))] min-h-0 flex-1">
            {implemented.length === 0 && calls.length === 0 && (
              <div className="p-4 text-center">
                <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
                  <Cable className="size-4" />
                </div>
                <h3 className="text-xs font-medium text-foreground">No endpoints connected</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">{focus.name}</span> implements no
                  API yet. Connect it to an API with an{" "}
                  <span className="font-semibold text-foreground">“exposes”</span> edge, then pick
                  operations in the inspector.
                </p>
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => setIsOpen(false)}
                    className="h-6 gap-1 px-2.5 text-[11px]"
                  >
                    Got it (Hide)
                  </Button>
                </div>
              </div>
            )}
            {implemented.length > 0 && (
              <div className="py-1">
                <h3 className="px-4 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Implements
                </h3>
                {implemented.map((g) => (
                  <Group
                    key={g.edgeId}
                    group={g}
                    searchQuery={searchQuery}
                    copiedPath={copiedPath}
                    onCopy={handleCopy}
                  />
                ))}
              </div>
            )}
            {calls.length > 0 && (
              <div className="py-1">
                <h3 className="px-4 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Calls
                </h3>
                {calls.map((g) => (
                  <Group
                    key={g.edgeId}
                    group={g}
                    searchQuery={searchQuery}
                    copiedPath={copiedPath}
                    onCopy={handleCopy}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </>
      )}
    </section>
  );
}
