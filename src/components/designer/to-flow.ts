/** Maps the design document to React Flow nodes and edges. Pure. */
import type { Edge, Node } from "@xyflow/react";

import { EDGE_KIND_META, NODE_KIND_META } from "@/lib/design/catalog";
import { nodeSize } from "@/lib/design/geometry";
import type { LevelView } from "@/lib/design/levels";
import { designIdOf, type PerspectiveView } from "@/lib/design/perspectives";
import type { DesignDocument, DesignEdge, DesignNode } from "@/lib/design/schema";
import type { ComponentStatus } from "@/lib/design/status";

export type FlowNodeData = {
  node: DesignNode;
  status: { status: ComponentStatus; note: string } | null;
  /** Levels view: a container shown as a summary card, with its direct child count. */
  collapsed?: number;
  /** Levels view: a read-only node outside the focus, with its path. */
  context?: string;
  /** API / Layers perspective: where a card lives, or a band's or frame's own caption. */
  label?: string;
};
export type FlowNode = Node<FlowNodeData>;
export type FlowEdgeData = {
  edge: DesignEdge;
  caption: string;
  /** Levels view: how many design edges this derived edge stands for (absent for real edges). */
  lifted?: number;
  /** Layers perspective: the dependency breaks the layer rules. */
  violation?: boolean;
  /** Focus mode: whether this edge is dimmed. */
  dimmed?: boolean;
  /** Focus mode: whether this edge is highlighted. */
  highlighted?: boolean;
};
export type FlowEdge = Edge<FlowEdgeData>;

export interface FlowOptions {
  collapseDatastores?: boolean;
}

/**
 * Stacking order (the canvas runs React Flow with zIndexMode="manual"): containers by nesting
 * depth, then edges, then edge labels, then cards. Lines and pills pass behind cards instead of
 * across them, yet stay above the container backgrounds they cross.
 */
export const Z = { edge: 10, label: 15, card: 20, selectedCard: 21 } as const;

const cardZ = (selected: boolean) => (selected ? Z.selectedCard : Z.card);

/** Nesting depth of each node in a parents-first list (top level = 0). */
function depths(nodes: { id: string; parentId: string | null }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of nodes) out.set(n.id, n.parentId ? (out.get(n.parentId) ?? 0) + 1 : 0);
  return out;
}

export function toFlowNodes(
  doc: DesignDocument,
  statuses: Record<string, { status: ComponentStatus; note: string }>,
  selected: ReadonlySet<string>,
  view?: LevelView,
  options?: FlowOptions,
): FlowNode[] {
  if (view) return levelNodes(view, statuses, selected);

  const collapseDatastores = options?.collapseDatastores ?? false;
  const datastoreMap = new Map<string, number>();
  if (collapseDatastores) {
    for (const n of doc.nodes) {
      if (n.kind === "datastore") datastoreMap.set(n.id, 0);
    }
    for (const n of doc.nodes) {
      if (n.parentId && datastoreMap.has(n.parentId)) {
        datastoreMap.set(n.parentId, (datastoreMap.get(n.parentId) ?? 0) + 1);
      }
    }
  }

  // doc.nodes is stored parents-first, which React Flow requires.
  const depth = depths(doc.nodes);
  const result: FlowNode[] = [];

  for (const n of doc.nodes) {
    // If entity inside a collapsed datastore, omit it from the canvas
    if (collapseDatastores && n.parentId && (datastoreMap.get(n.parentId) ?? 0) > 0) {
      continue;
    }
    const status = statuses[n.id] ?? null;
    const isCollapsedDatastore = collapseDatastores && (datastoreMap.get(n.id) ?? 0) > 0;

    if (isCollapsedDatastore) {
      result.push({
        id: n.id,
        type: "summary",
        position: n.position,
        data: { node: n, status, collapsed: datastoreMap.get(n.id) },
        selected: selected.has(n.id),
        zIndex: cardZ(selected.has(n.id)),
      });
      continue;
    }

    const container = NODE_KIND_META[n.kind].container;
    result.push({
      id: n.id,
      type: n.kind,
      position: n.position,
      ...(n.parentId ? { parentId: n.parentId } : {}),
      data: { node: n, status },
      ...(container ? { width: nodeSize(n).width, height: nodeSize(n).height } : {}),
      selected: selected.has(n.id),
      zIndex: container ? depth.get(n.id)! : cardZ(selected.has(n.id)),
    });
  }

  return result;
}

function levelNodes(
  view: LevelView,
  statuses: Record<string, { status: ComponentStatus; note: string }>,
  selected: ReadonlySet<string>,
): FlowNode[] {
  const depth = depths(view.inside.map((i) => ({ id: i.node.id, parentId: i.parentId })));
  const inside = view.inside.map(({ node: n, parentId, position, collapsed }): FlowNode => {
    const status = statuses[n.id] ?? null;
    if (collapsed !== null) {
      return {
        id: n.id,
        type: "summary",
        position,
        data: { node: n, status, collapsed },
        selected: selected.has(n.id),
        zIndex: cardZ(selected.has(n.id)),
      };
    }
    const container = NODE_KIND_META[n.kind].container;
    return {
      id: n.id,
      type: n.kind,
      position,
      ...(parentId ? { parentId } : {}),
      // A focused module sits at a made-up position: there is nothing to drag it to.
      ...(view.focus?.kind === "module" && n.id === view.focus.id ? { draggable: false } : {}),
      data: { node: n, status },
      ...(container ? { width: nodeSize(n).width, height: nodeSize(n).height } : {}),
      selected: selected.has(n.id),
      zIndex: container ? depth.get(n.id)! : cardZ(selected.has(n.id)),
    };
  });
  const context = view.context.map(({ node: n, path, position }): FlowNode => ({
    id: n.id,
    type: "summary",
    position,
    data: { node: n, status: statuses[n.id] ?? null, context: path },
    selected: selected.has(n.id),
    draggable: false,
    deletable: false,
    zIndex: cardZ(selected.has(n.id)),
  }));
  return [...inside, ...context];
}

const PERSPECTIVE_TYPE = {
  card: "perspectiveCard",
  api: "apiOperations",
  frame: "serviceFrame",
  band: "layerBand",
} as const;

/** API / Layers perspective nodes: laid out for you, so nothing drags, connects or deletes. */
export function perspectiveNodes(
  view: PerspectiveView,
  statuses: Record<string, { status: ComponentStatus; note: string }>,
  selected: ReadonlySet<string>,
): FlowNode[] {
  return view.nodes.map((p): FlowNode => {
    const isSelected = selected.has(designIdOf(p.id));
    return {
      id: p.id,
      type: PERSPECTIVE_TYPE[p.role],
      position: p.position,
      ...(p.parentId ? { parentId: p.parentId } : {}),
      data: {
        node: p.node,
        status: statuses[p.node.id] ?? null,
        ...(p.label !== undefined ? { label: p.label } : {}),
        ...(p.count !== undefined ? { collapsed: p.count } : {}),
      },
      ...(p.size ? { width: p.size.width, height: p.size.height } : {}),
      selected: isSelected,
      draggable: false,
      deletable: false,
      connectable: false,
      zIndex: p.role === "frame" ? 0 : p.role === "band" ? 1 : cardZ(isSelected),
    };
  });
}

const CARDINALITY = { "one-to-one": "1—1", "one-to-many": "1—N", "many-to-many": "N—N" } as const;

/** The pill text shown on an edge: its kind plus the detail that matters for that kind. */
export function edgeCaption(edge: DesignEdge, nodes: ReadonlyMap<string, DesignNode>): string {
  const base = edge.label || EDGE_KIND_META[edge.kind].label;
  switch (edge.kind) {
    case "calls":
      return `${base} · ${edge.data.protocol}`;
    case "accesses":
      return `${base} · ${edge.data.mode}`;
    case "relation":
      return CARDINALITY[edge.data.cardinality];
    case "publishes":
    case "subscribes": {
      const queue = nodes.get(edge.target);
      const channel =
        queue?.kind === "queue"
          ? queue.data.channels.find((c) => c.id === edge.data.channelId)
          : null;
      return channel ? `${base} · ${channel.name}` : base;
    }
    case "produces":
      return edge.data.rate ? `${base} · ${edge.data.rate}` : base;
    case "consumes":
      return edge.data.amount ? `${base} · ${edge.data.amount}` : base;
    case "triggers":
      return edge.data.event ? `${base} · ${edge.data.event}` : base;
    case "modifies":
      return edge.data.effect ? `${base} · ${edge.data.effect}` : base;
    default:
      return base;
  }
}

export function toFlowEdges(
  doc: DesignDocument,
  selected: ReadonlySet<string>,
  view?: LevelView,
  options?: FlowOptions,
): FlowEdge[] {
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  if (view) {
    return view.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "design",
      data: {
        edge: e.edge,
        caption: e.lifted ? EDGE_KIND_META[e.kind].label : edgeCaption(e.edge, nodes),
        ...(e.lifted ? { lifted: e.lifted } : {}),
      },
      animated: e.kind === "publishes" || e.kind === "subscribes",
      selected: !e.lifted && selected.has(e.id),
      ...(e.lifted ? { selectable: false, deletable: false } : {}),
      zIndex: Z.edge,
    }));
  }

  const collapseDatastores = options?.collapseDatastores ?? false;
  if (!collapseDatastores) {
    return doc.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "design",
      data: { edge: e, caption: edgeCaption(e, nodes) },
      animated: e.kind === "publishes" || e.kind === "subscribes",
      selected: selected.has(e.id),
      zIndex: Z.edge,
    }));
  }

  // Map entity -> datastore id
  const datastoreIds = new Set(doc.nodes.filter((n) => n.kind === "datastore").map((n) => n.id));
  const entityToDatastore = new Map<string, string>();
  for (const n of doc.nodes) {
    if (n.parentId && datastoreIds.has(n.parentId)) {
      entityToDatastore.set(n.id, n.parentId);
    }
  }

  const lifted = new Map<
    string,
    { id: string; source: string; target: string; edge: DesignEdge; count: number }
  >();
  const directEdges: FlowEdge[] = [];
  const realKeys = new Set<string>();

  for (const e of doc.edges) {
    const s = entityToDatastore.get(e.source) ?? e.source;
    const t = entityToDatastore.get(e.target) ?? e.target;
    if (s === t) continue; // internal edge between entities of same datastore

    if (s === e.source && t === e.target) {
      realKeys.add(`${e.kind}:${s}:${t}`);
      directEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "design",
        data: { edge: e, caption: edgeCaption(e, nodes) },
        animated: e.kind === "publishes" || e.kind === "subscribes",
        selected: selected.has(e.id),
        zIndex: Z.edge,
      });
    } else {
      const key = `${e.kind}:${s}:${t}`;
      const existing = lifted.get(key);
      if (existing) {
        existing.count++;
      } else {
        lifted.set(key, { id: `lift:${key}`, source: s, target: t, edge: e, count: 1 });
      }
    }
  }

  const liftedFlowEdges: FlowEdge[] = [];
  for (const [key, item] of lifted) {
    if (!realKeys.has(key)) {
      liftedFlowEdges.push({
        id: item.id,
        source: item.source,
        target: item.target,
        type: "design",
        data: {
          edge: item.edge,
          caption:
            item.count > 1 ? EDGE_KIND_META[item.edge.kind].label : edgeCaption(item.edge, nodes),
          lifted: item.count,
        },
        animated: item.edge.kind === "publishes" || item.edge.kind === "subscribes",
        selected: false,
        selectable: false,
        deletable: false,
        zIndex: Z.edge,
      });
    }
  }

  return [...directEdges, ...liftedFlowEdges];
}

export function perspectiveEdges(
  doc: DesignDocument,
  view: PerspectiveView,
  selected: ReadonlySet<string>,
): FlowEdge[] {
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  return view.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "design",
    data: {
      edge: e.edge,
      caption: e.violation
        ? "breaks layers"
        : e.lifted
          ? EDGE_KIND_META[e.kind].label
          : edgeCaption(e.edge, nodes),
      ...(e.lifted ? { lifted: e.lifted } : {}),
      ...(e.violation ? { violation: true } : {}),
    },
    selected: !e.lifted && selected.has(e.id),
    deletable: false,
    ...(e.lifted ? { selectable: false } : {}),
    zIndex: Z.edge,
  }));
}

/** Keeps React Flow's measured sizes when nodes are rebuilt, so they don't flash while re-measuring. */
export function keepMeasured(next: FlowNode[], previous: FlowNode[]): FlowNode[] {
  const byId = new Map(previous.map((n) => [n.id, n]));
  return next.map((n) => {
    const old = byId.get(n.id);
    // A node that changed type (a container collapsing to a summary card) must be re-measured.
    return old?.measured && old.type === n.type ? { ...n, measured: old.measured } : n;
  });
}
