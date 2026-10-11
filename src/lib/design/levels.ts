/**
 * Levels view: the design seen one level at a time (project → service → layer → module), in the
 * spirit of C4's zoom levels. Pure; the canvas maps the result to React Flow.
 *
 * - Project (focus null): top-level nodes, containers collapsed to summary cards.
 * - A container (service, layer, datastore): everything nested in it, re-rooted at the origin.
 * - A module: the module itself; its endpoints come from `endpointsOf`.
 *
 * Nodes outside the focus that connect to it are shown as read-only context nodes. An edge whose
 * endpoint is hidden is lifted to the endpoint's visible representative and deduplicated.
 */
import { NODE_KIND_META } from "@/lib/design/catalog";
import { absolutePosition, nodeSize, type Point } from "@/lib/design/geometry";
import { indexDesign } from "@/lib/design/graph";
import type {
  DesignDocument,
  DesignEdge,
  DesignNode,
  EdgeKind,
  NodeOfKind,
  Operation,
} from "@/lib/design/schema";

export interface InsideNode {
  node: DesignNode;
  /** Parent in the view: null for the focus's direct children (and top-level nodes). */
  parentId: string | null;
  /** Relative to the parent in the view, or to the focus's origin. */
  position: Point;
  /** Set for containers shown as summary cards: how many nodes sit directly inside. */
  collapsed: number | null;
}

export interface ContextNode {
  node: DesignNode;
  /** "API › Infrastructure", so a lifted node says where it lives. */
  path: string;
  position: Point;
}

export interface LevelEdge {
  /** The design edge id, or `lift:<kind>:<source>:<target>` for a lifted edge. */
  id: string;
  kind: EdgeKind;
  source: string;
  target: string;
  /** The design edge (for a lifted edge, the first one it stands for). */
  edge: DesignEdge;
  /** How many design edges a lifted edge stands for; 0 for a real edge. */
  lifted: number;
}

export interface LevelView {
  focus: DesignNode | null;
  /** Absolute position of the view's origin: inside positions are relative to it. */
  origin: Point;
  /** Parents first, as React Flow requires. */
  inside: InsideNode[];
  context: ContextNode[];
  edges: LevelEdge[];
}

const CONTEXT_GAP = { x: 160, y: 120 };

/** Nodes you can drill into: containers, and modules (whose endpoints get their own level). */
export function isFocusable(node: DesignNode): boolean {
  return NODE_KIND_META[node.kind].container || node.kind === "module";
}

export function levelView(doc: DesignDocument, focusId: string | null): LevelView {
  const index = indexDesign(doc);
  const candidate = focusId ? index.node(focusId) : undefined;
  const focus = candidate && isFocusable(candidate) ? candidate : null;

  let inside: InsideNode[];
  if (!focus) {
    inside = index.doc.nodes
      .filter((n) => n.parentId === null)
      .map((n) => ({
        node: n,
        parentId: null,
        position: n.position,
        collapsed: NODE_KIND_META[n.kind].container ? index.children(n.id).length : null,
      }));
  } else if (focus.kind === "module") {
    const children = doc.nodes.filter((n) => n.parentId === focus.id);
    inside = [
      { node: focus, parentId: null, position: { x: 0, y: 0 }, collapsed: null },
      ...children.map((n) => ({
        node: n,
        parentId: null,
        position: n.position,
        collapsed: null,
      })),
    ];
  } else {
    const ids = new Set(index.descendants(focus.id).map((n) => n.id));
    // doc.nodes is parents-first; keep that order.
    inside = doc.nodes
      .filter((n) => ids.has(n.id))
      .map((n) => ({
        node: n,
        parentId: n.parentId === focus.id ? null : n.parentId,
        position: n.position,
        collapsed: null,
      }));
  }
  const insideIds = new Set(inside.map((i) => i.node.id));

  // An outside node is represented by its highest ancestor that sits beside the focus or one of
  // its ancestors: another service, a sibling layer… A module's neighbours are shown as they are.
  const anchors = new Set<string | null>([
    null,
    ...(focus ? [focus.id, ...index.ancestors(focus.id).map((a) => a.id)] : []),
  ]);
  const representative = (id: string): string | null => {
    if (insideIds.has(id) || focus?.kind === "module") return id;
    let n = index.node(id);
    while (n && !anchors.has(n.parentId)) n = n.parentId ? index.node(n.parentId) : undefined;
    return n?.id ?? null;
  };

  const edges: LevelEdge[] = [];
  const lifted = new Map<string, LevelEdge>();
  const realKeys = new Set<string>();
  const contextIds: string[] = [];
  for (const e of doc.edges) {
    const source = representative(e.source);
    const target = representative(e.target);
    if (!source || !target) continue;
    if (!insideIds.has(source) && !insideIds.has(target)) continue;
    // A container focus frames the view; edges attached to it have nowhere to go.
    if (focus && !insideIds.has(focus.id) && (source === focus.id || target === focus.id)) continue;
    if (source === target && (source !== e.source || target !== e.target)) continue;
    for (const id of [source, target]) {
      if (!insideIds.has(id) && !contextIds.includes(id)) contextIds.push(id);
    }
    const key = `${e.kind}:${source}:${target}`;
    if (source === e.source && target === e.target) {
      realKeys.add(key);
      edges.push({ id: e.id, kind: e.kind, source, target, edge: e, lifted: 0 });
      continue;
    }
    const existing = lifted.get(key);
    if (existing) existing.lifted++;
    else lifted.set(key, { id: `lift:${key}`, kind: e.kind, source, target, edge: e, lifted: 1 });
  }
  for (const [key, edge] of lifted) if (!realKeys.has(key)) edges.push(edge);

  // Context nodes stack in a column to the right of the focus.
  const width = focus ? nodeSize(focus).width : 0;
  const context = contextIds.map((id, i) => ({
    node: index.node(id)!,
    path: index.path(id),
    position: { x: width + CONTEXT_GAP.x, y: i * CONTEXT_GAP.y },
  }));
  if (focus?.kind === "module" && context.length > 1) {
    // Centre the module (and its notes) against its neighbours.
    const dy = ((context.length - 1) * CONTEXT_GAP.y) / 2;
    for (const entry of inside) {
      entry.position = { x: entry.position.x, y: entry.position.y + dy };
    }
  }

  return {
    focus,
    origin: focus ? absolutePosition(doc, focus.id) : { x: 0, y: 0 },
    inside,
    context,
    edges,
  };
}

/** The focus that shows a node in the levels view: its top-level ancestor (null if it is top level). */
export function levelOf(doc: DesignDocument, nodeId: string): string | null {
  const index = indexDesign(doc);
  const ancestors = index.ancestors(nodeId);
  return ancestors.at(-1)?.id ?? null;
}

/** The trail from the project down to the focus. */
export function breadcrumb(doc: DesignDocument, focusId: string | null): DesignNode[] {
  if (!focusId) return [];
  const index = indexDesign(doc);
  const focus = index.node(focusId);
  return focus ? [...index.ancestors(focusId).reverse(), focus] : [];
}

export interface EndpointGroup {
  edgeId: string;
  api: NodeOfKind<"api">;
  /** The edge's operations, or every operation of the API when the edge names none. */
  operations: Operation[];
  /** True when the edge names no operations (the whole API). */
  whole: boolean;
}

/** What a module (or service) implements through `exposes` and uses through `calls`. */
export function endpointsOf(
  doc: DesignDocument,
  nodeId: string,
): { implements: EndpointGroup[]; calls: EndpointGroup[] } {
  const index = indexDesign(doc);
  const group = (e: DesignEdge & { data: { operations: string[] } }): EndpointGroup | null => {
    const api = index.node(e.target);
    if (api?.kind !== "api") return null;
    const whole = e.data.operations.length === 0;
    return {
      edgeId: e.id,
      api,
      operations: whole
        ? api.data.operations
        : api.data.operations.filter((o) => e.data.operations.includes(o.id)),
      whole,
    };
  };
  return {
    implements: index
      .outgoing(nodeId, "exposes")
      .map(group)
      .filter((g) => g !== null),
    calls: index
      .outgoing(nodeId, "calls")
      .map(group)
      .filter((g) => g !== null),
  };
}
