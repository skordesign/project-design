"use client";

import { ChevronLeft, ChevronRight, PanelRightOpen, Pause, Play, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useCanvasActions } from "@/components/designer/canvas-actions";
import { useDesigner } from "@/components/designer/store-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NODE_KIND_META } from "@/lib/design/catalog";
import { computeFlowWalkthrough, type WalkthroughStep } from "@/lib/design/walkthrough";
import { useCanvasUi } from "@/stores/canvas-ui-store";
import { useSelection } from "@/stores/selection-store";

export function WalkthroughPlayer() {
  const document = useDesigner((s) => s.document);
  const walkthroughActive = useCanvasUi((s) => s.walkthroughActive);
  const walkthroughStep = useCanvasUi((s) => s.walkthroughStep);
  const walkthroughTag = useCanvasUi((s) => s.walkthroughTag);
  const stopWalkthrough = useCanvasUi((s) => s.stopWalkthrough);
  const nextWalkthroughStep = useCanvasUi((s) => s.nextWalkthroughStep);
  const prevWalkthroughStep = useCanvasUi((s) => s.prevWalkthroughStep);
  const rightSidebarOpen = useCanvasUi((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useCanvasUi((s) => s.toggleRightSidebar);

  const canvasActions = useCanvasActions();
  const setSelection = useSelection((s) => s.set);

  const [isPlaying, setIsPlaying] = useState(false);

  const steps: WalkthroughStep[] = useMemo(() => {
    if (!walkthroughActive) return [];
    return computeFlowWalkthrough(document, walkthroughTag);
  }, [document, walkthroughActive, walkthroughTag]);

  const current = steps[walkthroughStep] || steps[0];

  // Camera focus on current step node & highlight connecting edge (when sidebar is collapsed)
  useEffect(() => {
    if (!walkthroughActive || !current || rightSidebarOpen) return;
    canvasActions.focus({ nodeId: current.nodeId });
    setSelection([current.nodeId], current.edgeId ? [current.edgeId] : []);
  }, [walkthroughActive, walkthroughStep, current, rightSidebarOpen, canvasActions, setSelection]);

  // Auto-play timer (when sidebar is collapsed)
  useEffect(() => {
    if (!isPlaying || !walkthroughActive || steps.length === 0 || rightSidebarOpen) return;
    const timer = setInterval(() => {
      if (walkthroughStep >= steps.length - 1) {
        setIsPlaying(false);
      } else {
        nextWalkthroughStep(steps.length);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [
    isPlaying,
    walkthroughActive,
    walkthroughStep,
    steps.length,
    rightSidebarOpen,
    nextWalkthroughStep,
  ]);

  // Keyboard navigation: Left, Right, Space, Escape (when sidebar is collapsed)
  useEffect(() => {
    if (!walkthroughActive || rightSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextWalkthroughStep(steps.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevWalkthroughStep();
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === "Escape") {
        e.preventDefault();
        stopWalkthrough();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    walkthroughActive,
    rightSidebarOpen,
    steps.length,
    nextWalkthroughStep,
    prevWalkthroughStep,
    stopWalkthrough,
  ]);

  // When right sidebar is open, the full guide lives in the sidebar with 0% canvas obstruction
  if (!walkthroughActive || steps.length === 0 || !current || rightSidebarOpen) {
    return null;
  }

  const isLast = walkthroughStep === steps.length - 1;
  const isFirst = walkthroughStep === 0;

  return (
    <div
      role="region"
      aria-label="Collapsed walkthrough transport bar"
      className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 max-w-[calc(100vw-1rem)] animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="flex h-9 items-center gap-1.5 sm:gap-2 rounded-full border border-primary/30 bg-background/95 px-2.5 sm:px-3 shadow-xl backdrop-blur-md overflow-x-auto no-scrollbar">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-3" />
        </span>

        <div className="flex items-center gap-1.5 truncate max-w-[130px] sm:max-w-[220px]">
          <span className="font-mono text-xs font-semibold text-foreground">
            {current.index}/{steps.length}
          </span>
          <span className="text-xs font-medium text-foreground truncate">{current.nodeName}</span>
          <Badge variant="secondary" className="px-1 py-0 text-[9px] shrink-0 font-normal">
            {NODE_KIND_META[current.nodeKind]?.label || current.nodeKind}
          </Badge>
        </div>

        <div className="flex items-center gap-0.5 border-l border-border/60 pl-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={isFirst}
            onClick={prevWalkthroughStep}
            title="Previous (←)"
          >
            <ChevronLeft className="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => setIsPlaying((p) => !p)}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? <Pause className="size-3 text-primary" /> : <Play className="size-3" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={isLast}
            onClick={() => nextWalkthroughStep(steps.length)}
            title="Next (→)"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1 border-l border-border/60 pl-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] gap-1 text-primary hover:bg-primary/10"
            onClick={toggleRightSidebar}
            title="Open Tour Guide sidebar (])"
          >
            <PanelRightOpen className="size-3" />
            <span>Guide (])</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={stopWalkthrough}
            title="Exit tour (Esc)"
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
