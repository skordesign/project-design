"use client";

import { AlertTriangle, CircleAlert, Lock, LockOpen, Network, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { renameProjectAction } from "@/app/actions/projects";
import { ConnectDialog, ExportMenu } from "@/components/designer/header-menus";
import { PublishDialog } from "@/components/designer/publish-dialog";
import { SaveIndicator } from "@/components/designer/save-indicator";
import {
  useDesigner,
  useDesignerStore,
  useProjectMeta,
} from "@/components/designer/store-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateDesign } from "@/lib/design/validate";
import { cn } from "@/lib/utils";
import { useCanvasUi } from "@/stores/canvas-ui-store";

const TABS = [
  { segment: "", label: "Canvas" },
  { segment: "overview", label: "Overview" },
  { segment: "stack", label: "Stack" },
  { segment: "conventions", label: "Conventions" },
  { segment: "decisions", label: "Decisions" },
  { segment: "roadmap", label: "Roadmap" },
  { segment: "brief", label: "Brief" },
  { segment: "versions", label: "Versions" },
] as const;

function ProjectName() {
  const { name, slug } = useProjectMeta();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [, startTransition] = useTransition();

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next === "" || next === name) return;
    startTransition(async () => {
      const result = await renameProjectAction(slug, { name: next });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  if (editing) {
    return (
      <Input
        value={draft}
        maxLength={120}
        aria-label="Project name"
        autoFocus
        className="h-6 w-36 sm:w-64"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="-mx-1 truncate rounded px-1 text-left font-heading text-sm font-semibold hover:bg-muted"
      title="Click to rename"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
    >
      {name}
    </button>
  );
}

function ValidateButton() {
  const document = useDesigner((s) => s.document);
  const open = useCanvasUi((s) => s.validationOpen);
  const pathname = usePathname();
  const router = useRouter();
  const { slug } = useProjectMeta();
  const layout = useCanvasUi((s) => s.viewMode);
  const issues = useMemo(() => validateDesign(document, { layout }), [document, layout]);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const count = errors || warnings;
  return (
    <Button
      variant={open ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={open}
      onClick={() => {
        if (pathname !== `/projects/${slug}`) {
          useCanvasUi.getState().toggleValidation(true);
          router.push(`/projects/${slug}`);
        } else useCanvasUi.getState().toggleValidation();
      }}
    >
      {errors ? (
        <CircleAlert className="text-red-500" />
      ) : warnings ? (
        <AlertTriangle className="text-amber-500" />
      ) : (
        <ShieldCheck />
      )}
      <span className="hidden sm:inline">Validate</span>
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 text-xs ${errors ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600"}`}
          aria-label={`${count} ${errors ? "errors" : "warnings"}`}
        >
          {count}
        </span>
      )}
    </Button>
  );
}

/** Locks the design against edits here; agents and other tabs can still change it. */
function ReadOnlyToggle() {
  const store = useDesignerStore();
  const readOnly = useDesigner((s) => s.readOnly);
  return (
    <Button
      variant={readOnly ? "secondary" : "outline"}
      size="sm"
      aria-pressed={readOnly}
      title={readOnly ? "Allow editing" : "View only: block edits in this browser"}
      onClick={() => store.getState().setReadOnly(!readOnly)}
    >
      {readOnly ? <Lock /> : <LockOpen />}
      <span className="hidden sm:inline">Read-only</span>
    </Button>
  );
}

export function ProjectHeader() {
  const { slug, description } = useProjectMeta();
  const pathname = usePathname();
  const mobileNav = useRef<HTMLElement>(null);
  // The small-screen tab row scrolls sideways; keep the current section visible.
  useEffect(() => {
    mobileNav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  return (
    <div className="shrink-0 border-b bg-background/95 backdrop-blur-sm">
      <div className="flex h-13 items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4">
        {/* Left: Project identity */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/50 shadow-2xs">
            <Network className="size-4 text-foreground" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ProjectName />
              <SaveIndicator />
            </div>
            {description && (
              <p className="hidden max-w-xs truncate text-[11px] text-muted-foreground 2xl:block">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Center: Tabs */}
        <nav aria-label="Project sections" className="hidden lg:flex items-center">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-muted/60 p-0.5 shadow-2xs">
            {TABS.map((tab) => {
              const href = tab.segment ? `/projects/${slug}/${tab.segment}` : `/projects/${slug}`;
              const active = pathname === href;
              return (
                <Link
                  key={tab.label}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-background font-semibold text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center divide-x overflow-hidden rounded-lg border bg-background shadow-xs [&>button]:rounded-none [&>button]:border-0 [&>button]:shadow-none">
            <ValidateButton />
            <ExportMenu />
            <ConnectDialog />
          </div>
          <ReadOnlyToggle />
          <PublishDialog />
        </div>
      </div>

      {/* Sub-nav row for mobile/smaller screens (< lg) */}
      <nav
        ref={mobileNav}
        aria-label="Mobile project sections"
        className="flex h-9 items-center border-t px-3 sm:px-4 lg:hidden overflow-x-auto no-scrollbar scroll-smooth"
      >
        <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {TABS.map((tab) => {
            const href = tab.segment ? `/projects/${slug}/${tab.segment}` : `/projects/${slug}`;
            const active = pathname === href;
            return (
              <Link
                key={tab.label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs transition-colors whitespace-nowrap",
                  active
                    ? "bg-background font-medium text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
