"use client";

import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Gamepad2,
  Globe,
  Layers,
  Network,
  Plus,
  Sparkles,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createProjectAction } from "@/app/actions/projects";
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
import { cn } from "@/lib/utils";

type TemplateType = "fullstack" | "microservices" | "example" | "blank" | "game" | "game-example";

interface TemplateOption {
  id: TemplateType;
  title: string;
  badge: string;
  summary: string;
  icon: typeof Globe;
  blocks: string[];
}

const TEMPLATES: TemplateOption[] = [
  {
    id: "fullstack",
    title: "Fullstack 3-Tier App",
    badge: "Recommended",
    summary:
      "Clean directional flow: Client → Next.js Web Storefront → REST API Backend → PostgreSQL.",
    icon: Globe,
    blocks: ["User Actor", "Next.js Web UI", "Fastify REST API", "PostgreSQL 18"],
  },
  {
    id: "microservices",
    title: "Event-Driven Microservices",
    badge: "Distributed",
    summary: "Decoupled architecture: API Gateway → Core Service → Kafka Event Bus → Async Worker.",
    icon: Network,
    blocks: [
      "API Gateway",
      "Core Business Service",
      "Kafka Bus",
      "Notification Worker",
      "Order Database",
    ],
  },
  {
    id: "example",
    title: "Team Tasks Reference",
    badge: "Complete Example",
    summary:
      "Comprehensive Clean Architecture with domain layers, REST operations, auth, and worker.",
    icon: Layers,
    blocks: ["Client", "Web UI", "Clean API Layers", "Redis Queue", "Worker", "PostgreSQL"],
  },
  {
    id: "blank",
    title: "Blank Canvas",
    badge: "Scratch",
    summary: "Start from an empty board and craft your architecture block by block manually.",
    icon: Boxes,
    blocks: ["Empty Canvas"],
  },
  {
    id: "game",
    title: "Blank Game Design",
    badge: "Game Mode",
    summary: "Dedicated game design mode for gameplay loops, characters, systems, and milestones.",
    icon: Gamepad2,
    blocks: ["Game Loop", "Systems", "Milestones"],
  },
  {
    id: "game-example",
    title: "Ashen Realms (Game)",
    badge: "Game Example",
    summary:
      "Complete Action RPG game design reference with combat mechanics, progression trees, and milestones.",
    icon: Sparkles,
    blocks: ["Core Mechanics", "Progression System", "Combat Loop", "Milestones"],
  },
];

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<TemplateType>("fullstack");
  const [pending, startTransition] = useTransition();

  const currentTemplate = TEMPLATES.find((t) => t.id === template) ?? TEMPLATES[0];

  function reset() {
    setStep(1);
    setName("");
    setDescription("");
    setTemplate("fullstack");
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a project name");
      setStep(1);
      return;
    }
    startTransition(async () => {
      const result = await createProjectAction({ name, description, template });
      // On success the action redirects, so a result means the create failed.
      if (result && !result.ok) toast.error(result.error.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 shadow-xs">
          <Plus className="size-4" /> New project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl sm:max-w-xl">
        {/* Wizard Steps Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {step}
            </span>
            <span className="text-sm font-semibold">
              {step === 1 && "Step 1: Project Identity & Goals"}
              {step === 2 && "Step 2: Choose Architecture Pattern"}
              {step === 3 && "Step 3: Big Picture Preview & Launch"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <span className={cn("size-2 rounded-full", step >= 1 ? "bg-primary" : "bg-muted")} />
            <span className={cn("size-2 rounded-full", step >= 2 ? "bg-primary" : "bg-muted")} />
            <span className={cn("size-2 rounded-full", step === 3 ? "bg-primary" : "bg-muted")} />
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-4 pt-1">
          {/* STEP 1: Name & Goals */}
          {step === 1 && (
            <div className="grid gap-4">
              <DialogHeader className="text-left">
                <DialogTitle>Name & Goals</DialogTitle>
                <DialogDescription>
                  Define the core identity of this software system. Progressive disclosure starts
                  with clear goals.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-1.5">
                <Label htmlFor="project-name">
                  Project Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="project-name"
                  placeholder="e.g. Acme Marketplace, Analytics Platform..."
                  value={name}
                  maxLength={120}
                  required
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

          <div className="grid gap-1.5">
            <Label htmlFor="project-description">Primary Goals / Overview</Label>
            <Textarea
              id="project-description"
              placeholder="What business problem does this architecture solve? What are the key non-goals?"
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* STEP 2: Architecture Archetype */}
      {step === 2 && (
        <div className="grid gap-3">
          <DialogHeader className="text-left">
            <DialogTitle>Architecture Archetype</DialogTitle>
            <DialogDescription>
              Select a starter pattern. Instead of a blank hairball, start with 3–5 high-level
              blocks following progressive disclosure.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
            {TEMPLATES.map((item) => {
              const Icon = item.icon;
              const isSelected = template === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTemplate(item.id)}
                  className={cn(
                    "group flex flex-col text-left rounded-xl border p-3 transition-all cursor-pointer relative",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary"
                      : "border-border/80 hover:border-border hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Icon
                        className={cn(
                          "size-4",
                          isSelected ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="text-xs font-semibold">{item.title}</span>
                    </div>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                    {item.summary}
                  </p>
                  {isSelected && (
                    <CheckCircle2 className="size-4 text-primary absolute top-2 right-2 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 3: Big Picture Preview & Confirm */}
      {step === 3 && (
        <div className="grid gap-4">
          <DialogHeader className="text-left">
            <DialogTitle>Big Picture Preview</DialogTitle>
            <DialogDescription>
              Your canvas will launch with this high-level map (C4 Level 1). All sub-components
              and entities are cleanly folded inside.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {currentTemplate.title}
                </span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {currentTemplate.blocks.length} macro blocks
              </span>
            </div>

            {/* Macro Blocks Visual Preview */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {currentTemplate.blocks.map((block, idx) => (
                <div
                  key={block}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium shadow-2xs"
                >
                  <span className="size-2 rounded-full bg-primary/70" />
                  <span>{block}</span>
                  {idx < currentTemplate.blocks.length - 1 && (
                    <ArrowRight className="size-3 text-muted-foreground ml-1" />
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">
                💡 Progressive Disclosure Guaranteed:
              </p>
              <p>• No visual overload on opening: Only high-level containers are visible.</p>
              <p>• Double-click any service to zoom inside and explore sub-modules & layers.</p>
            </div>
          </div>
        </div>
      )}

      {/* Wizard Footer Navigation */}
      <DialogFooter className="flex items-center justify-between sm:justify-between pt-2 border-t">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStep((s) => (s - 1) as 1 | 2)}
            disabled={pending}
            className="gap-1"
          >
            <ArrowLeft className="size-3.5" /> Back
          </Button>
        ) : (
          <div />
        )}

        {step < 3 ? (
          <Button
            type="button"
            size="sm"
            disabled={step === 1 && !name.trim()}
            onClick={() => {
              if (step === 1 && !name.trim()) return;
              setStep((s) => (s + 1) as 2 | 3);
            }}
            className="gap-1"
          >
            Next <ArrowRight className="size-3.5" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="sm"
            disabled={pending || !name.trim()}
            className="gap-1.5"
          >
            {pending ? "Generating architecture…" : "Create & Launch Canvas"}
            <Sparkles className="size-3.5" />
          </Button>
        )}
      </DialogFooter>
    </form>
      </DialogContent >
    </Dialog >
  );
}
