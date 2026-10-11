"use client";

import { Rocket } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { publishVersionAction } from "@/app/actions/versions";
import { useProjectMeta, useSaveNow } from "@/components/designer/store-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Publishes the draft as an immutable version agents can pin to. */
export function PublishDialog({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { slug } = useProjectMeta();
  const saveNow = useSaveNow();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      await saveNow(); // the version is cut from what the server has, so save pending edits first
      const result = await publishVersionAction(slug, { label, notes });
      if (result.ok) {
        toast.success(`Published v${result.version}`);
        setOpen(false);
        setLabel("");
        setNotes("");
      } else toast.error(result.error.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant} title="Publish a version">
          <Rocket className="size-3.5" /> <span className="hidden sm:inline">Publish</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Publish a version</DialogTitle>
            <DialogDescription>
              A version is an immutable snapshot of the design. Agents can build against it while
              you keep editing the draft.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="version-label">Label</Label>
            <Input
              id="version-label"
              value={label}
              maxLength={120}
              placeholder="e.g. MVP"
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="version-notes">Notes</Label>
            <Textarea
              id="version-notes"
              value={notes}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
