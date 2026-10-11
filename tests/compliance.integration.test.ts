import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";

import { DELETE, GET, POST } from "@/app/api/mcp/route";
import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { getDb } from "@/server/db/client";
import { createProject } from "@/server/services/projects";
import { setComponentStatus } from "@/server/services/status";
import { createToken } from "@/server/services/tokens";
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
const json = (r: Result) => JSON.parse((r.content as { text: string }[])[0]!.text);

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

describe("get_compliance_report", () => {
  beforeEach(resetDb);

  it("reports zero progress with a passing default gate on a fresh design", async () => {
    const { client } = await seed();
    const res = json(await call(client, "get_compliance_report"));
    expect(res.project).toMatchObject({ slug: "team-tasks" });
    expect(res.report.totalSteps).toBeGreaterThan(0);
    expect(res.report.percentDone).toBe(0);
    expect(res.report.totals.unreported).toBe(res.report.totalSteps);
    expect(res.report.gate).toMatchObject({ pass: true, reasons: [] });
    expect(res.summary).toContain("**0%** done");
    await client.close();
  });

  it("tracks statuses and enforces gate thresholds", async () => {
    const { project, client } = await seed();
    await setComponentStatus(db, project.id, "dst_pg", { status: "done" });
    await setComponentStatus(db, project.id, "ent_task", { status: "done" });
    await setComponentStatus(db, project.id, "svc_api", {
      status: "blocked",
      note: "needs decision",
    });

    const res = json(await call(client, "get_compliance_report"));
    expect(res.report.totals.done).toBe(2);
    expect(res.report.percentDone).toBeGreaterThan(0);
    expect(res.report.totals.blocked).toBe(1);
    expect(res.report.blocked[0]).toMatchObject({
      id: "svc_api",
      note: "needs decision",
      stale: false,
    });
    expect(res.summary).toContain("BLOCKED [svc_api]");

    const gated = json(
      await call(client, "get_compliance_report", { failOnBlocked: true, minDonePercent: 100 }),
    );
    expect(gated.report.gate.pass).toBe(false);
    expect(gated.report.gate.reasons.join(" ")).toMatch(/blocked step|below the required/);
    await client.close();
  });

  it("lists the tool alongside the other plan tools", async () => {
    const { client } = await seed();
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("get_compliance_report");
    await client.close();
  });
});
