/**
 * Maps a source code file path (e.g. "apps/api/src/domain/task.ts") to its owning
 * architectural component (module, layer, or service), layer boundaries, and stack.
 * Pure and isomorphic.
 */
import type { DesignIndex } from "@/lib/design/graph";
import type { Convention, DesignNode, NodeKind, StackItem } from "@/lib/design/schema";

function briefNode(n: DesignNode) {
  return { id: n.id, name: n.name, kind: n.kind };
}

export interface ResolvedComponentMatch {
  matched: true;
  filePath: string;
  matchedPath: string;
  component: {
    id: string;
    kind: NodeKind;
    name: string;
    path: string | null;
    fullPath: string;
    responsibilities: string[];
    rules: string[];
    exports: string[];
  };
  service: { id: string; name: string; kind: NodeKind } | null;
  layer: { id: string; name: string; kind: NodeKind } | null;
  allowedLayerDependencies: Array<{ id: string; name: string; path: string | null }>;
  layerRules: string[];
  stack: StackItem[];
  conventions: Convention[];
  relations: {
    outgoing: Array<{
      edgeId: string;
      kind: string;
      label?: string | null;
      target: { id: string; name: string; kind: NodeKind };
    }>;
    incoming: Array<{
      edgeId: string;
      kind: string;
      label?: string | null;
      source: { id: string; name: string; kind: NodeKind };
    }>;
  };
}

export interface UnresolvedComponentMatch {
  matched: false;
  filePath: string;
  message: string;
  availableComponents: Array<{
    id: string;
    name: string;
    kind: NodeKind;
    path: string;
  }>;
}

export type ResolveResult = ResolvedComponentMatch | UnresolvedComponentMatch;

export function resolveFileToComponent(index: DesignIndex, filePath: string): ResolveResult {
  const cleanPath = filePath
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .trim();

  const candidates = index.doc.nodes.filter(
    (n): n is typeof n & { data: { path: string } } =>
      "path" in n.data &&
      typeof (n.data as { path?: unknown }).path === "string" &&
      Boolean((n.data as { path: string }).path.trim()),
  );

  let bestNode: (typeof index.doc.nodes)[0] | null = null;
  let bestScore = -1;
  let bestMatchedPath = "";

  for (const node of candidates) {
    const nodePath = node.data.path
      .replace(/\\/g, "/")
      .replace(/^\.?\//, "")
      .replace(/\/+$/, "")
      .trim();
    if (!nodePath) continue;

    const ancestorPaths = index
      .ancestors(node.id)
      .reverse()
      .map((a) =>
        "path" in a.data && typeof a.data.path === "string"
          ? a.data.path
              .replace(/\\/g, "/")
              .replace(/^\.?\//, "")
              .replace(/\/+$/, "")
              .trim()
          : "",
      )
      .filter(Boolean);

    const fullHierarchicalPath = [...ancestorPaths, nodePath].join("/");
    const testPaths = Array.from(new Set([nodePath, fullHierarchicalPath]));

    for (const p of testPaths) {
      let score = -1;
      if (cleanPath === p) {
        score = 1000 + p.length;
      } else if (cleanPath.startsWith(`${p}/`)) {
        score = 500 + p.length;
      } else if (cleanPath.endsWith(`/${p}`)) {
        score = 400 + p.length;
      } else if (cleanPath.includes(`/${p}/`)) {
        score = 300 + p.length;
      } else if (cleanPath.endsWith(p)) {
        score = 200 + p.length;
      } else if (cleanPath.includes(p)) {
        score = 100 + p.length;
      }

      if (score > 0) {
        if (node.kind === "module") score += 30;
        else if (node.kind === "layer") score += 20;
        else if (node.kind === "service") score += 10;

        if (score > bestScore) {
          bestScore = score;
          bestNode = node;
          bestMatchedPath = p;
        }
      }
    }
  }

  if (!bestNode) {
    return {
      matched: false,
      filePath,
      message: `No architectural component matched path "${filePath}".`,
      availableComponents: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        path: c.data.path,
      })),
    };
  }

  const service = index.serviceOf(bestNode.id);
  const layer = index.layerOf(bestNode.id);

  return {
    matched: true,
    filePath,
    matchedPath: bestMatchedPath,
    component: {
      id: bestNode.id,
      kind: bestNode.kind,
      name: bestNode.name,
      path: "path" in bestNode.data ? bestNode.data.path : null,
      fullPath: index.path(bestNode.id),
      responsibilities:
        "responsibilities" in bestNode.data ? (bestNode.data.responsibilities as string[]) : [],
      rules: "rules" in bestNode.data ? (bestNode.data.rules as string[]) : [],
      exports: "exports" in bestNode.data ? (bestNode.data.exports as string[]) : [],
    },
    service: service ? briefNode(service) : null,
    layer: layer ? briefNode(layer) : null,
    allowedLayerDependencies: layer
      ? index
          .outgoing(layer.id, "depends_on")
          .map((e) => index.node(e.target)!)
          .filter(Boolean)
          .map((n) => ({
            id: n.id,
            name: n.name,
            path: "path" in n.data ? (n.data.path as string) : null,
          }))
      : [],
    layerRules: layer && "rules" in layer.data ? (layer.data.rules as string[]) : [],
    stack: index.stackFor(bestNode.id),
    conventions: index.conventionsFor(bestNode.id),
    relations: {
      outgoing: index
        .outgoing(bestNode.id)
        .map((e) => {
          const tgt = index.node(e.target);
          return tgt
            ? {
                edgeId: e.id,
                kind: e.kind,
                label: e.label,
                target: briefNode(tgt),
              }
            : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
      incoming: index
        .incoming(bestNode.id)
        .map((e) => {
          const src = index.node(e.source);
          return src
            ? {
                edgeId: e.id,
                kind: e.kind,
                label: e.label,
                source: briefNode(src),
              }
            : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    },
  };
}
