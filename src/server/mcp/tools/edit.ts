/**
 * Write tools: let an agent change the draft design. Every edit is a pure
 * function of the current draft, checked with safeParseDesign (the same rules
 * as the canvas and the REST save) and stored with optimistic concurrency.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { allowedEdgeKinds, NODE_KIND_META } from "@/lib/design/catalog";
import {
  addGameSystem,
  applyServiceTemplate,
  removeChannel,
  removeElements,
  removeOperation,
} from "@/lib/design/edits";
import { GAME_SYSTEM_TEMPLATES } from "@/lib/design/game-systems";
import { freePosition, growToFit, reparentNode, subtreeIds } from "@/lib/design/geometry";
import { indexDesign, type DesignIndex } from "@/lib/design/graph";
import { newEdgeId, newItemId, newNodeId } from "@/lib/design/ids";
import { safeParseDesign, sortNodesParentFirst } from "@/lib/design/integrity";
import {
  ARCHITECTURE_STYLES,
  CONVENTION_CATEGORIES,
  ConventionSchema,
  DecisionSchema,
  DESIGN_MODES,
  EDGE_KINDS,
  EdgeSchema,
  GameOverviewSchema,
  MilestoneSchema,
  NODE_KINDS,
  NodeSchema,
  STACK_CATEGORIES,
  StackItemSchema,
  type DesignDocument,
  type DesignNode,
} from "@/lib/design/schema";
import { SERVICE_TEMPLATES } from "@/lib/design/service-templates";
import { AppError } from "@/server/errors";
import {
  findNode,
  guarded,
  jsonResult,
  ProjectArg,
  resolveSlug,
  ToolError,
  type McpContext,
} from "@/server/mcp/context";
import { saveDraft } from "@/server/services/projects";
import { resolveDocument } from "@/server/services/versions";

const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;
const MAX_ATTEMPTS = 3;

const ComponentRef = z.string().describe("Component id, or its exact name.");
const Data = z
  .record(z.string(), z.unknown())
  .describe("Kind-specific data fields (see get_design_schema). Omitted fields keep defaults.");
const Point = z.object({ x: z.number(), y: z.number() });
const Patterns = z
  .array(z.object({ name: z.string(), notes: z.string().optional() }))
  .describe("Design patterns this component uses (replaces the list).");

const SECTIONS = {
  stack: { schema: StackItemSchema, prefix: "stk" },
  conventions: { schema: ConventionSchema, prefix: "cnv" },
  decisions: { schema: DecisionSchema, prefix: "adr" },
  milestones: { schema: MilestoneSchema, prefix: "ms" },
} as const;
type Section = keyof typeof SECTIONS;
const SectionArg = z.enum(Object.keys(SECTIONS) as [Section, ...Section[]]);

const issueList = (issues: { message: string }[]) =>
  issues
    .slice(0, 20)
    .map((i) => `- ${i.message}`)
    .join("\n");

/** zod issues as "path: message" lines, prefixed with what was being parsed. */
function invalid(what: string, error: z.ZodError): ToolError {
  return new ToolError(
    `${what} is invalid:\n` +
      issueList(
        error.issues.map((i) => ({ message: `${i.path.join(".") || "(root)"}: ${i.message}` })),
      ),
  );
}

/**
 * Loads the draft, applies `edit` and saves the result if it changed. A save that
 * loses a race with another writer is retried against the new draft.
 */
async function editDraft<R>(
  ctx: McpContext,
  project: string | undefined,
  edit: (doc: DesignDocument, index: DesignIndex) => { document: DesignDocument; result: R },
): Promise<R & { revision: number }> {
  const slug = await resolveSlug(ctx, project);
  for (let attempt = 1; ; attempt++) {
    const draft = await resolveDocument(ctx.db, slug, "draft", ctx.principal);
    const { document, result } = edit(draft.document, indexDesign(draft.document));
    if (document === draft.document) return { ...result, revision: draft.revision };
    const parsed = safeParseDesign(document);
    if (!parsed.ok) {
      throw new ToolError(
        `That change would make the design invalid:\n${issueList(parsed.issues)}`,
      );
    }
    try {
      const saved = await saveDraft(
        ctx.db,
        slug,
        { revision: draft.revision, document: parsed.document },
        ctx.principal,
      );
      return { ...result, revision: saved.revision };
    } catch (error) {
      if (error instanceof AppError && error.code === "CONFLICT" && attempt < MAX_ATTEMPTS)
        continue;
      throw error;
    }
  }
}

/** Gives API operations and queue channels ids when the agent left them out. */
function withItemIds(kind: DesignNode["kind"], data: Record<string, unknown>) {
  const fill = (key: string, prefix: "op" | "ch") => {
    const items = data[key];
    if (!Array.isArray(items)) return data;
    return {
      ...data,
      [key]: items.map((item: unknown) =>
        item && typeof item === "object" && !("id" in item)
          ? { id: newItemId(prefix), ...item }
          : item,
      ),
    };
  };
  if (kind === "api") return fill("operations", "op");
  if (kind === "queue") return fill("channels", "ch");
  return data;
}

/** Fixes edges that referenced operations or channels the update removed. */
function dropRemovedItems(doc: DesignDocument, before: DesignNode, after: DesignNode) {
  if (before.kind === "api" && after.kind === "api") {
    const kept = new Set(after.data.operations.map((o) => o.id));
    return before.data.operations
      .filter((o) => !kept.has(o.id))
      .reduce((d, o) => removeOperation(d, after.id, o.id), doc);
  }
  if (before.kind === "queue" && after.kind === "queue") {
    const kept = new Set(after.data.channels.map((c) => c.id));
    return before.data.channels
      .filter((c) => !kept.has(c.id))
      .reduce((d, c) => removeChannel(d, after.id, c.id), doc);
  }
  return doc;
}

const replaceNode = (doc: DesignDocument, node: DesignNode): DesignDocument => ({
  ...doc,
  nodes: doc.nodes.map((n) => (n.id === node.id ? node : n)),
});

function reparent(doc: DesignDocument, id: string, parentId: string | null) {
  try {
    return reparentNode(doc, id, parentId);
  } catch (error) {
    throw new ToolError((error as Error).message);
  }
}

export function registerEditTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "add_component",
    {
      title: "Add a component",
      description:
        "Add a component (node) to the draft design. Prefer the kinds of the project's design mode (get_design_schema `modes`: software or game). Containers (service, layer, datastore, system) hold children; call get_design_schema for allowed parents and each kind's data fields. Returns the new id.",
      inputSchema: z.object({
        project: ProjectArg,
        kind: z.enum(NODE_KINDS),
        name: z.string(),
        parent: ComponentRef.optional().describe(
          "Container id or exact name. Omit for the top level.",
        ),
        description: z.string().optional().describe("Markdown. For notes, the note text."),
        tags: z.array(z.string()).optional(),
        patterns: Patterns.optional(),
        data: Data.optional(),
        position: Point.optional().describe("Canvas position; omit to place it automatically."),
      }),
      annotations: WRITE,
    },
    guarded(async ({ project, kind, parent, position, data, ...fields }) => {
      const saved = await editDraft(ctx, project, (doc, index) => {
        const parentId = parent === undefined ? null : findNode(index, parent).id;
        const meta = NODE_KIND_META[kind];
        const parsed = NodeSchema.safeParse({
          ...fields,
          id: newNodeId(kind),
          kind,
          parentId,
          position: position ?? freePosition(doc, parentId),
          size: meta.container ? meta.defaultSize : null,
          data: withItemIds(kind, data ?? {}),
        });
        if (!parsed.success) throw invalid(`The ${kind}`, parsed.error);
        const node = parsed.data;
        const document = growToFit(
          { ...doc, nodes: sortNodesParentFirst([...doc.nodes, node]) },
          parentId,
        );
        return { document, result: { component: document.nodes.find((n) => n.id === node.id)! } };
      });
      return jsonResult({ id: saved.component.id, ...saved });
    }),
  );

  server.registerTool(
    "update_component",
    {
      title: "Update a component",
      description:
        "Change a component in the draft: rename it, edit its description, tags or patterns, merge new values into its data (top-level data keys you pass replace the old ones; others are kept), or move it to another container. Removing API operations or queue channels also clears edges that referenced them.",
      inputSchema: z.object({
        project: ProjectArg,
        id: ComponentRef,
        name: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional().describe("Replaces the tags."),
        patterns: Patterns.optional(),
        data: Data.optional(),
        parent: ComponentRef.nullable()
          .optional()
          .describe("New container id or exact name; null moves it to the top level."),
        position: Point.optional(),
      }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    guarded(async ({ project, id, parent, data, ...fields }) => {
      const saved = await editDraft(ctx, project, (doc, index) => {
        const before = findNode(index, id);
        const defined = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined),
        );
        const parsed = NodeSchema.safeParse({
          ...before,
          ...defined,
          data: { ...before.data, ...withItemIds(before.kind, data ?? {}) },
        });
        if (!parsed.success) throw invalid(`The ${before.kind} "${before.name}"`, parsed.error);
        let document = dropRemovedItems(replaceNode(doc, parsed.data), before, parsed.data);
        if (parent !== undefined) {
          const parentId = parent === null ? null : findNode(index, parent).id;
          document = growToFit(reparent(document, before.id, parentId), parentId);
        } else if (fields.position !== undefined) {
          document = growToFit(document, before.parentId);
        }
        return { document, result: { component: document.nodes.find((n) => n.id === before.id)! } };
      });
      return jsonResult(saved);
    }),
  );

  server.registerTool(
    "remove_components",
    {
      title: "Remove components",
      description:
        "Remove components from the draft, with everything nested inside them and every connection to them. Stack, convention and milestone scopes and entity references to them are cleared.",
      inputSchema: z.object({
        project: ProjectArg,
        ids: z.array(ComponentRef).min(1).describe("Component ids or exact names."),
      }),
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ project, ids }) => {
      const saved = await editDraft(ctx, project, (doc, index) => {
        const nodeIds = ids.map((ref) => findNode(index, ref).id);
        const removed = new Set(nodeIds.flatMap((id) => [...subtreeIds(doc, id)]));
        return {
          document: removeElements(doc, { nodeIds }),
          result: { removed: [...removed] },
        };
      });
      return jsonResult(saved);
    }),
  );

  server.registerTool(
    "connect_components",
    {
      title: "Connect two components",
      description:
        "Add a typed connection (edge) between two components in the draft, e.g. a service that exposes an API, a module that depends on another, or a relation between entities. Omit kind to use the most likely kind for the pair. Returns the edge id.",
      inputSchema: z.object({
        project: ProjectArg,
        source: ComponentRef,
        target: ComponentRef,
        kind: z.enum(EDGE_KINDS).optional(),
        label: z.string().optional(),
        description: z.string().optional(),
        data: Data.optional(),
      }),
      annotations: WRITE,
    },
    guarded(async ({ project, source, target, kind, data, ...fields }) => {
      const saved = await editDraft(ctx, project, (doc, index) => {
        const s = findNode(index, source);
        const t = findNode(index, target);
        const allowed = allowedEdgeKinds(s.kind, t.kind);
        const chosen = kind ?? allowed[0];
        if (!chosen || !allowed.includes(chosen)) {
          throw new ToolError(
            `A ${s.kind} cannot ${kind ? `"${kind}" ` : ""}connect to a ${t.kind}. ` +
              (allowed.length ? `Allowed kinds: ${allowed.join(", ")}.` : "No kind is allowed."),
          );
        }
        const existing = doc.edges.find(
          (e) => e.kind === chosen && e.source === s.id && e.target === t.id,
        );
        if (existing) {
          throw new ToolError(
            `${s.name} already ${chosen} ${t.name} [${existing.id}]; use update_connection.`,
          );
        }
        const parsed = EdgeSchema.safeParse({
          ...fields,
          id: newEdgeId(chosen),
          kind: chosen,
          source: s.id,
          target: t.id,
          data: data ?? {},
        });
        if (!parsed.success) throw invalid(`The ${chosen} connection`, parsed.error);
        return {
          document: { ...doc, edges: [...doc.edges, parsed.data] },
          result: { connection: parsed.data },
        };
      });
      return jsonResult({ id: saved.connection.id, ...saved });
    }),
  );

  server.registerTool(
    "update_connection",
    {
      title: "Update a connection",
      description:
        "Change a connection's label, description or data (top-level data keys you pass replace the old ones). Connection ids are in get_component relations.",
      inputSchema: z.object({
        project: ProjectArg,
        id: z.string().describe("Connection (edge) id."),
        label: z.string().optional(),
        description: z.string().optional(),
        data: Data.optional(),
      }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    guarded(async ({ project, id, data, ...fields }) => {
      const saved = await editDraft(ctx, project, (doc) => {
        const before = doc.edges.find((e) => e.id === id);
        if (!before) throw new ToolError(`No connection with id "${id}".`);
        const defined = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined),
        );
        const parsed = EdgeSchema.safeParse({
          ...before,
          ...defined,
          data: { ...before.data, ...data },
        });
        if (!parsed.success) throw invalid(`The connection "${id}"`, parsed.error);
        return {
          document: { ...doc, edges: doc.edges.map((e) => (e.id === id ? parsed.data : e)) },
          result: { connection: parsed.data },
        };
      });
      return jsonResult(saved);
    }),
  );

  server.registerTool(
    "remove_connections",
    {
      title: "Remove connections",
      description: "Remove connections (edges) from the draft by id.",
      inputSchema: z.object({
        project: ProjectArg,
        ids: z.array(z.string()).min(1).describe("Connection (edge) ids."),
      }),
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ project, ids }) => {
      const saved = await editDraft(ctx, project, (doc) => {
        const unknown = ids.filter((id) => !doc.edges.some((e) => e.id === id));
        if (unknown.length) throw new ToolError(`No connection with id: ${unknown.join(", ")}.`);
        return { document: removeElements(doc, { edgeIds: ids }), result: { removed: ids } };
      });
      return jsonResult(saved);
    }),
  );

  server.registerTool(
    "update_overview",
    {
      title: "Update the overview",
      description:
        "Change the project overview in the draft: design mode (software or game), summary, goals, non-goals, architecture style and notes, repository layout, and the game vision (genre, engine, platforms, pillars, parameters, references, targets). Only the fields you pass change; lists are replaced.",
      inputSchema: z.object({
        project: ProjectArg,
        mode: z
          .enum(DESIGN_MODES)
          .optional()
          .describe(
            "software: services, data, APIs and messaging. game: loops, systems, mechanics, resources and content.",
          ),
        summary: z.string().optional(),
        goals: z.array(z.string()).optional(),
        nonGoals: z.array(z.string()).optional(),
        architectureStyle: z.enum(ARCHITECTURE_STYLES).optional(),
        architectureNotes: z.string().optional(),
        repository: z
          .object({
            layout: z.enum(["single-package", "monorepo"]).optional(),
            packageManager: z.string().optional(),
            notes: z.string().optional(),
          })
          .optional(),
        game: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Game vision fields to change: genre, engine, platforms[], pillars[], " +
              "parameters[{ name, value, unit?, notes? }], references[{ name, takeaway }], " +
              "targets[{ name, value, unit?, notes? }].",
          ),
      }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    guarded(async ({ project, repository, game, ...fields }) => {
      const defined = <T extends object>(o: T) =>
        Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
      const saved = await editDraft(ctx, project, (doc) => {
        const overview = {
          ...doc.overview,
          ...defined(fields),
          repository: { ...doc.overview.repository, ...defined(repository ?? {}) },
          game: doc.overview.game,
        };
        if (game) {
          const parsed = GameOverviewSchema.safeParse({ ...doc.overview.game, ...game });
          if (!parsed.success) throw invalid("game", parsed.error);
          overview.game = parsed.data;
        }
        return { document: { ...doc, overview }, result: {} };
      });
      return jsonResult(saved);
    }),
  );

  server.registerTool(
    "upsert_section_items",
    {
      title: "Add or change stack, conventions, decisions or milestones",
      description:
        "Add or change items in a project-wide section of the draft. An item with an existing id is merged into it; an item without id is added. " +
        `stack: { category (${STACK_CATEGORIES.join(", ")}), name, version?, notes?, scope? }. ` +
        `conventions: { category (${CONVENTION_CATEGORIES.join(", ")}), level? (must, should, may), rule, scope? }. ` +
        "decisions: { title, status? (proposed, accepted, deprecated, superseded), context?, decision?, consequences?, date? (YYYY-MM-DD) }. " +
        "milestones (the roadmap, in order): { title, timeframe?, deliverables?, exitCriteria?, scope? }. " +
        "scope lists component ids or exact names the item applies to; empty means the whole project.",
      inputSchema: z.object({
        project: ProjectArg,
        section: SectionArg,
        items: z.array(z.record(z.string(), z.unknown())).min(1),
      }),
      annotations: WRITE,
    },
    guarded(async ({ project, section, items }) => {
      const { schema, prefix } = SECTIONS[section];
      const saved = await editDraft(ctx, project, (doc, index) => {
        const list: { id: string }[] = [...doc[section]];
        const ids: string[] = [];
        items.forEach((item, i) => {
          const id = typeof item.id === "string" ? item.id : undefined;
          const at = id === undefined ? -1 : list.findIndex((x) => x.id === id);
          if (id !== undefined && at < 0) {
            throw new ToolError(`No ${section} item with id "${id}"; omit id to add one.`);
          }
          const scope = Array.isArray(item.scope)
            ? { scope: item.scope.map((ref) => findNode(index, String(ref)).id) }
            : {};
          const parsed = schema.safeParse({
            ...(at >= 0 ? list[at] : { id: newItemId(prefix) }),
            ...item,
            ...scope,
          });
          if (!parsed.success) throw invalid(`${section} item ${i + 1}`, parsed.error);
          if (at >= 0) list[at] = parsed.data;
          else list.push(parsed.data);
          ids.push(parsed.data.id);
        });
        return { document: { ...doc, [section]: list }, result: { ids } };
      });
      return jsonResult(saved);
    }),
  );

  server.registerTool(
    "remove_section_items",
    {
      title: "Remove stack, conventions, decisions or milestones",
      description: "Remove items from a project-wide section of the draft by id.",
      inputSchema: z.object({
        project: ProjectArg,
        section: SectionArg,
        ids: z.array(z.string()).min(1),
      }),
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ project, section, ids }) => {
      const saved = await editDraft(ctx, project, (doc) => {
        const list: { id: string }[] = doc[section];
        const unknown = ids.filter((id) => !list.some((x) => x.id === id));
        if (unknown.length)
          throw new ToolError(`No ${section} item with id: ${unknown.join(", ")}.`);
        return {
          document: { ...doc, [section]: list.filter((x) => !ids.includes(x.id)) },
          result: { removed: ids },
        };
      });
      return jsonResult(saved);
    }),
  );

  server.registerTool(
    "apply_service_template",
    {
      title: "Apply a service template",
      description:
        "Fill a service with a starter template: language, framework, runtime, env vars, stack, conventions, patterns and layers. Existing content is kept; layers are only added to a service without any. Templates: " +
        SERVICE_TEMPLATES.map((t) => `${t.id} (${t.summary})`).join("; "),
      inputSchema: z.object({
        project: ProjectArg,
        service: ComponentRef,
        template: z.enum(SERVICE_TEMPLATES.map((t) => t.id) as [string, ...string[]]),
      }),
      annotations: WRITE,
    },
    guarded(async ({ project, service, template }) => {
      const saved = await editDraft(ctx, project, (doc, index) => {
        const node = findNode(index, service, ["service"]);
        const { document, added } = applyServiceTemplate(doc, node.id, template);
        return { document, result: { id: node.id, added } };
      });
      return jsonResult(saved);
    }),
  );

  server.registerTool(
    "add_game_system",
    {
      title: "Add a built-in game system",
      description:
        "Add a ready-made game system at the top level: the system with its mechanics, resources and content tables nested inside, and the produces/consumes/triggers/modifies/uses edges between them. Tune it afterwards with update_component. Systems: " +
        GAME_SYSTEM_TEMPLATES.map((t) => `${t.id} (${t.summary})`).join("; "),
      inputSchema: z.object({
        project: ProjectArg,
        system: z.enum(GAME_SYSTEM_TEMPLATES.map((t) => t.id) as [string, ...string[]]),
        position: Point.optional().describe("Canvas position; omit to place it automatically."),
      }),
      annotations: WRITE,
    },
    guarded(async ({ project, system, position }) => {
      const saved = await editDraft(ctx, project, (doc) => {
        const { document, systemId, added } = addGameSystem(doc, system, position);
        return { document, result: { id: systemId, added } };
      });
      return jsonResult(saved);
    }),
  );

  server.registerTool(
    "save_project_design",
    {
      title: "Replace the whole design",
      description:
        "Replace the draft with a complete design document, for large restructurings. Read it with get_project_design first and pass back its revision; if someone saved in between, the call fails and you must re-read. Prefer the targeted edit tools for small changes.",
      inputSchema: z.object({
        project: ProjectArg,
        revision: z.number().int().nonnegative().describe("Revision from get_project_design."),
        document: z.record(z.string(), z.unknown()).describe("The full design document."),
      }),
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ project, revision, document }) => {
      const slug = await resolveSlug(ctx, project);
      await resolveDocument(ctx.db, slug, "draft", ctx.principal);
      const parsed = safeParseDesign(document);
      if (!parsed.ok) {
        throw new ToolError(`The design is invalid:\n${issueList(parsed.issues)}`);
      }
      try {
        const saved = await saveDraft(
          ctx.db,
          slug,
          { revision, document: parsed.document },
          ctx.principal,
        );
        return jsonResult({ revision: saved.revision });
      } catch (error) {
        if (error instanceof AppError && error.code === "CONFLICT") {
          const { currentRevision } = error.details as { currentRevision: number };
          throw new ToolError(
            `The design was changed elsewhere (current revision ${currentRevision}). ` +
              "Read it again with get_project_design and reapply your change.",
          );
        }
        throw error;
      }
    }),
  );
}
