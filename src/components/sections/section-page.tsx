"use client";

import { useDesigner } from "@/components/designer/store-provider";

export function SectionPage({
  title,
  description,
  actions,
  wide,
  editable,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  wide?: boolean;
  /** The page edits the draft, so read-only mode disables its controls. */
  editable?: boolean;
  children: React.ReactNode;
}) {
  const readOnly = useDesigner((s) => s.readOnly);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <main
        className={`mx-auto grid w-full grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:p-6 ${wide ? "max-w-5xl" : "max-w-3xl"}`}
      >
        <fieldset disabled={editable && readOnly} className="contents">
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <h1 className="font-heading text-lg font-semibold">{title}</h1>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </header>
          {children}
        </fieldset>
      </main>
    </div>
  );
}
