/**
 * Generates Mermaid Architecture Diagrams (Flowchart) from a DesignDocument.
 * Pure and isomorphic.
 */
import { EDGE_KIND_META, NODE_KIND_META } from "@/lib/design/catalog";
import { dataModel, toMermaidEr } from "@/lib/design/datamodel";
import { indexDesign } from "@/lib/design/graph";
import type { DesignDocument, DesignEdge, DesignNode } from "@/lib/design/schema";

export interface MermaidOptions {
  direction?: "LR" | "TD";
  includeNotes?: boolean;
}

const safeId = (id: string) => id.replace(/[^A-Za-z0-9_]/g, "_");
const safeText = (text: string) => text.replace(/"/g, "'").trim();

function nodeShape(node: DesignNode): string {
  const id = safeId(node.id);
  const name = safeText(node.name);
  const kindLabel = NODE_KIND_META[node.kind].label;

  switch (node.kind) {
    case "actor":
      return `${id}(["👤 ${name}"])`;
    case "datastore":
      return `${id}[("🗄️ ${name} (${node.data.engine})")]`;
    case "queue":
      return `${id}{{"⚡ ${name} (${node.data.technology})"}}`;
    case "integration":
      return `${id}[\\"🔌 ${name} (${node.data.provider})\\/]`;
    case "api":
      return `${id}[["API: ${name} (${node.data.style})"]]`;
    case "note":
      return `${id}["📝 ${name}"]`;
    case "entity":
      return `${id}["${name} (Entity)"]`;
    case "module":
      return `${id}["${name}"]`;
    case "service":
      return `${id}["🌐 ${name} (${node.data.type})"]`;
    case "layer":
      return `${id}["${name} Layer"]`;
    default:
      return `${id}["${kindLabel}: ${name}"]`;
  }
}

function edgeArrow(kind: DesignEdge["kind"]): { left: string; right: string } {
  switch (kind) {
    case "exposes":
      return { left: "==", right: "==>" };
    case "depends_on":
    case "accesses":
      return { left: "-.", right: ".->" };
    case "relation":
      return { left: "--", right: "---" };
    default:
      return { left: "--", right: "-->" };
  }
}

function edgeCaption(edge: DesignEdge, nodes: Map<string, DesignNode>): string {
  if (edge.label) return safeText(edge.label);
  const base = EDGE_KIND_META[edge.kind].label;
  switch (edge.kind) {
    case "calls":
      return edge.data.protocol ? `${base} · ${edge.data.protocol}` : base;
    case "accesses":
      return edge.data.mode ? `${base} · ${edge.data.mode}` : base;
    case "relation":
      return edge.data.cardinality;
    case "publishes":
    case "subscribes": {
      const q = nodes.get(edge.target);
      const ch =
        q?.kind === "queue" ? q.data.channels.find((c) => c.id === edge.data.channelId) : null;
      return ch ? `${base} · ${ch.name}` : base;
    }
    default:
      return base;
  }
}

export function toMermaidArchitecture(doc: DesignDocument, options?: MermaidOptions): string {
  const dir = options?.direction ?? "LR";
  const includeNotes = options?.includeNotes ?? false;
  const nodes = doc.nodes.filter((n) => includeNotes || n.kind !== "note");
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, DesignNode[]>();

  for (const n of nodes) {
    if (n.parentId && nodeMap.has(n.parentId)) {
      const list = childrenMap.get(n.parentId) ?? [];
      list.push(n);
      childrenMap.set(n.parentId, list);
    }
  }

  const lines: string[] = [`flowchart ${dir}`];

  // Helper to render containers recursively
  function renderNode(n: DesignNode, indent = "  ") {
    const children = childrenMap.get(n.id) ?? [];
    const isContainer = NODE_KIND_META[n.kind].container && children.length > 0;
    const sid = safeId(n.id);
    const sname = safeText(n.name);

    if (isContainer) {
      lines.push(`${indent}subgraph ${sid} ["${sname} (${NODE_KIND_META[n.kind].label})"]`);
      for (const child of children) {
        renderNode(child, `${indent}  `);
      }
      lines.push(`${indent}end`);
    } else {
      lines.push(`${indent}${nodeShape(n)}`);
    }
  }

  // Top-level nodes (parentId is null or parent not in map)
  const topLevel = nodes.filter((n) => !n.parentId || !nodeMap.has(n.parentId));
  for (const n of topLevel) {
    renderNode(n, "  ");
  }

  lines.push("");

  // Edges
  for (const e of doc.edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    const arrow = edgeArrow(e.kind);
    const caption = edgeCaption(e, nodeMap);
    const fromId = safeId(e.source);
    const toId = safeId(e.target);
    lines.push(`  ${fromId} ${arrow.left}|${caption}|${arrow.right} ${toId}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Generates a Mermaid Sequence Diagram representing interactive runtime flows.
 * Uses topological progression to order interactions sequentially.
 */
export function toMermaidSequence(doc: DesignDocument, tag?: string | null): string {
  const relevantEdges = tag
    ? doc.edges.filter((e) => {
        const src = doc.nodes.find((n) => n.id === e.source);
        const tgt = doc.nodes.find((n) => n.id === e.target);
        return src?.tags.includes(tag) || tgt?.tags.includes(tag);
      })
    : doc.edges.filter(
        (e) => e.kind === "calls" || e.kind === "accesses" || e.kind === "publishes",
      );

  const participantIds = new Set<string>();
  for (const e of relevantEdges) {
    participantIds.add(e.source);
    participantIds.add(e.target);
  }

  const nodes = doc.nodes.filter((n) => participantIds.has(n.id) && n.kind !== "note");
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const lines: string[] = ["sequenceDiagram", "  autonumber"];

  for (const n of nodes) {
    const sid = safeId(n.id);
    const sname = safeText(n.name);
    let icon = "🌐";
    if (n.kind === "actor") icon = "👤";
    else if (n.kind === "datastore") icon = "🗄️";
    else if (n.kind === "api") icon = "🔌";
    else if (n.kind === "queue") icon = "⚡";
    lines.push(`  participant ${sid} as ${icon} ${sname}`);
  }

  lines.push("");

  for (const e of relevantEdges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    const fromId = safeId(e.source);
    const toId = safeId(e.target);
    const caption = safeText(edgeCaption(e, nodeMap));
    const isAsync =
      e.kind === "publishes" ||
      (e.kind === "calls" && (e.data.protocol === "websocket" || e.data.protocol === "other"));
    const arrow = isAsync ? "-->>" : "->>";
    lines.push(`  ${fromId}${arrow}${toId}: ${caption}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Diagram-as-code: a self-contained `.mmd` file an AI agent can regenerate to
 * draw the diagram without drag-and-drop. The `%%` header pins the source
 * project and the regeneration contract; the body is one of the generators
 * above, byte-identical to what they produce alone.
 */
export type DiagramCodeType = "architecture" | "sequence" | "er";

export interface DiagramCodeOptions {
  type?: DiagramCodeType;
  direction?: "LR" | "TD";
  includeNotes?: boolean;
  tag?: string | null;
}

export function toDiagramCode(
  project: { name: string; slug: string },
  document: DesignDocument,
  options?: DiagramCodeOptions,
): string {
  const type = options?.type ?? "architecture";
  const header = [
    `%% ${project.name} — ${type} diagram as code`,
    `%% Generated by Project Designer from project \`${project.slug}\`. Deterministic: the same design always yields the same code.`,
    `%% AI: to redraw this diagram, regenerate this whole file (subgraph per container, one line per node, one line per edge) and keep every node id stable. Use get_design_schema for what each node/edge kind means.`,
  ].join("\n");
  let body: string;
  if (type === "sequence") {
    body = toMermaidSequence(document, options?.tag ?? null);
  } else if (type === "er") {
    body = toMermaidEr(dataModel(indexDesign(document)));
  } else {
    body = toMermaidArchitecture(document, {
      direction: options?.direction ?? "LR",
      includeNotes: options?.includeNotes ?? false,
    });
  }
  return `${header}\n${body}`;
}
