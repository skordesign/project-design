import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { toAgentsMd, toCursorRules, toMcpConfig } from "@/lib/design/agent-rules";
import { dataModel, toMermaidEr, toSqlDdl } from "@/lib/design/datamodel";
import type { DesignIndex } from "@/lib/design/graph";
import { generateProjectScaffold, ScaffoldError, toScaffoldTreeAscii } from "@/lib/design/scaffold";
import { toMermaidArchitecture, toMermaidSequence } from "@/lib/design/mermaid";
import { toOpenApi } from "@/lib/design/openapi";
import type { NodeOfKind, TypeShape } from "@/lib/design/schema";
import {
  brief,
  findNode,
  guarded,
  jsonResult,
  ProjectArg,
  resolveTarget,
  textResult,
  ToolError,
  VersionArg,
  type McpContext,
} from "@/server/mcp/context";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

/** Entities an API's operations mention, directly or through `ref` fields. */
function entitiesOf(index: DesignIndex, api: NodeOfKind<"api">) {
  const seen = new Set<string>();
  const visit = (id: string | null) => {
    if (!id || seen.has(id)) return;
    const entity = index.node(id);
    if (entity?.kind !== "entity") return;
    seen.add(id);
    for (const f of entity.data.fields) visit(f.refEntityId);
  };
  const shape = (s: TypeShape | null) => {
    if (!s) return;
    visit(s.entityId);
    for (const f of s.fields) visit(f.refEntityId);
  };
  for (const op of api.data.operations) {
    shape(op.request);
    shape(op.response);
  }
  return [...seen].map((id) => index.node(id)!);
}

export function registerContractTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "get_api_contract",
    {
      title: "Get an API contract",
      description:
        "The contract of one API. REST APIs are returned as OpenAPI 3.1; use format json for other styles.",
      inputSchema: z.object({
        project: ProjectArg,
        version: VersionArg,
        api: z.string().describe("API id, or its exact name."),
        format: z.enum(["openapi", "json"]).default("openapi"),
      }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      const api = findNode(t.index, args.api, ["api"]) as NodeOfKind<"api">;
      if (args.format === "openapi") {
        const spec = toOpenApi(t.index, api.id);
        if (!spec) {
          throw new ToolError(
            `"${api.name}" is a ${api.data.style} API, which has no OpenAPI form. Use format "json".`,
          );
        }
        return jsonResult(spec);
      }
      return jsonResult({
        api,
        implementedBy: t.index
          .incoming(api.id, "exposes")
          .map((e) => ({ ...brief(t.index.node(e.source)!), operations: e.data.operations })),
        consumedBy: t.index.incoming(api.id, "calls").map((e) => ({
          ...brief(t.index.node(e.source)!),
          operations: e.data.operations,
        })),
        entities: entitiesOf(t.index, api),
      });
    }),
  );

  server.registerTool(
    "get_data_model",
    {
      title: "Get the data model",
      description:
        "Entities, fields, indexes and relations, for one datastore or all of them, as JSON or a Mermaid ER diagram.",
      inputSchema: z.object({
        project: ProjectArg,
        version: VersionArg,
        datastore: z.string().optional().describe("Datastore id or exact name; omit for all."),
        format: z.enum(["json", "mermaid", "sql"]).default("json"),
      }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      const store = args.datastore ? findNode(t.index, args.datastore, ["datastore"]) : undefined;
      const model = dataModel(t.index, store?.id);
      if (args.format === "sql") return textResult(toSqlDdl(model));
      return args.format === "mermaid" ? textResult(toMermaidEr(model)) : jsonResult(model);
    }),
  );

  server.registerTool(
    "get_architecture_diagram",
    {
      title: "Get architecture diagram",
      description:
        "The architecture diagram rendered as Mermaid markdown. Supports high-level flowchart (graph LR/TD) and runtime sequence diagrams (sequenceDiagram).",
      inputSchema: z.object({
        project: ProjectArg,
        version: VersionArg,
        type: z
          .enum(["flowchart", "sequence"])
          .default("flowchart")
          .describe("Diagram type: flowchart (static architecture) or sequence (runtime flow)."),
        tag: z
          .string()
          .optional()
          .describe("Tag filter for sequence diagram flows (e.g. 'auth', 'payment')."),
        direction: z
          .enum(["LR", "TD"])
          .default("LR")
          .describe("Direction of the flowchart (LR = Left to Right, TD = Top to Down)."),
        includeNotes: z
          .boolean()
          .default(false)
          .describe("Whether to include freeform sticky notes in the diagram."),
      }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      if (args.type === "sequence") {
        return textResult(toMermaidSequence(t.document, args.tag));
      }
      const mmd = toMermaidArchitecture(t.document, {
        direction: args.direction,
        includeNotes: args.includeNotes,
      });
      return textResult(mmd);
    }),
  );

  server.registerTool(
    "get_agent_rules",
    {
      title: "Get agent rules & guardrails",
      description:
        "Guidelines and IDE rules tailored to this architecture design: AGENTS.md / CLAUDE.md, .cursorrules, or .mcp.json. Enforces architecture guardrails and Clean Architecture layer boundaries on coding agents.",
      inputSchema: z.object({
        project: ProjectArg,
        version: VersionArg,
        format: z
          .enum(["agents.md", "cursorrules", "claude.md", "mcp.json"])
          .default("agents.md")
          .describe(
            "Rule file format: agents.md (standard markdown guidelines), cursorrules (compact Cursor IDE rules), claude.md (Claude Code guidelines), or mcp.json (MCP server config).",
          ),
      }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      const meta = {
        name: t.project.name,
        slug: t.project.slug,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      };
      if (args.format === "cursorrules") {
        return textResult(toCursorRules(t.document, meta));
      }
      if (args.format === "mcp.json") {
        return textResult(toMcpConfig(meta));
      }
      return textResult(toAgentsMd(t.document, meta));
    }),
  );

  server.registerTool(
    "get_project_scaffold",
    {
      title: "Get project codebase scaffold",
      description:
        "Generates the full project codebase skeleton (directory tree, package configs, stubs, DDL, and contracts) based on the architecture design.",
      inputSchema: z.object({
        project: ProjectArg,
        version: VersionArg,
        service: z
          .string()
          .optional()
          .describe("Optional service id or name to generate scaffold for only that service."),
        format: z
          .enum(["tree", "files", "summary"])
          .default("tree")
          .describe(
            "Output format: 'tree' (ASCII folder tree), 'files' (JSON list of all files and code contents), or 'summary' (list of paths and descriptions).",
          ),
      }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      const meta = {
        name: t.project.name,
        slug: t.project.slug,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      };
      const serviceNode = args.service ? findNode(t.index, args.service, ["service"]) : undefined;
      let scaffold;
      try {
        scaffold = generateProjectScaffold(t.document, meta, {
          serviceId: serviceNode?.id,
        });
      } catch (error) {
        if (error instanceof ScaffoldError) throw new ToolError(error.message);
        throw error;
      }

      if (args.format === "tree") {
        return textResult(toScaffoldTreeAscii(scaffold));
      }
      if (args.format === "summary") {
        return jsonResult({
          layout: scaffold.layout,
          packageManager: scaffold.packageManager,
          fileCount: scaffold.files.length,
          files: scaffold.files.map((f) => ({ path: f.path, description: f.description })),
          directories: scaffold.directories,
        });
      }
      return jsonResult(scaffold);
    }),
  );
}
