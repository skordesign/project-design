import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";

import { DELETE, GET, POST } from "@/app/api/mcp/route";
import { TEAM_TASKS_EXAMPLE, teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { getDb } from "@/server/db/client";
import { createProject } from "@/server/services/projects";
import { createToken, revokeToken } from "@/server/services/tokens";
import { resetDb, testUser } from "./helpers/db";

const MCP_URL = new URL("http://localhost:3000/api/mcp");

/** Routes the SDK client's HTTP calls straight into the Next route handlers. */
const routeFetch = async (input: string | URL | Request, init?: RequestInit) => {
  const request = new Request(input, init);
  const handler = { GET, POST, DELETE }[request.method as "GET" | "POST" | "DELETE"];
  return handler ? handler(request) : new Response(null, { status: 405 });
};

async function connect(token: string) {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(MCP_URL, {
      fetch: routeFetch,
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

const text = (result: Awaited<ReturnType<Client["callTool"]>>) =>
  JSON.parse((result.content as { type: string; text: string }[])[0].text);

describe("MCP endpoint", () => {
  beforeEach(resetDb);

  it("rejects requests without a valid token", async () => {
    const res = await POST(new Request(MCP_URL, { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    await expect(connect("pd_nope")).rejects.toThrow();
  });

  it("lists tools and reads a project", async () => {
    const db = getDb();
    await createProject(db, {
      ownerId: (await testUser()).id,
      ...TEAM_TASKS_EXAMPLE,
      document: teamTasksDesign,
    });
    const { token } = await createToken(db, { userId: (await testUser()).id, name: "test" });
    const client = await connect(token);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      "add_component",
      "add_game_system",
      "apply_service_template",
      "connect_components",
      "get_agent_rules",
      "get_api_contract",
      "get_architecture_diagram",
      "get_build_plan",
      "get_compliance_report",
      "get_component",
      "get_data_model",
      "get_design_changes",
      "get_design_schema",
      "get_project_brief",
      "get_project_design",
      "get_project_scaffold",
      "list_components",
      "list_projects",
      "remove_components",
      "remove_connections",
      "remove_section_items",
      "resolve_file_to_component",
      "save_project_design",
      "set_component_status",
      "update_component",
      "update_connection",
      "update_overview",
      "upsert_section_items",
      "validate_design",
    ]);

    const projects = text(await client.callTool({ name: "list_projects", arguments: {} }));
    expect(projects).toMatchObject([{ slug: "team-tasks", name: "Team Tasks", revision: 1 }]);

    const design = text(
      await client.callTool({ name: "get_project_design", arguments: { project: "team-tasks" } }),
    );
    expect(design.document.nodes.length).toBe(teamTasksDesign.nodes!.length);
    await client.close();
  });

  it("scopes project tokens and honours revocation", async () => {
    const db = getDb();
    const a = await createProject(db, {
      ownerId: (await testUser()).id,
      ...TEAM_TASKS_EXAMPLE,
      document: teamTasksDesign,
    });
    await createProject(db, {
      ownerId: (await testUser()).id,
      name: "Other",
      slug: "other",
      document: { schemaVersion: 1 },
    });
    const scoped = await createToken(db, {
      userId: (await testUser()).id,
      name: "scoped",
      projectId: a.id,
    });

    const client = await connect(scoped.token);
    const projects = text(await client.callTool({ name: "list_projects", arguments: {} }));
    expect(projects.map((p: { slug: string }) => p.slug)).toEqual(["team-tasks"]);
    const other = await client.callTool({
      name: "get_project_design",
      arguments: { project: "other" },
    });
    expect(other.isError).toBe(true);
    await client.close();

    await revokeToken(db, scoped.id, (await testUser()).id);
    await expect(connect(scoped.token)).rejects.toThrow();
  });
});
