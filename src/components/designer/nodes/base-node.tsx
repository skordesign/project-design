"use client";

import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import {
  ChevronRight,
  Focus,
  GripVertical,
  KeyRound,
  ListChecks,
  ListOrdered,
  PackageOpen,
  Rows3,
  Ruler,
  Shapes,
  SlidersHorizontal,
  StickyNote,
  Tag,
  Target,
  type LucideIcon,
} from "lucide-react";

import { KIND_STYLE, NOTE_COLORS, STATUS_STYLE } from "@/components/designer/nodes/kind-style";
import { useDesigner, useDesignerStore } from "@/components/designer/store-provider";
import type { FlowNode } from "@/components/designer/to-flow";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NODE_KIND_META } from "@/lib/design/catalog";
import { cardMetrics, ENTITY_FIELD_ROWS, type CardMetric } from "@/lib/design/geometry";
import type { DesignNode } from "@/lib/design/schema";
import { isFocusable } from "@/lib/design/levels";
import { cn } from "@/lib/utils";
import { useCanvasUi } from "@/stores/canvas-ui-store";

const SIDES = [
  ["top", Position.Top],
  ["right", Position.Right],
  ["bottom", Position.Bottom],
  ["left", Position.Left],
] as const;

/**
 * All handles are "source" handles: with ConnectionMode.Loose any handle can start or end a
 * connection, and the direction is always drag-start → drop target.
 */
export function Handles({ kind }: { kind: DesignNode["kind"] }) {
  // Edges still need the handles to attach to; read-only just never reveals them.
  const readOnly = useDesigner((s) => s.readOnly);
  return SIDES.map(([id, position]) => (
    <Handle
      key={id}
      id={id}
      type="source"
      position={position}
      style={{ background: KIND_STYLE[kind].hex }}
      className={cn(
        "size-2.5! border-2! border-background! opacity-0 transition-opacity",
        !readOnly && "group-hover/node:opacity-100 group-data-[selected=true]/node:opacity-100",
      )}
    />
  ));
}

export const selectedRing = "ring-2 ring-primary/60 ring-offset-2 ring-offset-canvas";

function subtitleOf(n: DesignNode): string {
  switch (n.kind) {
    case "service":
      return [
        n.data.type,
        [n.data.language, n.data.framework].filter(Boolean).join("/"),
        n.data.port !== null && `:${n.data.port}`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "layer":
      return n.data.path;
    case "module":
      return (
        n.data.responsibilities[0] ??
        (n.data.exports.length > 0 ? `${n.data.exports.length} exports` : "")
      );
    case "datastore":
      return [n.data.engine, n.data.version].filter(Boolean).join(" ");
    case "api":
      return `${n.data.style} · ${n.data.operations.length} operations`;
    case "integration":
      return [n.data.provider, n.data.category].filter(Boolean).join(" · ");
    case "queue":
      return `${n.data.technology} · ${n.data.channels.length} channels`;
    case "actor":
      return n.data.type;
    case "loop":
      return n.data.duration;
    case "system":
      return [
        n.data.category,
        n.data.priority !== "mvp" && n.data.priority,
        n.data.authority !== "unspecified" && n.data.authority,
      ]
        .filter(Boolean)
        .join(" · ");
    case "mechanic":
      return n.data.trigger || n.data.states.join(" → ");
    case "resource":
      return [n.data.type, n.data.initial && `${n.data.initial}`, n.data.max && `max ${n.data.max}`]
        .filter(Boolean)
        .join(" · ");
    case "content":
      return `${n.data.type} · ${n.data.rows.length} rows`;
    default:
      return "";
  }
}

const METRIC_ICON: Record<CardMetric["key"], LucideIcon> = {
  responsibilities: ListChecks,
  env: KeyRound,
  rules: Ruler,
  exports: PackageOpen,
  goals: Target,
  patterns: Shapes,
  tags: Tag,
  parameters: SlidersHorizontal,
  steps: ListOrdered,
  rows: Rows3,
};

export const chip =
  "inline-flex h-[18px] shrink-0 items-center gap-1 rounded-md border bg-background px-1.5 text-[11px] leading-none font-medium tabular-nums";

export function StatusChip({ status }: { status: NonNullable<FlowNode["data"]["status"]> }) {
  const style = STATUS_STYLE[status.status];
  const Icon = style.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`Status: ${style.label}`}
          data-status={status.status}
          className={cn(chip, style.chip)}
        >
          <Icon className="size-3" aria-hidden />
          {style.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {style.label}
        {status.note ? ` · ${status.note}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

/** The footer row: metric chips (icon + count) and the agent-reported status. */
export function Chips({ data, className }: { data: FlowNode["data"]; className?: string }) {
  const { node, status } = data;
  const metrics = cardMetrics(node);
  if (metrics.length === 0 && !status) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {metrics.map(({ key, value, label }) => {
        const Icon = METRIC_ICON[key];
        return (
          <span
            key={key}
            className={cn(chip, "text-foreground/80")}
            title={
              label === "patterns"
                ? node.patterns.map((p) => p.name).join(", ")
                : label === "tags"
                  ? node.tags.join(", ")
                  : `${value} ${label}`
            }
          >
            <Icon className="size-3 text-muted-foreground" aria-hidden />
            {value}
          </span>
        );
      })}
      {status && <StatusChip status={status} />}
    </div>
  );
}

function IconTile({ kind, small }: { kind: DesignNode["kind"]; small?: boolean }) {
  const style = KIND_STYLE[kind];
  const Icon = style.icon;
  return (
    <span
      title={NODE_KIND_META[kind].label}
      className={cn(
        "grid shrink-0 place-items-center border bg-background shadow-xs",
        small ? "size-5 rounded-md" : "size-7 rounded-lg",
      )}
    >
      <Icon className={cn(small ? "size-3" : "size-3.5", style.text)} aria-hidden />
    </span>
  );
}

/** Icon tile, name and a muted subtitle (the kind's label when there's nothing more specific). */
export function Title({ node, subtitle: override }: { node: DesignNode; subtitle?: string }) {
  const subtitle = override || subtitleOf(node) || NODE_KIND_META[node.kind].label;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <IconTile kind={node.kind} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] leading-4 font-semibold" title={node.name}>
          {node.name}
        </div>
        <div className="truncate text-xs leading-4 text-muted-foreground" title={subtitle}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

/** Containers keep a one-line header: their children start close to the top edge. */
export function ContainerTitle({ node }: { node: DesignNode }) {
  const subtitle = subtitleOf(node) || NODE_KIND_META[node.kind].label;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
      <IconTile kind={node.kind} small />
      <span className="shrink-0 font-semibold" title={node.name}>
        {node.name}
      </span>
      <span className="truncate text-muted-foreground" title={subtitle}>
        {subtitle}
      </span>
    </div>
  );
}

/** Drills the levels view into a node. */
export function OpenButton({ node }: { node: DesignNode }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="nodrag shrink-0"
      aria-label={`Open ${node.name}`}
      title={`Open ${node.name}`}
      onClick={(e) => {
        e.stopPropagation();
        useCanvasUi.getState().setFocus(node.id);
      }}
    >
      <ChevronRight />
    </Button>
  );
}

/** Opens a container by itself in the levels view, with everything outside it hidden. */
export function StandaloneButton({ node }: { node: DesignNode }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="nodrag shrink-0"
      aria-label={`Open ${node.name} standalone`}
      title={`Open ${node.name} standalone`}
      onClick={(e) => {
        e.stopPropagation();
        useCanvasUi.getState().openStandalone(node.id);
      }}
    >
      <Focus />
    </Button>
  );
}

export const card =
  "group/node w-52 rounded-xl border bg-card p-2.5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] transition-shadow hover:shadow-md cursor-grab active:cursor-grabbing";

function Grip({ selected }: { selected?: boolean }) {
  return (
    <span
      title="Drag to move"
      className={cn(
        "-mr-1 shrink-0 self-start transition-opacity cursor-grab active:cursor-grabbing",
        selected
          ? "text-muted-foreground opacity-100"
          : "text-muted-foreground/30 opacity-40 group-hover/node:opacity-75",
      )}
    >
      <GripVertical className="size-3.5" aria-hidden />
    </span>
  );
}

/** Leaf node: module, api, integration, queue, actor. */
export function CardNode({ data, selected }: NodeProps<FlowNode>) {
  // In the levels view a module can be opened, unless it's the one already open.
  const openable = useCanvasUi((s) => s.viewMode === "levels" && s.focusId !== data.node.id);
  const lod = useCanvasUi((s) => s.lod);
  return (
    <div data-selected={selected} className={cn(card, selected && selectedRing)}>
      <Handles kind={data.node.kind} />
      <div className="flex items-start gap-1">
        <Title node={data.node} />
        {openable && isFocusable(data.node) && <OpenButton node={data.node} />}
        <Grip selected={selected} />
      </div>
      {lod !== "compact" && <Chips data={data} className="mt-2" />}
    </div>
  );
}

export function EntityNode({ data, selected }: NodeProps<FlowNode>) {
  const { node } = data;
  const lod = useCanvasUi((s) => s.lod);
  if (node.kind !== "entity") return null;
  const showFields =
    lod === "detailed"
      ? node.data.fields.slice(0, ENTITY_FIELD_ROWS)
      : lod === "medium"
        ? node.data.fields.filter((f) => f.primary).slice(0, 2)
        : [];
  return (
    <div data-selected={selected} className={cn(card, selected && selectedRing)}>
      <Handles kind={node.kind} />
      <div className="flex items-start gap-1">
        <Title node={node} />
        <Grip selected={selected} />
      </div>
      {showFields.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-lg border border-border/60 bg-muted/40 px-2 py-1.5 font-mono text-[11px]">
          {showFields.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-1 truncate">
              <span className="flex items-center gap-1 truncate">
                {f.primary && (
                  <span className="rounded bg-amber-500/15 px-1 py-0.2 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                    PK
                  </span>
                )}
                <span className="truncate font-medium">{f.name}</span>
                {!f.required && !f.primary && <span className="text-muted-foreground/60">?</span>}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {f.type}
                {f.list ? "[]" : ""}
              </span>
            </li>
          ))}
          {lod === "detailed" && node.data.fields.length > showFields.length && (
            <li className="pt-0.5 text-[10px] text-muted-foreground">
              +{node.data.fields.length - showFields.length} more fields
            </li>
          )}
        </ul>
      )}
      {lod !== "compact" && <Chips data={data} className="mt-2" />}
    </div>
  );
}

export function NoteNode({ data, selected }: NodeProps<FlowNode>) {
  const { node } = data;
  if (node.kind !== "note") return null;
  return (
    <div
      data-selected={selected}
      className={cn(
        "group/node h-28 w-52 overflow-hidden rounded-xl border border-black/5 p-3 text-xs shadow-[0_1px_3px_0_rgb(0_0_0/0.06)] cursor-grab active:cursor-grabbing",
        NOTE_COLORS[node.data.color],
        selected && selectedRing,
      )}
    >
      <Handles kind={node.kind} />
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <StickyNote className="size-3.5 shrink-0 opacity-60" aria-hidden />
        <span className="truncate">{node.name}</span>
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap opacity-90">{node.description}</p>
    </div>
  );
}

/** Resizable group node: service, layer, datastore. Children are separate nodes drawn above it. */
export function ContainerNode({ id, data, selected }: NodeProps<FlowNode>) {
  const store = useDesignerStore();
  const levels = useCanvasUi((s) => s.viewMode === "levels");
  const readOnly = useDesigner((s) => s.readOnly);
  const style = KIND_STYLE[data.node.kind];
  return (
    <div
      data-selected={selected}
      className={cn(
        "group/node h-full w-full rounded-xl border shadow-xs transition-shadow cursor-grab active:cursor-grabbing",
        style.line,
        style.tint,
        selected && selectedRing,
      )}
    >
      <NodeResizer
        isVisible={selected && !readOnly}
        minWidth={160}
        minHeight={80}
        onResizeEnd={(_, p) =>
          store
            .getState()
            .commitGeometry([
              { id, position: { x: p.x, y: p.y }, size: { width: p.width, height: p.height } },
            ])
        }
      />
      <Handles kind={data.node.kind} />
      <div className="flex items-center justify-between border-b border-inherit bg-background/85 px-3 py-1.5 backdrop-blur-xs rounded-t-xl">
        <ContainerTitle node={data.node} />
        <div className="flex items-center gap-1.5">
          <Chips data={data} className="justify-end" />
          <StandaloneButton node={data.node} />
          {levels && <OpenButton node={data.node} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Levels view card: a collapsed container ("4 inside") or a read-only context node outside the
 * focus, subtitled with its path. Both drill in on Open / double-click.
 */
export function SummaryNode({ data, selected }: NodeProps<FlowNode>) {
  const { node, collapsed, context } = data;
  const lod = useCanvasUi((s) => s.lod);
  return (
    <div
      data-selected={selected}
      data-context={context !== undefined || undefined}
      className={cn(
        card,
        context !== undefined && "border-dashed bg-card/70 shadow-none",
        selected && selectedRing,
      )}
    >
      <Handles kind={node.kind} />
      <div className="flex items-start gap-1">
        <Title node={node} subtitle={context} />
        {NODE_KIND_META[node.kind].container && <StandaloneButton node={node} />}
        {isFocusable(node) && <OpenButton node={node} />}
      </div>
      {collapsed !== undefined ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className={cn(chip, "text-foreground/80")}>{collapsed} inside</span>
          {lod !== "compact" && data.status && <StatusChip status={data.status} />}
        </div>
      ) : (
        lod !== "compact" && <Chips data={data} className="mt-2" />
      )}
    </div>
  );
}
