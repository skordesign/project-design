import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";

import { DELETE, GET, POST } from "@/app/api/mcp/route";
import { renderBrief } from "@/lib/design/brief";
import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { parseDesign } from "@/lib/design/integrity";
import { NODE_KINDS } from "@/lib/design/schema";
import { getDb } from "@/server/db/client";
import { createProject, getProject, saveDraft } from "@/server/services/projects";
import { createToken } from "@/server/services/tokens";
import { publishVersion } from "@/server/services/versions";
import { resetDb, testUser } from "./helpers/db";

const MCP_URL = new URL("http://localhost:3000/api/mcp");
const db = getDb();

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

type Result = Awaited<ReturnType<Client["callTool"]>>;
const raw = (r: Result) => (r.content as { type: string; text: string }[])[0]!.text;
const json = (r: Result) => JSON.parse(raw(r));

async function seed() {
  const project = await createProject(db, {
    ownerId: (await testUser()).id,
    name: "Team Tasks",
    description: "Task tracker for small teams, with email notifications.",
    document: teamTasksDesign,
  });
  const { token } = await createToken(db, { userId: (await testUser()).id, name: "all" });
  return { project, client: await connect(token) };
}

const call = (client: Client, name: string, args: Record<string, unknown> = {}) =>
  client.callTool({ name, arguments: args });

describe("MCP tools", () => {
  beforeEach(resetDb);

  it("get_project_brief equals the renderer's output", async () => {
    const { client } = await seed();
    const brief = raw(await call(client, "get_project_brief"));
    expect(brief).toBe(
      renderBrief({
        project: {
          name: "Team Tasks",
          slug: "team-tasks",
          description: "Task tracker for small teams, with email notifications.",
        },
        document: parseDesign(teamTasksDesign),
        revision: 1,
        version: null,
        statuses: new Map(),
      }),
    );
    await client.close();
  });

  it("serves every read tool against the example", async () => {
    const { client } = await seed();

    const schema = json(await call(client, "get_design_schema"));
    expect(Object.keys(schema.nodeKinds)).toHaveLength(NODE_KINDS.length);
    expect(schema.guide).toContain("Containment");
    expect(schema.jsonSchema.type).toBe("object");

    const design = json(await call(client, "get_project_design"));
    expect(design).toMatchObject({ project: { slug: "team-tasks" }, revision: 1, version: null });

    const services = json(await call(client, "list_components", { kind: "service" }));
    expect(services.map((c: { id: string }) => c.id)).toEqual([
      "svc_web",
      "svc_api",
      "svc_notifier",
    ]);
    const children = json(await call(client, "list_components", { parentId: "svc_api" }));
    expect(children).toHaveLength(4);

    const component = json(await call(client, "get_component", { id: "Task use cases" }));
    expect(component.component.id).toBe("mod_usecases");
    expect(component.path).toBe("API › Application › Task use cases");
    expect(component.parent.id).toBe("lyr_app");
    expect(component.relations.outgoing[0]).toMatchObject({
      kind: "depends_on",
      target: { id: "mod_domain" },
    });
    expect(component.relations.incoming[0].source.id).toBe("mod_routes");
    expect(component.allowedLayerDependencies).toEqual([{ id: "lyr_domain", name: "Domain" }]);
    expect(component.stack.map((s: { id: string }) => s.id)).toContain("stk_api");
    expect(component.conventions.map((c: { id: string }) => c.id)).toContain("cnv_errors");
    expect(component.status).toBeNull();

    const openapi = json(await call(client, "get_api_contract", { api: "Tasks REST API" }));
    expect(openapi.openapi).toBe("3.1.0");
    const apiJson = json(
      await call(client, "get_api_contract", { api: "api_rest", format: "json" }),
    );
    expect(apiJson.implementedBy[0].id).toBe("svc_api");
    expect(apiJson.consumedBy[0].id).toBe("mod_web_tasks");
    expect(apiJson.entities.map((e: { id: string }) => e.id)).toEqual(["ent_task"]);

    const model = json(await call(client, "get_data_model"));
    expect(model.datastores[0].entities).toHaveLength(3);
    const mermaid = raw(
      await call(client, "get_data_model", { datastore: "Main database", format: "mermaid" }),
    );
    expect(mermaid.startsWith("erDiagram")).toBe(true);

    const sqlModel = raw(
      await call(client, "get_data_model", { datastore: "Main database", format: "sql" }),
    );
    expect(sqlModel).toContain("CREATE TABLE IF NOT EXISTS");

    const archDiagram = raw(await call(client, "get_architecture_diagram"));
    expect(archDiagram.startsWith("flowchart LR")).toBe(true);
    expect(archDiagram).toContain("svc_web");
    expect(archDiagram).toContain("svc_api");

    const seqDiagram = raw(await call(client, "get_architecture_diagram", { type: "sequence" }));
    expect(seqDiagram.startsWith("sequenceDiagram")).toBe(true);
    expect(seqDiagram).toContain("participant");

    const agentsMd = raw(await call(client, "get_agent_rules"));
    expect(agentsMd).toContain("# Team Tasks — Coding Agent Guidelines & Architecture Rules");
    expect(agentsMd).toContain("Strict Layer Boundaries (Dependency Matrix)");

    const cursorRules = raw(await call(client, "get_agent_rules", { format: "cursorrules" }));
    expect(cursorRules).toContain("# Cursor Rules for Team Tasks");

    const mcpConfig = json(await call(client, "get_agent_rules", { format: "mcp.json" }));
    expect(mcpConfig.mcpServers["project-design"]).toBeDefined();

    const scaffoldTree = raw(await call(client, "get_project_scaffold"));
    expect(scaffoldTree).toContain(". (project root)");
    expect(scaffoldTree).toContain("AGENTS.md");
    expect(scaffoldTree).toContain("apps/");

    const scaffoldSummary = json(await call(client, "get_project_scaffold", { format: "summary" }));
    expect(scaffoldSummary.fileCount).toBeGreaterThan(10);
    expect(scaffoldSummary.layout).toBe("monorepo");

    const resolved = json(
      await call(client, "resolve_file_to_component", {
        filePath: "apps/api/src/domain/task.ts",
      }),
    );
    expect(resolved.matched).toBe(true);
    expect(resolved.component.id).toBe("lyr_domain");
    expect(resolved.service.id).toBe("svc_api");
    expect(resolved.layerRules).toContain("No framework or database imports");
    expect(resolved.stack.map((s: { id: string }) => s.id)).toContain("stk_lang");

    const unresolved = json(
      await call(client, "resolve_file_to_component", {
        filePath: "nonexistent/random/file.txt",
      }),
    );
    expect(unresolved.matched).toBe(false);

    const plan = json(await call(client, "get_build_plan"));
    expect(plan.steps[0].id).toBe("setup");

    const validation = json(await call(client, "validate_design"));
    expect(validation).toMatchObject({ errors: 0, warnings: 0 });
    await client.close();
  });

  it("reports ambiguous and unknown references as tool errors", async () => {
    const { project, client } = await seed();
    await createProject(db, {
      ownerId: (await testUser()).id,
      name: "Other",
      document: { schemaVersion: 1 },
    });

    const several = await call(client, "get_project_brief");
    expect(several.isError).toBe(true);
    expect(raw(several)).toBe("Several projects are available: other, team-tasks. Pass project.");

    const unknown = await call(client, "get_project_brief", { project: "nope" });
    expect(unknown.isError).toBe(true);
    expect(raw(unknown)).toContain('Unknown project "nope". Available: other, team-tasks');

    const missing = await call(client, "get_component", { project: project.slug, id: "ghost" });
    expect(missing.isError).toBe(true);

    // Two nodes share a name, so a name lookup must list candidates.
    const row = await getProject(db, project.slug);
    const doc = structuredClone(row.document);
    doc.nodes.push({
      ...doc.nodes.find((n) => n.id === "mod_domain")!,
      id: "mod_dup",
      parentId: "lyr_app",
    });
    await saveDraft(db, project.slug, { revision: row.revision, document: doc });
    const ambiguous = await call(client, "get_component", {
      project: project.slug,
      id: "Task model",
    });
    expect(ambiguous.isError).toBe(true);
    expect(raw(ambiguous)).toContain(
      "Task model [mod_domain] (module), Task model [mod_dup] (module)",
    );

    const wrongKind = await call(client, "get_api_contract", { project: project.slug, api: "API" });
    expect(wrongKind.isError).toBe(true);
    const restOk = await call(client, "get_api_contract", {
      project: project.slug,
      api: "api_rest",
    });
    expect(restOk.isError).toBeFalsy();
    await client.close();
  });

  it("reports an unscaffoldable design as a tool error, not a protocol error", async () => {
    const { client } = await seed();
    const single = await createProject(db, {
      ownerId: (await testUser()).id,
      name: "Single",
      document: {
        ...teamTasksDesign,
        overview: {
          ...teamTasksDesign.overview,
          repository: { layout: "single-package", packageManager: "npm" },
        },
      },
    });
    const res = await call(client, "get_project_scaffold", { project: single.slug });
    expect(res.isError).toBe(true);
    expect(raw(res)).toContain("Single-package layout cannot scaffold");
    await client.close();
  });

  it("suggests json for a non-REST API", async () => {
    const { project, client } = await seed();
    const row = await getProject(db, project.slug);
    const doc = structuredClone(row.document);
    const api = doc.nodes.find((n) => n.id === "api_rest")!;
    if (api.kind === "api") api.data.style = "graphql";
    await saveDraft(db, project.slug, { revision: row.revision, document: doc });
    const result = await call(client, "get_api_contract", { api: "api_rest" });
    expect(result.isError).toBe(true);
    expect(raw(result)).toContain('format "json"');
    await client.close();
  });

  it('version "latest" fails before publishing and pins the snapshot afterwards', async () => {
    const { project, client } = await seed();
    const before = await call(client, "get_project_brief", { version: "latest" });
    expect(before.isError).toBe(true);
    expect(raw(before)).toBe('No published version yet; use version "draft"');

    await publishVersion(db, project.slug, { label: "first" });
    const row = await getProject(db, project.slug);
    const doc = structuredClone(row.document);
    doc.overview.summary = "Changed after publishing";
    await saveDraft(db, project.slug, { revision: row.revision, document: doc });

    const latest = raw(await call(client, "get_project_brief", { version: "latest" }));
    expect(latest).toContain("version 1 (first)");
    expect(latest).not.toContain("Changed after publishing");
    expect(raw(await call(client, "get_project_brief"))).toContain("Changed after publishing");
    expect(raw(await call(client, "get_project_brief", { version: 1 }))).toContain(
      "version 1 (first)",
    );
    await client.close();
  });

  it("get_design_changes reports edits since a version", async () => {
    const { project, client } = await seed();
    await publishVersion(db, project.slug, {});
    const row = await getProject(db, project.slug);
    const doc = structuredClone(row.document);
    doc.nodes = doc.nodes.filter((n) => n.id !== "nte_scope");
    await saveDraft(db, project.slug, { revision: row.revision, document: doc });

    const changes = json(await call(client, "get_design_changes", { from: 1 }));
    expect(changes.diff.isEmpty).toBe(false);
    expect(changes.summary).toContain("- Removed note **Scope** [nte_scope]");
    expect(json(await call(client, "get_design_changes", { from: 1, to: 1 })).diff.isEmpty).toBe(
      true,
    );
    const missing = await call(client, "get_design_changes", { from: 9 });
    expect(missing.isError).toBe(true);
    await client.close();
  });

  it("set_component_status shows up in the plan, the brief and get_component", async () => {
    const { client } = await seed();
    const ok = json(
      await call(client, "set_component_status", { id: "svc_api", status: "done", note: "built" }),
    );
    expect(ok).toEqual({ ok: true, id: "svc_api", status: "done" });

    const plan = json(await call(client, "get_build_plan"));
    expect(plan.steps.find((s: { id: string }) => s.id === "svc_api").status).toBe("done");
    expect(raw(await call(client, "get_project_brief"))).toContain("status: done");
    const component = json(await call(client, "get_component", { id: "svc_api" }));
    expect(component.status).toMatchObject({ status: "done", note: "built" });

    const bad = await call(client, "set_component_status", { id: "nope", status: "done" });
    expect(bad.isError).toBe(true);
    await client.close();
  });

  it("lets a scoped token omit the project", async () => {
    const { project } = await seed();
    await createProject(db, {
      ownerId: (await testUser()).id,
      name: "Other",
      document: { schemaVersion: 1 },
    });
    const scoped = await createToken(db, {
      userId: (await testUser()).id,
      name: "scoped",
      projectId: project.id,
    });
    const client = await connect(scoped.token);
    expect(raw(await call(client, "get_project_brief"))).toContain("# Team Tasks — design brief");
    const other = await call(client, "get_project_brief", { project: "other" });
    expect(other.isError).toBe(true);
    await client.close();
  });
});

describe("MCP edit tools", () => {
  beforeEach(resetDb);

  it("adds, updates, connects and removes components in the draft", async () => {
    const { project, client } = await seed();

    const added = json(
      await call(client, "add_component", {
        kind: "module",
        name: "Billing",
        parent: "Application",
        data: { responsibilities: ["Charge teams"] },
      }),
    );
    expect(added.id).toMatch(/^mod_/);
    expect(added.revision).toBe(2);
    expect(added.component).toMatchObject({ parentId: "lyr_app", data: { path: "" } });

    const updated = json(
      await call(client, "update_component", {
        id: "Billing",
        description: "Invoices",
        data: { path: "src/billing" },
      }),
    );
    expect(updated.component).toMatchObject({
      name: "Billing",
      description: "Invoices",
      data: { path: "src/billing", responsibilities: ["Charge teams"] },
    });

    const edge = json(
      await call(client, "connect_components", { source: added.id, target: "mod_domain" }),
    );
    expect(edge.connection).toMatchObject({ kind: "depends_on", target: "mod_domain" });
    const duplicate = await call(client, "connect_components", {
      source: added.id,
      target: "mod_domain",
    });
    expect(duplicate.isError).toBe(true);
    const badKind = await call(client, "connect_components", {
      source: added.id,
      target: "mod_domain",
      kind: "relation",
    });
    expect(raw(badKind)).toContain("Allowed kinds: depends_on");

    const relabelled = json(
      await call(client, "update_connection", { id: edge.id, label: "uses model" }),
    );
    expect(relabelled.connection.label).toBe("uses model");

    const component = json(await call(client, "get_component", { id: added.id }));
    expect(component.relations.outgoing[0].edgeId).toBe(edge.id);

    await call(client, "update_component", { id: "Task", position: { x: 20, y: 600 } });
    const moved = (await getProject(db, project.slug)).document.nodes.find(
      (n) => n.id === "dst_pg",
    );
    expect(moved?.size?.height).toBe(600 + 185 + 24); // grown to fit the moved entity

    const removed = json(await call(client, "remove_components", { ids: ["svc_api"] }));
    expect(removed.removed).toEqual(expect.arrayContaining(["svc_api", "lyr_app", added.id]));
    const row = await getProject(db, project.slug);
    expect(row.document.nodes.some((n) => n.id === added.id)).toBe(false);
    expect(row.document.edges.some((e) => e.source === "svc_api" || e.id === edge.id)).toBe(false);
    expect(json(await call(client, "validate_design")).errors).toBe(0);
    await client.close();
  });

  it("rejects invalid edits with the reasons and leaves the draft alone", async () => {
    const { project, client } = await seed();

    const badParent = await call(client, "add_component", {
      kind: "layer",
      name: "Orphan",
      parent: "Main database",
    });
    expect(badParent.isError).toBe(true);
    expect(raw(badParent)).toContain("A layer cannot be placed inside a datastore");

    const badData = await call(client, "update_component", {
      id: "svc_api",
      data: { port: 70000 },
    });
    expect(badData.isError).toBe(true);
    expect(raw(badData)).toContain("data.port");

    const badMove = await call(client, "update_component", { id: "lyr_app", parent: null });
    expect(raw(badMove)).toContain("cannot be placed inside the canvas");

    expect((await getProject(db, project.slug)).revision).toBe(1);
    await client.close();
  });

  it("removing an API operation clears the calls edges that used it", async () => {
    const { project, client } = await seed();
    const api = json(await call(client, "get_component", { id: "api_rest" })).component;
    const operations = api.data.operations.filter((o: { id: string }) => o.id !== "op_create");
    await call(client, "update_component", { id: "api_rest", data: { operations } });
    const row = await getProject(db, project.slug);
    const calls = row.document.edges.find((e) => e.id === "e_web_api");
    expect(calls?.kind === "calls" && calls.data.operations).toEqual(["op_list", "op_complete"]);

    const withNew = json(
      await call(client, "update_component", {
        id: "api_rest",
        data: { operations: [...operations, { name: "deleteTask", method: "DELETE", path: "/x" }] },
      }),
    );
    expect(withNew.component.data.operations.at(-1).id).toMatch(/^op_/);
    await client.close();
  });

  it("edits the overview and the stack, conventions and decisions", async () => {
    const { project, client } = await seed();

    await call(client, "update_overview", {
      summary: "New summary",
      repository: { packageManager: "pnpm" },
    });
    const added = json(
      await call(client, "upsert_section_items", {
        section: "stack",
        items: [{ category: "cache", name: "Redis", version: "8", scope: ["API"] }],
      }),
    );
    expect(added.ids).toHaveLength(1);
    await call(client, "upsert_section_items", {
      section: "stack",
      items: [{ id: added.ids[0], version: "8.2" }],
    });
    const unknown = await call(client, "upsert_section_items", {
      section: "decisions",
      items: [{ id: "adr_nope", title: "x" }],
    });
    expect(unknown.isError).toBe(true);
    const invalidItem = await call(client, "upsert_section_items", {
      section: "conventions",
      items: [{ category: "naming" }],
    });
    expect(raw(invalidItem)).toContain("rule");

    let row = await getProject(db, project.slug);
    expect(row.document.overview.summary).toBe("New summary");
    expect(row.document.overview.repository.packageManager).toBe("pnpm");
    expect(row.document.overview.goals.length).toBeGreaterThan(0);
    expect(row.document.stack.find((s) => s.id === added.ids[0])).toMatchObject({
      name: "Redis",
      version: "8.2",
      scope: ["svc_api"],
    });

    await call(client, "remove_section_items", { section: "stack", ids: added.ids });
    row = await getProject(db, project.slug);
    expect(row.document.stack.some((s) => s.id === added.ids[0])).toBe(false);
    await client.close();
  });

  it("applies a service template to a new service", async () => {
    const { client } = await seed();
    const service = json(await call(client, "add_component", { kind: "service", name: "Jobs" }));
    const applied = json(
      await call(client, "apply_service_template", { service: "Jobs", template: "node-fastify" }),
    );
    expect(applied.added.layers).toBeGreaterThan(0);
    const children = json(await call(client, "list_components", { parentId: service.id }));
    expect(children.length).toBe(applied.added.layers);
    await client.close();
  });

  it("save_project_design replaces the draft and checks the revision", async () => {
    const { project, client } = await seed();
    const design = json(await call(client, "get_project_design"));
    design.document.overview.summary = "Rewritten";

    const stale = await call(client, "save_project_design", {
      revision: design.revision + 5,
      document: design.document,
    });
    expect(stale.isError).toBe(true);
    expect(raw(stale)).toContain("current revision 1");

    const invalid = await call(client, "save_project_design", {
      revision: design.revision,
      document: { ...design.document, nodes: [{ id: "x", kind: "layer", name: "Loose" }] },
    });
    expect(raw(invalid)).toContain("must be placed inside a container");

    const ok = json(
      await call(client, "save_project_design", {
        revision: design.revision,
        document: design.document,
      }),
    );
    expect(ok.revision).toBe(2);
    expect((await getProject(db, project.slug)).document.overview.summary).toBe("Rewritten");
    await client.close();
  });

  it("a scoped token cannot edit another project", async () => {
    const { project } = await seed();
    await createProject(db, {
      ownerId: (await testUser()).id,
      name: "Other",
      document: { schemaVersion: 1 },
    });
    const scoped = await createToken(db, {
      userId: (await testUser()).id,
      name: "scoped",
      projectId: project.id,
    });
    const client = await connect(scoped.token);
    const denied = await call(client, "add_component", {
      project: "other",
      kind: "service",
      name: "X",
    });
    expect(denied.isError).toBe(true);
    expect(json(await call(client, "add_component", { kind: "service", name: "X" })).id).toMatch(
      /^svc_/,
    );
    await client.close();
  });
});

describe("MCP prompts and resources", () => {
  beforeEach(resetDb);

  it("lists prompts and substitutes the project", async () => {
    const { client } = await seed();
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((p) => p.name).sort()).toEqual([
      "implement_design",
      "review_against_design",
      "sync_design_changes",
    ]);

    const implement = await client.getPrompt({ name: "implement_design", arguments: {} });
    const text = (implement.messages[0]!.content as { text: string }).text;
    expect(text).toContain('implementing the project "Team Tasks" (`team-tasks`)');
    expect(text).toContain("get_build_plan");

    await createProject(db, {
      ownerId: (await testUser()).id,
      name: "Other",
      document: { schemaVersion: 1 },
    });
    const ambiguous = await client.getPrompt({ name: "implement_design", arguments: {} });
    expect((ambiguous.messages[0]!.content as { text: string }).text).toContain(
      "implementing the project from",
    );

    const sync = await client.getPrompt({
      name: "sync_design_changes",
      arguments: { project: "team-tasks", since: "2" },
    });
    expect((sync.messages[0]!.content as { text: string }).text).toContain("`from: 2`");
    await client.close();
  });

  it("lists and reads resources", async () => {
    const { client } = await seed();
    const resources = await client.listResources();
    expect(resources.resources.map((r) => r.uri)).toEqual(
      expect.arrayContaining([
        "design://schema",
        "design://projects/team-tasks/brief",
        "design://projects/team-tasks/document",
      ]),
    );
    const brief = await client.readResource({ uri: "design://projects/team-tasks/brief" });
    const briefText = (brief.contents[0] as { text: string }).text;
    expect(briefText).toBe(raw(await call(client, "get_project_brief")));
    const doc = await client.readResource({ uri: "design://projects/team-tasks/document" });
    expect(JSON.parse((doc.contents[0] as { text: string }).text).schemaVersion).toBe(1);
    const schema = await client.readResource({ uri: "design://schema" });
    expect(JSON.parse((schema.contents[0] as { text: string }).text).type).toBe("object");
    await client.close();
  });
});
