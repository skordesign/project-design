import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { buildPlan } from "@/lib/design/build-plan";
import {
  evaluateCompliance,
  renderComplianceMarkdown,
  type StatusDetail,
} from "@/lib/design/compliance";
import { diffDesigns, renderDiffMarkdown } from "@/lib/design/diff";
import { indexDesign } from "@/lib/design/graph";
import { COMPONENT_STATUSES } from "@/lib/design/status";
import { validateDesign } from "@/lib/design/validate";
import {
  guarded,
  jsonResult,
  ProjectArg,
  resolveSlug,
  resolveTarget,
  ToolError,
  VersionArg,
  type McpContext,
} from "@/server/mcp/context";
import { setComponentStatus } from "@/server/services/status";
import { resolveDocument } from "@/server/services/versions";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export function registerPlanTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "get_compliance_report",
    {
      title: "Get the compliance report",
      description:
        "Did the implementation follow the design, and how far did it get? Totals per status, blocked and stale steps, validation counts and a pass/fail gate. Use for progress checks and CI gates; the design-gate script calls this tool.",
      inputSchema: z.object({
        project: ProjectArg,
        version: VersionArg,
        minDonePercent: z
          .number()
          .min(0)
          .max(100)
          .default(0)
          .describe("Gate fails below this percent of done steps."),
        failOnBlocked: z.boolean().default(false).describe("Gate fails when any step is blocked."),
        failOnStale: z
          .boolean()
          .default(false)
          .describe("Gate fails when any in_progress step is stale."),
        staleHours: z
          .number()
          .positive()
          .default(24)
          .describe("An in_progress step untouched this long counts as stale."),
      }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      const steps = buildPlan(t.index, t.statuses);
      const details = new Map<string, StatusDetail>(
        [...t.statusInfo].map(([id, s]) => [
          id,
          { status: s.status, note: s.note, updatedAt: s.updatedAt },
        ]),
      );
      const issues = validateDesign(t.document);
      const report = evaluateCompliance(
        { steps, details, issues },
        {
          minDonePercent: args.minDonePercent,
          failOnBlocked: args.failOnBlocked,
          failOnStale: args.failOnStale,
          staleHours: args.staleHours,
        },
      );
      const ref = t.version ? `version ${t.version.number}` : `draft revision ${t.revision}`;
      return jsonResult({
        project: { slug: t.project.slug, name: t.project.name },
        ref,
        revision: t.revision,
        version: t.version,
        report,
        summary: renderComplianceMarkdown(t.project, ref, report),
      });
    }),
  );

  server.registerTool(
    "get_build_plan",
    {
      title: "Get the build plan",
      description:
        "A dependency-ordered list of implementation steps. Work through it in order, calling get_component for each step.",
      inputSchema: z.object({ project: ProjectArg, version: VersionArg }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      return jsonResult({ steps: buildPlan(t.index, t.statuses) });
    }),
  );

  server.registerTool(
    "validate_design",
    {
      title: "Validate the design",
      description:
        "Check the design for problems (broken rules, unused or unimplemented parts, layer violations). Report warnings that affect your work instead of guessing.",
      inputSchema: z.object({ project: ProjectArg, version: VersionArg }),
      annotations: READ_ONLY,
    },
    guarded(async (args) => {
      const t = await resolveTarget(ctx, args);
      const issues = validateDesign(t.document);
      const count = (severity: string) => issues.filter((i) => i.severity === severity).length;
      return jsonResult({
        errors: count("error"),
        warnings: count("warning"),
        infos: count("info"),
        issues,
      });
    }),
  );

  server.registerTool(
    "get_design_changes",
    {
      title: "Get design changes",
      description:
        "What changed in the design between two versions (or a version and the draft). Use to update an existing codebase incrementally.",
      inputSchema: z.object({
        project: ProjectArg,
        from: z.number().int().positive().describe("Version number to compare from."),
        to: z
          .union([z.literal("draft"), z.number().int().positive()])
          .default("draft")
          .describe('Version number or "draft" (default) to compare to.'),
      }),
      annotations: READ_ONLY,
    },
    guarded(async ({ project, from, to }) => {
      const slug = await resolveSlug(ctx, project);
      const before = await resolveDocument(ctx.db, slug, from, ctx.principal);
      const after = await resolveDocument(ctx.db, slug, to, ctx.principal);
      const diff = diffDesigns(before.document, after.document);
      return jsonResult({
        from,
        to,
        summary: renderDiffMarkdown(
          diff,
          indexDesign(after.document),
          indexDesign(before.document),
        ),
        diff,
      });
    }),
  );

  server.registerTool(
    "set_component_status",
    {
      title: "Set component status",
      description:
        "Record implementation progress for a component (shown on the canvas). Set in_progress when you start, done when it builds and its tests pass, blocked with a note if the design stops you.",
      inputSchema: z.object({
        project: ProjectArg,
        id: z.string().describe("Component id (from the draft)."),
        status: z.enum(COMPONENT_STATUSES),
        note: z.string().max(2000).optional(),
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    guarded(async ({ project, id, status, note }) => {
      const t = await resolveTarget(ctx, { project, version: "draft" });
      if (!t.index.node(id)) {
        throw new ToolError(`No component with id "${id}" in the draft. Use list_components.`);
      }
      await setComponentStatus(ctx.db, t.project.id, id, { status, note }, ctx.principal.tokenId);
      return jsonResult({ ok: true, id, status });
    }),
  );
}
