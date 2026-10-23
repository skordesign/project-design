import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { resolveSlug, type McpContext } from "@/server/mcp/context";
import { getProject } from "@/server/services/projects";

/** "the project" when the argument is missing and several projects are visible. */
async function describeProject(ctx: McpContext, project?: string) {
  try {
    const slug = await resolveSlug(ctx, project);
    const row = await getProject(ctx.db, slug, ctx.principal);
    return { name: row.name, slug: row.slug };
  } catch {
    return null;
  }
}

const user = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});

const ProjectOnly = z.object({
  project: z.string().optional().describe("Project slug; optional when only one is visible."),
});

export function registerPrompts(server: McpServer, ctx: McpContext) {
  server.registerPrompt(
    "implement_design",
    {
      title: "Implement the design",
      description: "Implement a project from its design, step by step, reporting progress.",
      argsSchema: ProjectOnly,
    },
    async ({ project }) => {
      const p = await describeProject(ctx, project);
      const subject = p ? `the project "${p.name}" (\`${p.slug}\`)` : "the project";
      return user(
        `You are implementing ${subject} from its design in the project-designer MCP server.\n` +
          "COMPLIANCE RULES (a CI gate calls get_compliance_report on this work):\n" +
          "- Read `get_design_schema` once and `get_project_brief` in full BEFORE writing any code. MUST conventions and layer rules are hard constraints, not suggestions.\n" +
          "- Work through `get_build_plan` in order. For each step, call `get_component` (and `get_api_contract` / `get_data_model` where relevant) before writing code.\n" +
          "- Report every step with `set_component_status`: `in_progress` when you start it, `done` only once it builds and its tests pass, `blocked` with a note when the design stops you. Never leave a started step unreported, and never mark `done` what you have not run.\n" +
          "1. Don't invent components, endpoints, fields or dependencies that are not in the design. If the design is missing something you need, set the step `blocked` and say exactly what is missing.\n" +
          "2. When you're finished, call `validate_design` and `get_compliance_report`, and report anything that affected the implementation.",
      );
    },
  );

  server.registerPrompt(
    "sync_design_changes",
    {
      title: "Sync design changes",
      description: "Update an existing codebase after the design changed since a version.",
      argsSchema: ProjectOnly.extend({
        since: z.string().describe("Version number the codebase was last generated from."),
      }),
    },
    async ({ project, since }) => {
      const p = await describeProject(ctx, project);
      return user(
        `Call \`get_design_changes\` with \`from: ${since}\`${p ? ` for project \`${p.slug}\`` : ""}. ` +
          "Update the existing codebase so it matches the current draft. Change only what the diff requires, keep the existing code style, and update the status of each component you touch. List any change you could not apply.",
      );
    },
  );

  server.registerPrompt(
    "review_against_design",
    {
      title: "Review against the design",
      description: "Review this repository against the project's design without changing code.",
      argsSchema: ProjectOnly,
    },
    async ({ project }) => {
      const p = await describeProject(ctx, project);
      return user(
        `Read \`get_project_brief\`${p ? ` for project \`${p.slug}\`` : ""}, then review this repository against it. ` +
          "List the deviations, grouped as: missing components, extra or forbidden dependencies (layer rules), API mismatches (paths, methods, payloads), data model mismatches, stack or convention violations. Cite file paths. Don't change code.",
      );
    },
  );
}
