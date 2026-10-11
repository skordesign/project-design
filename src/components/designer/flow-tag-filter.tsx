"use client";

import { Sparkles, Tag, X } from "lucide-react";
import { useMemo } from "react";

import { useDesigner } from "@/components/designer/store-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCanvasUi } from "@/stores/canvas-ui-store";

export function FlowTagFilter() {
  const document = useDesigner((s) => s.document);
  const activeTag = useCanvasUi((s) => s.activeTag);
  const setActiveTag = useCanvasUi((s) => s.setActiveTag);
  const startWalkthrough = useCanvasUi((s) => s.startWalkthrough);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of document.nodes) {
      for (const t of n.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return counts;
  }, [document.nodes]);

  const tags = useMemo(() => Array.from(tagCounts.keys()).sort(), [tagCounts]);

  if (tags.length === 0) return null;

  return (
    <>
      <div className="h-4 w-px bg-border/60" />
      <div className="inline-flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60",
                activeTag && "bg-primary/10 text-primary font-semibold hover:bg-primary/15",
              )}
            >
              <Tag className="size-3.5" />
              <span>{activeTag ? `Flow: ${activeTag}` : "Flows"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56 text-xs">
            <DropdownMenuItem
              className={cn(!activeTag && "font-semibold text-primary")}
              onClick={() => setActiveTag(null)}
            >
              Show All Components
            </DropdownMenuItem>
            <DropdownMenuItem
              className="font-medium text-primary"
              onClick={() => startWalkthrough(null)}
            >
              <Sparkles className="size-3.5" />
              Tour Entire Architecture
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {tags.map((tag) => (
              <DropdownMenuItem
                key={tag}
                className={cn("justify-between", activeTag === tag && "font-semibold text-primary")}
                onClick={() => setActiveTag(tag)}
              >
                <span>{tag}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {tagCounts.get(tag)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {activeTag && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => startWalkthrough(activeTag)}
              className="h-7 gap-1 rounded-full border-primary/40 bg-primary/10 px-2.5 text-xs font-semibold text-primary shadow-2xs hover:bg-primary/20"
              title={`Tour ${activeTag} step by step`}
            >
              <Sparkles className="size-3" />
              Tour
            </Button>
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Clear flow filter"
              aria-label="Clear flow filter"
            >
              <X className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </>
  );
}
