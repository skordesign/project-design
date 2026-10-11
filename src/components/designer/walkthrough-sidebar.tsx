"use client";

import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  PanelRightClose,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCanvasActions } from "@/components/designer/canvas-actions";
import { useDesigner } from "@/components/designer/store-provider";
import { NODE_KIND_META } from "@/lib/design/catalog";
import { computeFlowWalkthrough, type WalkthroughStep } from "@/lib/design/walkthrough";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanvasUi } from "@/stores/canvas-ui-store";
import { useSelection } from "@/stores/selection-store";

export function WalkthroughSidebar({ wide }: { wide: boolean }) {
  const document = useDesigner((s) => s.document);
  const walkthroughActive = useCanvasUi((s) => s.walkthroughActive);
  const walkthroughStep = useCanvasUi((s) => s.walkthroughStep);
  const walkthroughTag = useCanvasUi((s) => s.walkthroughTag);
  const stopWalkthrough = useCanvasUi((s) => s.stopWalkthrough);
  const setWalkthroughStep = useCanvasUi((s) => s.setWalkthroughStep);
  const nextWalkthroughStep = useCanvasUi((s) => s.nextWalkthroughStep);
  const prevWalkthroughStep = useCanvasUi((s) => s.prevWalkthroughStep);
  const isOpen = useCanvasUi((s) => s.rightSidebarOpen);
  const toggleOpen = useCanvasUi((s) => s.toggleRightSidebar);

  const canvasActions = useCanvasActions();
  const setSelection = useSelection((s) => s.set);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(true);

  const steps: WalkthroughStep[] = useMemo(() => {
    if (!walkthroughActive) return [];
    return computeFlowWalkthrough(document, walkthroughTag);
  }, [document, walkthroughActive, walkthroughTag]);

  const current = steps[walkthroughStep] || steps[0];

  // Camera focus on current step node & highlight connecting edge
  useEffect(() => {
    if (!walkthroughActive || !current) return;
    canvasActions.focus({ nodeId: current.nodeId });
    setSelection([current.nodeId], current.edgeId ? [current.edgeId] : []);
  }, [walkthroughActive, walkthroughStep, current, canvasActions, setSelection]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying || !walkthroughActive || steps.length === 0) return;
    const timer = setInterval(() => {
      if (walkthroughStep >= steps.length - 1) {
        setIsPlaying(false);
      } else {
        nextWalkthroughStep(steps.length);
      }
    }, 4500);
    return () => clearInterval(timer);
  }, [isPlaying, walkthroughActive, walkthroughStep, steps.length, nextWalkthroughStep]);

  // Keyboard navigation: Left, Right, Space, Escape
  useEffect(() => {
    if (!walkthroughActive) return;
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
  }, [walkthroughActive, steps.length, nextWalkthroughStep, prevWalkthroughStep, stopWalkthrough]);

  // Scroll active roadmap item into view
  const activeRoadmapRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (activeRoadmapRef.current) {
      activeRoadmapRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [walkthroughStep]);

  if (!walkthroughActive || steps.length === 0 || !current) return null;

  const isLast = walkthroughStep === steps.length - 1;
  const isFirst = walkthroughStep === 0;
  const progressPercent = Math.round(((walkthroughStep + 1) / steps.length) * 100);

  const content = (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div className="flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Architecture Tour
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {walkthroughTag ? `Flow: #${walkthroughTag}` : "System Overview"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={toggleOpen}
                aria-label="Collapse tour panel (])"
              >
                <PanelRightClose className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Collapse tour panel (])</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={stopWalkthrough}
                aria-label="Exit tour (Esc)"
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Exit tour (Esc)</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Progress & Transport Controls */}
      <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/20 px-3.5 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-semibold text-foreground">
            Step {current.index} of {steps.length}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{progressPercent}%</span>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Playback Buttons */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isFirst}
              onClick={prevWalkthroughStep}
              title="Previous step (←)"
            >
              <ChevronLeft className="mr-0.5 size-3.5" />
              Prev
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setIsPlaying((p) => !p)}
              title={isPlaying ? "Pause auto tour (Space)" : "Play auto tour (Space)"}
            >
              {isPlaying ? (
                <>
                  <Pause className="mr-1 size-3 text-primary" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="mr-1 size-3" />
                  Play
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-1">
            {isLast ? (
              <Button
                variant="default"
                size="sm"
                className="h-7 px-3 text-xs font-medium"
                onClick={stopWalkthrough}
              >
                Finish Tour
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="h-7 px-3 text-xs font-medium gap-0.5"
                onClick={() => nextWalkthroughStep(steps.length)}
                title="Next step (→)"
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            )}

            {isLast && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                title="Restart from step 1"
                onClick={() => setWalkthroughStep(0)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Body */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3.5 p-3.5">
          {/* Active Node Identity */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-bold text-foreground leading-snug">
                {current.nodeName}
              </h3>
              <Badge
                variant="outline"
                className="shrink-0 px-2 py-0.5 text-[11px] font-medium border-primary/40 bg-primary/10 text-primary"
              >
                {NODE_KIND_META[current.nodeKind]?.label || current.nodeKind}
              </Badge>
            </div>

            {/* Tech specs & tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {current.techSpecs && (
                <Badge
                  variant="secondary"
                  className="px-2 py-0 text-[10px] font-normal text-muted-foreground"
                >
                  {current.techSpecs}
                </Badge>
              )}
              {current.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] text-muted-foreground font-mono"
                >
                  #{tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Architectural Explanation */}
          <div className="flex flex-col gap-1 rounded-xl bg-muted/40 border border-border/60 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Architecture Description
            </span>
            <p className="text-xs text-foreground/90 leading-relaxed font-normal whitespace-pre-line">
              {current.description}
            </p>
          </div>

          {/* Flow Transitions */}
          {(current.incomingTransitions.length > 0 ||
            current.nextTargetName ||
            current.outgoingTransitions.length > 0) && (
            <div className="flex flex-col gap-2 rounded-xl bg-muted/20 border border-border/50 p-3 text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Connections & Flow
              </span>

              {/* Called By */}
              {current.incomingTransitions.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-foreground/80">
                    Called by / Triggered by:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {current.incomingTransitions.map((inc, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/40"
                      >
                        {inc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Next Transition in Tour */}
              {current.edgeLabel && current.nextTargetName ? (
                <div className="flex flex-col gap-1 pt-1 border-t border-border/40">
                  <span className="text-[11px] font-medium text-foreground/80">Next in Flow:</span>
                  <div className="flex items-center gap-1.5 rounded-lg bg-primary/5 border border-primary/20 p-2 text-xs">
                    <span className="font-mono text-[10px] text-primary">{current.edgeLabel}</span>
                    <ArrowRight className="size-3 text-primary shrink-0" />
                    <strong className="text-foreground">{current.nextTargetName}</strong>
                  </div>
                </div>
              ) : current.outgoingTransitions.length > 0 ? (
                <div className="flex flex-col gap-0.5 pt-1 border-t border-border/40">
                  <span className="text-[11px] font-medium text-foreground/80">
                    Calls / Accesses:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {current.outgoingTransitions.map((out, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/40"
                      >
                        {out}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Responsibilities */}
          {current.responsibilities.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl bg-background border border-border/40 p-3 text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Key Responsibilities
              </span>
              <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                {current.responsibilities.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Tour Roadmap (All Steps) */}
          <div className="flex flex-col gap-1.5 pt-1">
            <button
              onClick={() => setShowRoadmap((s) => !s)}
              className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <ListOrdered className="size-3.5" />
                Tour Roadmap ({steps.length} steps)
              </span>
              <span>{showRoadmap ? "Hide" : "Show"}</span>
            </button>

            {showRoadmap && (
              <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-muted/10 p-1.5 max-h-60 overflow-y-auto">
                {steps.map((s, idx) => {
                  const isActive = idx === walkthroughStep;
                  return (
                    <button
                      key={s.nodeId + idx}
                      ref={isActive ? activeRoadmapRef : null}
                      onClick={() => setWalkthroughStep(idx)}
                      className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`font-mono text-[10px] size-4 rounded-full flex items-center justify-center shrink-0 ${
                            isActive
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.index}
                        </span>
                        <span className="truncate">{s.nodeName}</span>
                      </div>
                      <span
                        className={`text-[9px] uppercase px-1 py-0.2 rounded shrink-0 ${
                          isActive
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {NODE_KIND_META[s.nodeKind]?.label || s.nodeKind}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Footer Hotkey Guide */}
      <footer className="shrink-0 border-t bg-muted/10 px-3 py-2 text-center text-[10px] text-muted-foreground font-mono">
        ← / → navigate · Space play/pause · Esc exit · ] panel
      </footer>
    </div>
  );

  if (wide) {
    if (!isOpen) {
      return (
        <aside
          aria-label="Collapsed architecture tour panel"
          className="flex w-11 shrink-0 flex-col items-center border-l bg-background/95 py-2 backdrop-blur-sm transition-all"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleOpen}
                aria-label="Expand tour panel (])"
                className="size-8 text-primary hover:text-primary hover:bg-primary/10"
              >
                <Sparkles className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Expand tour panel (])</TooltipContent>
          </Tooltip>
          <span className="mt-3 rotate-90 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
            Step {current.index}/{steps.length}
          </span>
        </aside>
      );
    }

    return (
      <aside
        aria-label="Architecture Tour Guide"
        className="w-96 shrink-0 border-l bg-background transition-all"
      >
        {content}
      </aside>
    );
  }

  // Mobile / Narrow screen drawer
  return (
    <Sheet open={walkthroughActive} onOpenChange={(open) => !open && stopWalkthrough()}>
      <SheetContent side="right" className="w-full max-w-[88vw] sm:max-w-sm gap-0 p-0">
        <SheetTitle className="sr-only">Architecture Tour Guide</SheetTitle>
        <SheetDescription className="sr-only">
          Interactive guided walkthrough of the software architecture.
        </SheetDescription>
        {content}
      </SheetContent>
    </Sheet>
  );
}
