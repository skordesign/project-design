"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Field, SelectField, TextField } from "@/components/designer/inspector/fields";
import { useDesigner, useDesignerStore } from "@/components/designer/store-provider";
import { ScopePicker } from "@/components/sections/scope-picker";
import { SectionPage } from "@/components/sections/section-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { newItemId } from "@/lib/design/ids";
import { CONVENTION_CATEGORIES, ConventionSchema, type Convention } from "@/lib/design/schema";

const LEVELS = ["must", "should", "may"] as const;
const LEVEL_HELP = {
  must: "Hard constraints: agents must follow these.",
  should: "Defaults: follow unless there is a good reason not to.",
  may: "Allowed and encouraged, never required.",
};

function AddDialog({ onClose, onSave }: { onClose: () => void; onSave: (c: Convention) => void }) {
  const [draft, setDraft] = useState<Convention>({
    id: newItemId("cnv"),
    category: "other",
    level: "should",
    rule: "",
    scope: [],
  });
  const parsed = ConventionSchema.safeParse(draft);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed.success) onSave(parsed.data);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add convention</DialogTitle>
          </DialogHeader>
          <SelectField
            label="Level"
            value={draft.level}
            options={LEVELS}
            onChange={(level) => setDraft({ ...draft, level })}
          />
          <SelectField
            label="Category"
            value={draft.category}
            options={CONVENTION_CATEGORIES}
            onChange={(category) => setDraft({ ...draft, category })}
          />
          <TextField
            label="Rule"
            multiline
            value={draft.rule}
            onCommit={(rule) => setDraft({ ...draft, rule })}
          />
          <Field label="Applies to">
            <ScopePicker value={draft.scope} onChange={(scope) => setDraft({ ...draft, scope })} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!parsed.success}>
              Add convention
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConventionsList() {
  const store = useDesignerStore();
  const conventions = useDesigner((s) => s.document.conventions);
  const [adding, setAdding] = useState(false);
  const patch = (id: string, change: Partial<Convention>) =>
    store.getState().updateSections({
      conventions: conventions.map((c) => (c.id === id ? { ...c, ...change } : c)),
    });

  return (
    <SectionPage
      editable
      title="Conventions"
      description="Rules the generated code follows. MUST conventions are hard constraints for agents."
      actions={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add
        </Button>
      }
    >
      {conventions.length === 0 && (
        <p className="text-sm text-muted-foreground">No conventions yet.</p>
      )}
      {LEVELS.map((level) => {
        const items = conventions.filter((c) => c.level === level);
        if (items.length === 0) return null;
        return (
          <section key={level} className="grid gap-2">
            <h2 className="flex items-baseline gap-2 text-sm font-medium">
              {level.toUpperCase()}{" "}
              <span className="text-xs font-normal text-muted-foreground">{LEVEL_HELP[level]}</span>
            </h2>
            {items.map((c) => (
              <div key={c.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{c.category}</Badge>
                  <div className="ml-auto flex items-center gap-1">
                    <div className="w-28">
                      <SelectField
                        compact
                        label={`Level of ${c.rule}`}
                        value={c.level}
                        options={LEVELS}
                        onChange={(l) => patch(c.id, { level: l })}
                      />
                    </div>
                    <div className="w-36">
                      <SelectField
                        compact
                        label={`Category of ${c.rule}`}
                        value={c.category}
                        options={CONVENTION_CATEGORIES}
                        onChange={(category) => patch(c.id, { category })}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete convention ${c.rule}`}
                      onClick={() =>
                        store
                          .getState()
                          .updateSections({ conventions: conventions.filter((x) => x.id !== c.id) })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <TextField
                  compact
                  multiline
                  label={`Rule ${c.id}`}
                  value={c.rule}
                  validate={(t) =>
                    t.trim() === ""
                      ? "A rule can't be empty"
                      : t.length > 2000
                        ? "At most 2000 characters"
                        : null
                  }
                  onCommit={(rule) => patch(c.id, { rule })}
                />
                <ScopePicker value={c.scope} onChange={(scope) => patch(c.id, { scope })} />
              </div>
            ))}
          </section>
        );
      })}
      {adding && (
        <AddDialog
          onClose={() => setAdding(false)}
          onSave={(c) => {
            store.getState().updateSections({ conventions: [...conventions, c] });
            setAdding(false);
          }}
        />
      )}
    </SectionPage>
  );
}
