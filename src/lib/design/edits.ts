/**
 * Document edits that touch several places at once, so the result stays valid
 * (no dangling operation, channel, field or entity references). Pure and
 * isomorphic; the designer store applies them as single undo steps.
 */
import { getGameSystemTemplate, type GameSystemLink } from "@/lib/design/game-systems";
import { CONTAINER_HEADER, CONTAINER_PAD, freePosition, subtreeIds } from "@/lib/design/geometry";
import { newEdgeId, newItemId, newNodeId } from "@/lib/design/ids";
import {
  ContentDataSchema,
  MechanicDataSchema,
  ResourceDataSchema,
  SystemDataSchema,
  type DesignDocument,
  type DesignEdge,
  type DesignNode,
  type Field,
  type TypeShape,
} from "@/lib/design/schema";
import { getServiceTemplate } from "@/lib/design/service-templates";

const mapNode = (doc: DesignDocument, id: string, fn: (n: DesignNode) => DesignNode) => ({
  ...doc,
  nodes: doc.nodes.map((n) => (n.id === id ? fn(n) : n)),
});

/** Removes an API operation and the `calls`/`exposes` edges' references to it. */
export function removeOperation(doc: DesignDocument, apiId: string, opId: string): DesignDocument {
  const next = mapNode(doc, apiId, (n) =>
    n.kind === "api"
      ? { ...n, data: { ...n.data, operations: n.data.operations.filter((o) => o.id !== opId) } }
      : n,
  );
  return {
    ...next,
    edges: next.edges.map((e) =>
      (e.kind === "calls" || e.kind === "exposes") &&
      e.target === apiId &&
      e.data.operations.includes(opId)
        ? ({
            ...e,
            data: { ...e.data, operations: e.data.operations.filter((o) => o !== opId) },
          } as DesignEdge)
        : e,
    ),
  };
}

/** Removes a queue channel; publishes/subscribes edges that named it become "any channel". */
export function removeChannel(
  doc: DesignDocument,
  queueId: string,
  channelId: string,
): DesignDocument {
  const next = mapNode(doc, queueId, (n) =>
    n.kind === "queue"
      ? { ...n, data: { ...n.data, channels: n.data.channels.filter((c) => c.id !== channelId) } }
      : n,
  );
  return {
    ...next,
    edges: next.edges.map((e) =>
      (e.kind === "publishes" || e.kind === "subscribes") &&
      e.target === queueId &&
      e.data.channelId === channelId
        ? { ...e, data: { ...e.data, channelId: null } }
        : e,
    ),
  };
}

/** Renames an entity field and the indexes that use it. */
export function renameField(
  doc: DesignDocument,
  entityId: string,
  from: string,
  to: string,
): DesignDocument {
  return mapNode(doc, entityId, (n) =>
    n.kind === "entity"
      ? {
          ...n,
          data: {
            ...n.data,
            fields: n.data.fields.map((f) => (f.name === from ? { ...f, name: to } : f)),
            indexes: n.data.indexes.map((i) => ({
              ...i,
              fields: i.fields.map((f) => (f === from ? to : f)),
            })),
          },
        }
      : n,
  );
}

/** Removes an entity field, dropping it from indexes (an index left empty is removed). */
export function removeField(doc: DesignDocument, entityId: string, name: string): DesignDocument {
  return mapNode(doc, entityId, (n) =>
    n.kind === "entity"
      ? {
          ...n,
          data: {
            ...n.data,
            fields: n.data.fields.filter((f) => f.name !== name),
            indexes: n.data.indexes
              .map((i) => ({ ...i, fields: i.fields.filter((f) => f !== name) }))
              .filter((i) => i.fields.length > 0),
          },
        }
      : n,
  );
}

/**
 * Clears references to entities that are about to disappear: shapes lose their
 * entity, and `ref` fields become plain `json` (a ref without an entity is invalid).
 */
export function scrubEntityRefs(doc: DesignDocument, gone: ReadonlySet<string>): DesignDocument {
  if (gone.size === 0) return doc;
  const field = (f: Field): Field =>
    f.refEntityId && gone.has(f.refEntityId) ? { ...f, type: "json", refEntityId: null } : f;
  const shape = (s: TypeShape | null): TypeShape | null =>
    s && {
      ...s,
      entityId: s.entityId && gone.has(s.entityId) ? null : s.entityId,
      fields: s.fields.map(field),
    };
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      switch (n.kind) {
        case "entity":
          return { ...n, data: { ...n.data, fields: n.data.fields.map(field) } };
        case "api":
          return {
            ...n,
            data: {
              ...n.data,
              operations: n.data.operations.map((o) => ({
                ...o,
                request: shape(o.request),
                response: shape(o.response),
              })),
            },
          };
        case "queue":
          return {
            ...n,
            data: {
              ...n.data,
              channels: n.data.channels.map((c) => ({ ...c, payload: shape(c.payload)! })),
            },
          };
        default:
          return n;
      }
    }),
  };
}

/**
 * Removes nodes (with everything nested inside) and edges (plus edges of removed
 * nodes). Stack/convention/milestone scopes and entity references to removed nodes are cleared.
 */
export function removeElements(
  doc: DesignDocument,
  { nodeIds = [], edgeIds = [] }: { nodeIds?: readonly string[]; edgeIds?: readonly string[] },
): DesignDocument {
  const doomed = new Set<string>();
  for (const id of nodeIds) {
    if (doc.nodes.some((n) => n.id === id)) for (const x of subtreeIds(doc, id)) doomed.add(x);
  }
  const doomedEdges = new Set(edgeIds);
  if (doomed.size === 0 && !doc.edges.some((e) => doomedEdges.has(e.id))) return doc;
  const keepId = (id: string) => !doomed.has(id);
  const entities = new Set(
    doc.nodes.filter((n) => doomed.has(n.id) && n.kind === "entity").map((n) => n.id),
  );
  return scrubEntityRefs(
    {
      ...doc,
      nodes: doc.nodes.filter((n) => keepId(n.id)),
      edges: doc.edges.filter(
        (e) => !doomedEdges.has(e.id) && keepId(e.source) && keepId(e.target),
      ),
      // Scopes must not point at deleted nodes (integrity rule scope.unknown_node).
      stack: doc.stack.map((s) => ({ ...s, scope: s.scope.filter(keepId) })),
      conventions: doc.conventions.map((c) => ({ ...c, scope: c.scope.filter(keepId) })),
      milestones: doc.milestones.map((m) => ({ ...m, scope: m.scope.filter(keepId) })),
    },
    entities,
  );
}

export interface TemplateApplication {
  document: DesignDocument;
  added: { stack: number; conventions: number; layers: number; env: number };
}

const LAYER_GAP = 16;
const LAYER_TOP = 56;
const LAYER_X = 40;

const joinPath = (root: string, rel: string) =>
  root ? `${root.replace(/\/+$/, "")}/${rel}`.replace(/^\.\//, "") : rel;

/**
 * Applies a service template (service-templates.ts) to a service node. Existing
 * content is never overwritten: language/framework/runtime/type are set, but
 * path, port, env vars, stack items, conventions, patterns and layers are only
 * added when missing. Layers are skipped when the service already has any.
 * Returns the document unchanged for an unknown service or template.
 */
export function applyServiceTemplate(
  doc: DesignDocument,
  serviceId: string,
  templateId: string,
): TemplateApplication {
  const template = getServiceTemplate(templateId);
  const service = doc.nodes.find((n) => n.id === serviceId);
  const none = { stack: 0, conventions: 0, layers: 0, env: 0 };
  if (!template || !service || service.kind !== "service") return { document: doc, added: none };

  const rootPath = service.data.path || template.defaultPath;
  const hasLayers = doc.nodes.some((n) => n.parentId === serviceId && n.kind === "layer");

  const env = template.env.filter((v) => !service.data.env.some((e) => e.name === v.name));
  const patterns = template.patterns.filter(
    (p) => !service.patterns.some((x) => x.name.toLowerCase() === p.name.toLowerCase()),
  );

  const stack = template.stack
    .filter(
      (t) =>
        !doc.stack.some(
          (s) =>
            s.category === t.category &&
            s.name === t.name &&
            s.scope.length === 1 &&
            s.scope[0] === serviceId,
        ),
    )
    .map((t) => ({ id: newItemId("stk"), ...t, scope: [serviceId] }));
  const conventions = template.conventions
    .filter(
      (c) =>
        !doc.conventions.some(
          (x) => x.rule === c.rule && x.scope.length === 1 && x.scope[0] === serviceId,
        ),
    )
    .map((c) => ({ id: newItemId("cnv"), ...c, scope: [serviceId] }));

  const layerIds = new Map(template.layers.map((l) => [l.key, newNodeId("layer")]));
  const layerNodes: DesignNode[] = hasLayers
    ? []
    : template.layers.map((l, i) => ({
        id: layerIds.get(l.key)!,
        kind: "layer",
        name: l.name,
        description: "",
        parentId: serviceId,
        position: { x: LAYER_X, y: LAYER_TOP + i * (140 + LAYER_GAP) },
        size: { width: 440, height: 140 },
        tags: [],
        patterns: [],
        data: {
          path: joinPath(rootPath, l.path),
          responsibilities: l.responsibilities,
          rules: l.rules,
        },
      }));
  const layerEdges = hasLayers
    ? []
    : template.layers.flatMap((l) =>
        l.dependsOn.map((to) => ({
          id: newEdgeId("depends_on"),
          kind: "depends_on" as const,
          source: layerIds.get(l.key)!,
          target: layerIds.get(to)!,
          label: "",
          description: "",
          data: {},
        })),
      );
  const neededHeight = LAYER_TOP + template.layers.length * (140 + LAYER_GAP) + LAYER_GAP;

  const nodes = doc.nodes.map((n): DesignNode => {
    if (n.id !== serviceId || n.kind !== "service") return n;
    return {
      ...n,
      patterns: [...n.patterns, ...patterns],
      size:
        layerNodes.length > 0
          ? {
              width: Math.max(n.size?.width ?? 0, 520),
              height: Math.max(n.size?.height ?? 0, neededHeight),
            }
          : n.size,
      data: {
        ...n.data,
        type: template.type,
        language: template.language,
        framework: template.framework,
        runtime: template.runtime,
        path: rootPath,
        port: n.data.port ?? template.port,
        env: [...n.data.env, ...env],
      },
    };
  });

  return {
    document: {
      ...doc,
      stack: [...doc.stack, ...stack],
      conventions: [...doc.conventions, ...conventions],
      nodes: [...nodes, ...layerNodes],
      edges: [...doc.edges, ...layerEdges],
    },
    added: {
      stack: stack.length,
      conventions: conventions.length,
      layers: layerNodes.length,
      env: env.length,
    },
  };
}

export interface GameSystemAddition {
  document: DesignDocument;
  /** The new system's id; null when the template is unknown. */
  systemId: string | null;
  added: { mechanics: number; resources: number; content: number; links: number };
}

const PART = { width: 208, height: 54, pitchX: 248, pitchY: 112, cols: 4 } as const;
const PART_X = 40;
const PART_TOP = CONTAINER_HEADER + 24;

const linkData = (link: GameSystemLink) => {
  const detail = link.detail ?? "";
  switch (link.kind) {
    case "triggers":
      return { event: detail };
    case "modifies":
      return { effect: detail };
    case "produces":
      return { rate: detail };
    case "consumes":
      return { amount: detail };
    case "uses":
      return { purpose: detail };
    case "depends_on":
      return {};
  }
};

/**
 * Adds a built-in game system (game-systems.ts) at the top level: the system
 * container with its mechanics, resources and content nested inside, and the
 * edges between them. Ring parts are laid out on a circle, the rest in a grid
 * below. Returns the document unchanged for an unknown template.
 */
export function addGameSystem(
  doc: DesignDocument,
  templateId: string,
  position?: { x: number; y: number },
): GameSystemAddition {
  const template = getGameSystemTemplate(templateId);
  const none = { mechanics: 0, resources: 0, content: 0, links: 0 };
  if (!template) return { document: doc, systemId: null, added: none };

  const systemId = newNodeId("system");
  const ids = new Map(template.parts.map((part) => [part.key, newNodeId(part.kind)]));

  const ringKeys = template.ring ?? [];
  const radius = ringKeys.length ? Math.max(200, ringKeys.length * 44) : 0;
  const ringWidth = ringKeys.length ? radius * 2 + PART.width : 0;
  const ringHeight = ringKeys.length ? radius * 2 + PART.pitchY : 0;
  const rest = template.parts.filter((part) => !ringKeys.includes(part.key));
  const cols = Math.min(PART.cols, rest.length);
  const gridWidth = cols ? cols * PART.pitchX - (PART.pitchX - PART.width) : 0;
  const inner = Math.max(ringWidth, gridWidth);

  const at = new Map<string, { x: number; y: number }>();
  ringKeys.forEach((key, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / ringKeys.length;
    at.set(key, {
      x: Math.round(PART_X + (inner - ringWidth) / 2 + radius + radius * Math.cos(angle)),
      y: Math.round(PART_TOP + radius + radius * Math.sin(angle)),
    });
  });
  rest.forEach((part, i) => {
    at.set(part.key, {
      x: PART_X + (i % PART.cols) * PART.pitchX,
      y: PART_TOP + ringHeight + Math.floor(i / PART.cols) * PART.pitchY,
    });
  });
  const rows = Math.ceil(rest.length / PART.cols);
  const height = PART_TOP + ringHeight + rows * PART.pitchY - (PART.pitchY - PART.height);

  const base = { description: "", parentId: systemId, size: null, tags: [], patterns: [] };
  const parts = template.parts.map((part): DesignNode => {
    const common = {
      ...base,
      id: ids.get(part.key)!,
      name: part.name,
      description: part.description ?? "",
      position: at.get(part.key)!,
    };
    switch (part.kind) {
      case "mechanic":
        return { ...common, kind: "mechanic", data: MechanicDataSchema.parse(part.data) };
      case "resource":
        return { ...common, kind: "resource", data: ResourceDataSchema.parse(part.data) };
      case "content":
        return { ...common, kind: "content", data: ContentDataSchema.parse(part.data) };
    }
  });
  const system: DesignNode = {
    ...base,
    id: systemId,
    kind: "system",
    name: template.label,
    description: template.summary,
    parentId: null,
    position: position ?? freePosition(doc, null),
    size: { width: inner + PART_X * 2, height: height + CONTAINER_PAD },
    data: SystemDataSchema.parse({ ...template.system, category: template.category }),
  };
  const edges = template.links.map(
    (link) =>
      ({
        id: newEdgeId(link.kind),
        kind: link.kind,
        source: ids.get(link.from)!,
        target: ids.get(link.to)!,
        label: link.label ?? "",
        description: "",
        data: linkData(link),
      }) as DesignEdge,
  );

  const count = (kind: string) => template.parts.filter((part) => part.kind === kind).length;
  return {
    document: { ...doc, nodes: [...doc.nodes, system, ...parts], edges: [...doc.edges, ...edges] },
    systemId,
    added: {
      mechanics: count("mechanic"),
      resources: count("resource"),
      content: count("content"),
      links: edges.length,
    },
  };
}
