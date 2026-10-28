"use client";

import { Copy, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useStatuses } from "@/components/designer/use-statuses";
import { useDesigner, useProjectMeta } from "@/components/designer/store-provider";
import { copyText } from "@/components/settings/connect-snippets";
import { SectionPage } from "@/components/sections/section-page";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { renderBrief } from "@/lib/design/brief";

export interface VersionOption {
  version: number;
  label: string;
}

export function BriefView({ versions }: { versions: VersionOption[] }) {
  const meta = useProjectMeta();
  const document = useDesigner((s) => s.document);
  const revision = useDesigner((s) => s.revision);
  const statuses = useStatuses(meta.slug);
  const [source, setSource] = useState("draft");
  const [published, setPublished] = useState<{ source: string; text: string } | null>(null);

  const draftBrief = useMemo(
    () =>
      renderBrief({
        project: meta,
        document,
        revision,
        version: null,
        statuses: new Map(Object.entries(statuses).map(([id, s]) => [id, s.status])),
      }),
    [meta, document, revision, statuses],
  );

  useEffect(() => {
    if (source === "draft") return;
    let cancelled = false;
    fetch(`/api/projects/${meta.slug}/brief?version=${source}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("failed"))))
      .then((text) => !cancelled && setPublished({ source, text }))
      .catch(() => !cancelled && toast.error("Couldn't load that version's brief"));
    return () => {
      cancelled = true;
    };
  }, [source, meta.slug]);

  const text =
    source === "draft" ? draftBrief : published?.source === source ? published.text : "Loading…";

  function save() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${meta.slug}-${source}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SectionPage
      wide
      title="Brief"
      description="This is exactly what get_project_brief returns."
      actions={
        <>
          <div className="w-40 sm:w-48">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger size="sm" className="w-full" aria-label="Brief source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                {versions.map((v) => (
                  <SelectItem key={v.version} value={String(v.version)}>
                    v{v.version}
                    {v.label ? ` · ${v.label}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => copyText(text, "Brief copied")}>
            <Copy /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={save}>
            <Download /> Download
          </Button>
        </>
      }
    >
      <ScrollArea className="h-[calc(100dvh-16rem)] rounded-lg border [&_[data-slot=scroll-area-viewport]>div]:block!">
        <pre
          data-testid="brief"
          className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere"
        >
          {text}
        </pre>
      </ScrollArea>
    </SectionPage>
  );
}
