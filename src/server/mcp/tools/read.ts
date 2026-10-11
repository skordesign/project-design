import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { resolveFileToComponent } from "@/lib/design/resolver";
import { NODE_KINDS } from "@/lib/design/schema";
import {
  brief,
  briefOf,
  findNode,
  guarded,
  jsonResult,
  ProjectArg,
  resolveTarget,
  textResult,
  VersionArg,
  type McpContext,
} from "@/server/mcp/context";
import { listProjects } from "@/server/services/projects";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export function registerReadTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List the project designs this token can read. Call first if you don't know the project slug.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    guarded(async () => {
      const rows = await listProjects(ctx.db, ctx.principal);
      return jsonResult(
        rows.map((r) => ({
          slug: r.slug,
          name: r.name,
          description: r.description,
          revision: r.revision,
          latestVersion: r.latestVersion,
          updatedAt: r.updatedAt,
        })),
      );
    }),
  );

  server.registerTool(
    "get_project_brief",
    {
      title: "Get the design brief",
      description:
        "The whole design as a markdown brief: overview, stack, conventions, component tree, data model, APIs, messaging, integrations, env vars, decisions and build order. Start here before writing code.",
      inputSchema: z.object({ project: ProjectArg, version: VersionArg }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => textResult(briefOf(await resolveTarget(ctx, args)))),
  );

  server.registerTool(
    "get_project_design",
    {
      title: "Get the raw design",
      description:
        "The raw design document (JSON) for exact values. Prefer get_project_brief for reading and get_component for one part.",
      inputSchema: z.object({ project: ProjectArg, version: VersionArg }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      return jsonResult({
        project: { slug: t.project.slug, name: t.project.name, description: t.project.description },
        revision: t.revision,
        version: t.version,
        document: t.document,
      });
    }),
  );

  server.registerTool(
    "list_components",
    {
      title: "List components",
      description: "List components (nodes), optionally filtered by kind or parent.",
      inputSchema: z.object({
        project: ProjectArg,
        version: VersionArg,
        kind: z.enum(NODE_KINDS).optional().describe("Only components of this kind."),
        parentId: z.string().optional().describe("Only direct children of this component id."),
      }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      return jsonResult(
        t.document.nodes
          .filter(
            (n) =>
              (!args.kind || n.kind === args.kind) &&
              (!args.parentId || n.parentId === args.parentId),
          )
          .map((n) => ({
            id: n.id,
            kind: n.kind,
            name: n.name,
            path: t.index.path(n.id),
            parentId: n.parentId,
            status: t.statuses.get(n.id) ?? null,
          })),
      );
    }),
  );

  server.registerTool(
    "get_component",
    {
      title: "Get one component",
      description:
        "Everything needed to implement one component: its definition, where it sits, what it depends on and what depends on it, the stack and conventions that apply to it, and its status.",
      inputSchema: z.object({
        project: ProjectArg,
        version: VersionArg,
        id: z.string().describe("Component id, or its exact name."),
      }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      const { index } = t;
      const node = findNode(index, args.id);
      const parent = node.parentId ? index.node(node.parentId) : undefined;
      const layer = index.layerOf(node.id);
      const status = t.statusInfo.get(node.id);
      return jsonResult({
        component: node,
        path: index.path(node.id),
        parent: parent ? brief(parent) : null,
        children: index.children(node.id).map(brief),
        relations: {
          outgoing: index.outgoing(node.id).map((e) => ({
            edgeId: e.id,
            kind: e.kind,
            label: e.label,
            data: e.data,
            target: brief(index.node(e.target)!),
          })),
          incoming: index.incoming(node.id).map((e) => ({
            edgeId: e.id,
            kind: e.kind,
            label: e.label,
            data: e.data,
            source: brief(index.node(e.source)!),
          })),
        },
        stack: index.stackFor(node.id),
        conventions: index.conventionsFor(node.id),
        ...(layer
          ? {
              allowedLayerDependencies: index
                .outgoing(layer.id, "depends_on")
                .map((e) => index.node(e.target)!)
                .map((n) => ({ id: n.id, name: n.name })),
            }
          : {}),
        status: status
          ? { status: status.status, note: status.note, updatedAt: status.updatedAt }
          : null,
      });
    }),
  );

  server.registerTool(
    "resolve_file_to_component",
    {
      title: "Resolve file to architecture component",
      description:
        "Map a source file path (e.g. 'apps/api/src/domain/task.ts') to its owning architectural component, service, layer, layer rules, allowed dependencies, technology stack, and conventions.",
      inputSchema: z.object({
        project: ProjectArg,
        version: VersionArg,
        filePath: z
          .string()
          .min(1)
          .describe(
            "Relative or absolute path of the file to inspect (e.g. 'apps/api/src/domain/task.ts').",
          ),
      }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      const res = resolveFileToComponent(t.index, args.filePath);
      if (!res.matched) {
        return jsonResult(res);
      }
      const status = t.statusInfo.get(res.component.id);
      return jsonResult({
        ...res,
        status: status
          ? { status: status.status, note: status.note, updatedAt: status.updatedAt }
          : null,
      });
    }),
  );
}
