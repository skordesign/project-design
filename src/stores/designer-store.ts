/**
 * Client state for one open project: the draft document, undo/redo history
 * (zundo, document only) and save bookkeeping. Pure zustand/vanilla so it is
 * unit-testable in Node; components read it through DesignerStoreProvider.
 *
 * Every action produces a new `document` object, which is what makes undo,
 * autosave (`document !== savedDocument`) and React re-renders work.
 */
import { temporal } from "zundo";
import { createStore } from "zustand/vanilla";

import { allowedEdgeKinds, NODE_KIND_META } from "@/lib/design/catalog";
import {
  addGameSystem,
  applyServiceTemplate,
  removeChannel,
  removeField,
  removeElements,
  removeOperation,
  renameField,
  type TemplateApplication,
} from "@/lib/design/edits";
import { reparentNode, type Point } from "@/lib/design/geometry";
import { newEdgeId, newNodeId } from "@/lib/design/ids";
import { safeParseDesign, sortNodesParentFirst } from "@/lib/design/integrity";
import { arrangeLayout } from "@/lib/design/layout";
import { arrangeLayoutElk, type ArrangeLayoutElkOptions } from "@/lib/design/layout-elk";
import {
  EdgeSchema,
  NodeSchema,
  type DesignDocument,
  type DesignEdge,
  type DesignNode,
  type EdgeKind,
  type NodeKind,
} from "@/lib/design/schema";

export type SaveStatus = "idle" | "saving" | "error" | "conflict";
type Sections = Pick<
  DesignDocument,
  "overview" | "stack" | "conventions" | "decisions" | "milestones"
>;

export interface DesignerState {
  slug: string;
  document: DesignDocument;
  /** The document object the server last accepted; dirty = document !== savedDocument. */
  savedDocument: DesignDocument;
  /** Server revision of savedDocument; sent with the next save. */
  revision: number;
  status: SaveStatus;
  statusMessage: string | null;
  /** View-only: every edit is ignored (the document can still be replaced from the server). */
  readOnly: boolean;
  setReadOnly(readOnly: boolean): void;

  addNode(kind: NodeKind, position: Point, parentId?: string | null): string;
  updateNode(id: string, update: (node: DesignNode) => DesignNode): void;
  /** Apply the result of a finished drag or resize (one undo step). */
  commitGeometry(
    changes: { id: string; position?: Point; size?: { width: number; height: number } }[],
  ): void;
  setParent(id: string, parentId: string | null): void;
  /** Auto-arranges the top level (null) or a container's inside as a tree (one undo step). */
  arrangeLayout(rootId: string | null, options?: { collapsed?: boolean }): void;
  /** Auto-arranges along the flow with ELK layered layout (one undo step, async). Falls back to the tree layout when ELK fails. */
  arrangeLayoutElk(rootId: string | null, options?: ArrangeLayoutElkOptions): Promise<void>;
  /** Returns the new edge id, or null if the connection is not allowed or exists. */
  connect(source: string, target: string, kind?: EdgeKind): string | null;
  updateEdge(id: string, update: (edge: DesignEdge) => DesignEdge): void;
  /** Removes nodes (with everything nested inside) and edges (plus edges of removed nodes). */
  removeElements(ids: { nodeIds?: string[]; edgeIds?: string[] }): void;
  updateSections(patch: Partial<Sections>): void;
  /** Cross-reference-safe edits (each is one undo step): see lib/design/edits.ts. */
  removeOperation(apiId: string, operationId: string): void;
  removeChannel(queueId: string, channelId: string): void;
  renameField(entityId: string, from: string, to: string): void;
  removeField(entityId: string, name: string): void;
  /** Applies a service template as one undo step; returns what was added (see edits.ts). */
  applyServiceTemplate(serviceId: string, templateId: string): TemplateApplication["added"];
  /** Adds a built-in game system as one undo step; returns its id, or null if nothing was added. */
  addGameSystem(templateId: string, position?: Point): string | null;
  /** Replace the draft wholesale (restore a version, reload after a conflict or a remote save). */
  replaceDocument(document: DesignDocument, revision?: number): void;

  markSaving(): void;
  markSaved(savedDocument: DesignDocument, revision: number): void;
  markSaveFailed(status: "error" | "conflict", message: string): void;
}

export type DesignerStore = ReturnType<typeof createDesignerStore>;

export function createDesignerStore(init: {
  slug: string;
  document: DesignDocument;
  revision: number;
  /**
   * Called when an edit would make the document invalid (schema or integrity errors).
   * The edit is discarded: the server would reject the save, so it must never be stored.
   */
  onReject?: (message: string) => void;
}) {
  return createStore<DesignerState>()(
    temporal(
      (set, get) => {
        const mutate = (fn: (doc: DesignDocument) => DesignDocument) => {
          if (get().readOnly) return;
          const next = fn(get().document);
          if (next === get().document) return;
          const check = safeParseDesign(next);
          if (!check.ok) {
            init.onReject?.(check.issues[0]?.message ?? "That change is not valid");
            return;
          }
          set({ document: next });
        };
        const mapNode = (doc: DesignDocument, id: string, fn: (n: DesignNode) => DesignNode) => ({
          ...doc,
          nodes: doc.nodes.map((n) => (n.id === id ? fn(n) : n)),
        });

        return {
          slug: init.slug,
          document: init.document,
          savedDocument: init.document,
          revision: init.revision,
          status: "idle",
          statusMessage: null,
          readOnly: false,

          setReadOnly(readOnly) {
            set({ readOnly });
          },

          addNode(kind, position, parentId = null) {
            const meta = NODE_KIND_META[kind];
            const node = NodeSchema.parse({
              id: newNodeId(kind),
              kind,
              name: `New ${meta.label.toLowerCase()}`,
              parentId,
              position,
              size: meta.container ? meta.defaultSize : null,
            });
            mutate((doc) => ({ ...doc, nodes: sortNodesParentFirst([...doc.nodes, node]) }));
            return node.id;
          },

          updateNode(id, update) {
            mutate((doc) => mapNode(doc, id, update));
          },

          commitGeometry(changes) {
            if (changes.length === 0) return;
            const byId = new Map(changes.map((c) => [c.id, c]));
            mutate((doc) => ({
              ...doc,
              nodes: doc.nodes.map((n) => {
                const c = byId.get(n.id);
                if (!c) return n;
                return { ...n, position: c.position ?? n.position, size: c.size ?? n.size };
              }),
            }));
          },

          setParent(id, parentId) {
            mutate((doc) => reparentNode(doc, id, parentId));
          },

          arrangeLayout(rootId, options) {
            mutate((doc) => arrangeLayout(doc, rootId, options));
          },

          async arrangeLayoutElk(rootId, options) {
            if (get().readOnly) return;
            try {
              const next = await arrangeLayoutElk(get().document, rootId, options);
              mutate(() => next);
            } catch {
              // ELK failed (e.g. huge graph): fall back to the sync tree layout.
              mutate((doc) => arrangeLayout(doc, rootId, options));
            }
          },

          connect(source, target, kind) {
            if (get().readOnly) return null;
            const doc = get().document;
            const s = doc.nodes.find((n) => n.id === source);
            const t = doc.nodes.find((n) => n.id === target);
            if (!s || !t) return null;
            const allowed = allowedEdgeKinds(s.kind, t.kind);
            const chosen = kind ?? allowed[0];
            if (!chosen || !allowed.includes(chosen)) return null;
            if (source === target && chosen !== "relation") return null;
            const exists = doc.edges.some(
              (e) => e.kind === chosen && e.source === source && e.target === target,
            );
            if (exists) return null;
            const edge = EdgeSchema.parse({ id: newEdgeId(chosen), kind: chosen, source, target });
            mutate((d) => ({ ...d, edges: [...d.edges, edge] }));
            return edge.id;
          },

          updateEdge(id, update) {
            mutate((doc) => ({
              ...doc,
              edges: doc.edges.map((e) => (e.id === id ? update(e) : e)),
            }));
          },

          removeElements(ids) {
            mutate((doc) => removeElements(doc, ids));
          },

          updateSections(patch) {
            mutate((doc) => ({ ...doc, ...patch }));
          },

          removeOperation(apiId, operationId) {
            mutate((doc) => removeOperation(doc, apiId, operationId));
          },
          removeChannel(queueId, channelId) {
            mutate((doc) => removeChannel(doc, queueId, channelId));
          },
          renameField(entityId, from, to) {
            mutate((doc) => renameField(doc, entityId, from, to));
          },
          removeField(entityId, name) {
            mutate((doc) => removeField(doc, entityId, name));
          },
          applyServiceTemplate(serviceId, templateId) {
            const result = applyServiceTemplate(get().document, serviceId, templateId);
            mutate(() => result.document);
            return result.added;
          },
          addGameSystem(templateId, position) {
            const result = addGameSystem(get().document, templateId, position);
            mutate(() => result.document);
            return get().document === result.document ? result.systemId : null;
          },

          replaceDocument(document, revision) {
            set({
              document,
              savedDocument: document,
              revision: revision ?? get().revision,
              status: "idle",
              statusMessage: null,
            });
          },

          markSaving() {
            set({ status: "saving", statusMessage: null });
          },
          markSaved(savedDocument, revision) {
            set({ savedDocument, revision, status: "idle", statusMessage: null });
          },
          markSaveFailed(status, message) {
            set({ status, statusMessage: message });
          },
        };
      },
      {
        // History holds documents only; save bookkeeping is never undone.
        partialize: (s) => ({ document: s.document }),
        equality: (a, b) => a.document === b.document,
        limit: 200,
      },
    ),
  );
}

export const isDirty = (s: DesignerState) => s.document !== s.savedDocument;
