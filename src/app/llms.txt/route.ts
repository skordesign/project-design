import { connection } from "next/server";

import { env } from "@/server/env";

/**
 * Instructions for AI agents (the llms.txt convention): what this server is,
 * how to connect over MCP, and the mandatory design-first workflow.
 * Plain text, no auth — like a robots.txt for agents.
 */
export async function GET() {
  // APP_URL differs per deployment, so this must render per request.
  await connection();
  const appUrl = env().APP_URL.replace(/\/$/, "");
  const body = `# Project Design — instructions for AI coding agents

> You are working with a project whose architecture lives here, not in anyone's
> head. Read the design FIRST, build what it says, report progress per component.

## Connect

- MCP endpoint (Streamable HTTP): ${appUrl}/api/mcp
- Auth: header \`Authorization: Bearer <token>\`. Create a token in the app under
  Settings → MCP tokens (scope it to one project per generated repository).
- Protocol: Model Context Protocol. Start with \`list_projects\`, then
  \`get_design_schema\` once per session.

## Mandatory workflow

1. \`get_design_schema\` — what every node/edge kind means, plus the JSON Schema.
2. \`get_project_brief\` — the whole design as markdown. Read ALL of it. MUST
   conventions and layer rules are hard constraints, not suggestions.
3. \`get_build_plan\` — dependency-ordered steps. Work through them in order;
   call \`get_component\` (and \`get_api_contract\` / \`get_data_model\` where
   relevant) before writing code for each step.
4. \`set_component_status\` — report EVERY step: \`in_progress\` when you start,
   \`done\` only once it builds and its tests pass, \`blocked\` with a note when
   the design stops you. A CI gate calls \`get_compliance_report\` on this work.
5. Never invent components, endpoints, fields or dependencies not in the design.
   If something is missing, mark the step \`blocked\` and say exactly what.
6. Finish with \`validate_design\` and \`get_compliance_report\`.

## Prompts (run these when asked)

- \`implement_design\` — build the project step by step, reporting progress.
- \`sync_design_changes\` — update code from the diff since a version.
- \`review_against_design\` — list where the code drifted, without changing code.

## Resources

- \`design://schema\` — the design JSON Schema.
- \`design://projects/{slug}/brief\` — the markdown brief.
- \`design://projects/{slug}/document\` — the raw design document.
- Every read tool accepts \`version\`: \`"draft"\` (default), \`"latest"\` or a
  version number. Build against a published snapshot while humans keep editing.
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
