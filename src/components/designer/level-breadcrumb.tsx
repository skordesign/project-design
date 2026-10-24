"use client";

import { ChevronRight, Focus, FolderTree } from "lucide-react";
import { Fragment, useMemo } from "react";

import { KIND_STYLE } from "@/components/designer/nodes/kind-style";
import { useDesigner } from "@/components/designer/store-provider";
import { breadcrumb } from "@/lib/design/levels";
import { cn } from "@/lib/utils";
import { useCanvasUi } from "@/stores/canvas-ui-store";

/**
 * Project › Service › Layer: where the levels view is drilled into; each step goes back up.
 * Inside a node, the Standalone toggle hides everything outside it.
 */
export function LevelBreadcrumb({ focusId }: { focusId: string | null }) {
  const document = useDesigner((s) => s.document);
  const standalone = useCanvasUi((s) => s.standalone);
  const trail = useMemo(() => breadcrumb(document, focusId), [document, focusId]);
  const go = (id: string | null) => useCanvasUi.getState().setFocus(id);
  return (
    <nav
      aria-label="Level navigation"
      className="inline-flex max-w-[460px] items-center gap-1 overflow-hidden rounded-full border border-border/80 bg-background/95 px-2.5 py-1 text-xs shadow-xs backdrop-blur-md"
    >
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 rounded-sm px-1 py-0.5 transition-colors hover:text-foreground outline-none cursor-pointer",
          trail.length === 0 ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
        onClick={() => go(null)}
        title="Project Root"
      >
        <FolderTree className="size-3.5 text-primary shrink-0" aria-hidden />
        <span>Project</span>
      </button>
      {trail.map((n, i) => {
        const Icon = KIND_STYLE[n.kind].icon;
        const last = i === trail.length - 1;
        return (
          <Fragment key={n.id}>
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 min-w-0 rounded-sm px-1 py-0.5 transition-colors hover:text-foreground outline-none cursor-pointer",
                last ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
              aria-current={last ? "location" : undefined}
              onClick={() => go(n.id)}
              title={n.name}
            >
              <Icon className={cn("size-3 shrink-0", KIND_STYLE[n.kind].text)} aria-hidden />
              <span className="truncate max-w-[120px]">{n.name}</span>
            </button>
          </Fragment>
        );
      })}
      {trail.length > 0 && (
        <>
          <span className="mx-0.5 h-3.5 w-px shrink-0 bg-border" aria-hidden />
          <button
            type="button"
            aria-pressed={standalone}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors outline-none cursor-pointer",
              standalone
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => useCanvasUi.getState().toggleStandalone()}
            title={standalone ? "Show connected components" : "Hide everything outside this view"}
          >
            <Focus className="size-3" aria-hidden />
            <span>Standalone</span>
          </button>
        </>
      )}
    </nav>
  );
}
