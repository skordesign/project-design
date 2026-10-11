"use client";

import { AlertTriangle, CircleAlert, Info, X } from "lucide-react";
import { useMemo } from "react";

import { useCanvasActions } from "@/components/designer/canvas-actions";
import { useDesigner } from "@/components/designer/store-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Issue } from "@/lib/design/integrity";
import { validateDesign } from "@/lib/design/validate";
import { useCanvasUi } from "@/stores/canvas-ui-store";
import { useSelection } from "@/stores/selection-store";

const ICON = {
  error: <CircleAlert className="size-4 shrink-0 text-red-500" aria-label="Error" />,
  warning: <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-label="Warning" />,
  info: <Info className="size-4 shrink-0 text-sky-500" aria-label="Info" />,
};
const TITLES = { error: "Errors", warning: "Warnings", info: "Hints" } as const;

export function ValidationPanel() {
  const document = useDesigner((s) => s.document);
  const actions = useCanvasActions();
  const layout = useCanvasUi((s) => s.viewMode);
  const issues = useMemo(() => validateDesign(document, { layout }), [document, layout]);

  function open(issue: Issue) {
    if (issue.nodeId) useSelection.getState().set([issue.nodeId], []);
    else if (issue.edgeId) useSelection.getState().set([], [issue.edgeId]);
    else return;
    actions.focus({ nodeId: issue.nodeId, edgeId: issue.edgeId });
  }

  return (
    <section
      aria-label="Validation"
      className="flex h-70 w-[calc(100vw-2rem)] sm:w-90 max-w-sm flex-col overflow-hidden rounded-xl border bg-background shadow-lg shadow-black/5"
    >
      <header className="flex items-start justify-between gap-2 border-b px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Validation</h2>
          <p className="text-xs text-muted-foreground">
            {issues.length === 0
              ? "Checked against the design rules"
              : `${issues.length} ${issues.length === 1 ? "issue" : "issues"} · click one to find it`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close validation panel"
          onClick={() => useCanvasUi.getState().toggleValidation(false)}
        >
          <X />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {issues.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No problems found.</p>
        ) : (
          (["error", "warning", "info"] as const).map((severity) => {
            const group = issues.filter((i) => i.severity === severity);
            if (group.length === 0) return null;
            return (
              <div key={severity} className="px-2 py-1.5">
                <h3 className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
                  {TITLES[severity]} ({group.length})
                </h3>
                <ul>
                  {group.map((issue, i) => {
                    const clickable = issue.nodeId || issue.edgeId;
                    return (
                      <li key={`${issue.code}-${i}`}>
                        <button
                          type="button"
                          disabled={!clickable}
                          className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs enabled:hover:bg-muted"
                          onClick={() => open(issue)}
                        >
                          {ICON[severity]}
                          <span>{issue.message}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </ScrollArea>
    </section>
  );
}
