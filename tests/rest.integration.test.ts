import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as importRoute } from "@/app/api/projects/import/route";
import { GET as getBrief } from "@/app/api/projects/[slug]/brief/route";
import { GET as getDesign, PUT as putDesign } from "@/app/api/projects/[slug]/design/route";
import { GET as getExport } from "@/app/api/projects/[slug]/export/route";
import { GET as getRevision } from "@/app/api/projects/[slug]/revision/route";
import { GET as getScaffold } from "@/app/api/projects/[slug]/scaffold/route";
import { GET as getStatus } from "@/app/api/projects/[slug]/status/route";
import { renderBrief } from "@/lib/design/brief";
import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { parseDesign } from "@/lib/design/integrity";
import { SESSION_COOKIE, createSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { createProject } from "@/server/services/projects";
import { setComponentStatus } from "@/server/services/status";
import { publishVersion } from "@/server/services/versions";
import { resetDb, testUser } from "./helpers/db";

// connection() and cookies() only work inside a Next request; handlers are called directly here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
let sessionCookie = "";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && sessionCookie ? { value: sessionCookie } : undefined,
  }),
}));

const db = getDb();
let owner = "";
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const url = (path: string) => `http://localhost:3000${path}`;
const json = (method: string, path: string, body: unknown, headers: HeadersInit = {}) =>
  new Request(url(path), {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const doc = parseDesign(teamTasksDesign);

describe("REST routes", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await testUser();
    owner = user.id;
    sessionCookie = (await createSession(db, user.id)).token;
  });

  it("answers 401 without a session and 404 for another user's project", async () => {
    await createProject(db, { name: "P", ownerId: owner });
    sessionCookie = "";
    const anonymous = await getDesign(new Request(url("/x")), ctx("p"));
    expect(anonymous.status).toBe(401);
    expect((await importRoute(json("POST", "/i", teamTasksDesign))).status).toBe(401);

    sessionCookie = (await createSession(db, (await testUser("bob", 2)).id)).token;
    for (const res of [
      await getDesign(new Request(url("/x")), ctx("p")),
      await putDesign(json("PUT", "/x", { revision: 1, document: doc }), ctx("p")),
      await getRevision(new Request(url("/x")), ctx("p")),
      await getExport(new Request(url("/x")), ctx("p")),
      await getBrief(new Request(url("/x")), ctx("p")),
      await getStatus(new Request(url("/x")), ctx("p")),
    ]) {
      expect(res.status).toBe(404);
    }
  });

  it("GET design returns revision and document", async () => {
    await createProject(db, { ownerId: owner, name: "Team Tasks", document: teamTasksDesign });
    const res = await getDesign(
      new Request(url("/api/projects/team-tasks/design")),
      ctx("team-tasks"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revision).toBe(1);
    expect(body.document.nodes).toHaveLength(21);
    const missing = await getDesign(new Request(url("/x")), ctx("nope"));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("NOT_FOUND");
  });

  it("PUT design saves, then answers 409 for a stale revision", async () => {
    await createProject(db, { ownerId: owner, name: "P" });
    const path = "/api/projects/p/design";
    const ok = await putDesign(json("PUT", path, { revision: 1, document: doc }), ctx("p"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).revision).toBe(2);

    const stale = await putDesign(json("PUT", path, { revision: 1, document: doc }), ctx("p"));
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.details.currentRevision).toBe(2);
  });

  it("GET revision tracks saves and answers 404 for an unknown project", async () => {
    await createProject(db, { ownerId: owner, name: "P" });
    const read = async () =>
      (await (await getRevision(new Request(url("/api/projects/p/revision")), ctx("p"))).json())
        .revision;
    expect(await read()).toBe(1);
    await putDesign(
      json("PUT", "/api/projects/p/design", { revision: 1, document: doc }),
      ctx("p"),
    );
    expect(await read()).toBe(2);
    const missing = await getRevision(new Request(url("/x")), ctx("nope"));
    expect(missing.status).toBe(404);
  });

  it("PUT design answers 422 with issues and 413 for a huge body", async () => {
    await createProject(db, { ownerId: owner, name: "P" });
    const path = "/api/projects/p/design";
    const invalid = { ...doc, edges: [{ id: "e", kind: "depends_on", source: "a", target: "b" }] };
    const bad = await putDesign(json("PUT", path, { revision: 1, document: invalid }), ctx("p"));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.details[0].code).toBe("edge.unknown_endpoint");

    const malformed = await putDesign(json("PUT", path, { revision: "x" }), ctx("p"));
    expect(malformed.status).toBe(422);
    const notJson = await putDesign(json("PUT", path, "{nope"), ctx("p"));
    expect(notJson.status).toBe(422);

    const huge = json("PUT", path, `{"revision":1,"document":"${"x".repeat(5 * 1024 * 1024)}"}`);
    expect((await putDesign(huge, ctx("p"))).status).toBe(413);
    const declared = json("PUT", path, "{}", { "content-length": String(6 * 1024 * 1024) });
    expect((await putDesign(declared, ctx("p"))).status).toBe(413);
  });

  it("export sets download headers and the envelope round-trips through import", async () => {
    await createProject(db, { ownerId: owner, name: "Team Tasks", document: teamTasksDesign });
    await publishVersion(db, "team-tasks", { label: "v1" });
    const res = await getExport(new Request(url("/e?version=latest")), ctx("team-tasks"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="team-tasks-latest.design.json"',
    );
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ format: "project-design", version: { number: 1 } });

    const imported = await importRoute(json("POST", "/api/projects/import", text));
    expect(imported.status).toBe(201);
    expect((await imported.json()).slug).toBe("team-tasks-2");

    const bad = await getExport(new Request(url("/e?version=banana")), ctx("team-tasks"));
    expect(bad.status).toBe(422);
    const none = await getExport(new Request(url("/e?version=7")), ctx("team-tasks"));
    expect(none.status).toBe(404);
  });

  it("import answers 422 for an invalid design", async () => {
    const res = await importRoute(
      json("POST", "/api/projects/import", { schemaVersion: 1, nodes: [{}] }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION");
    const bare = await importRoute(json("POST", "/api/projects/import", teamTasksDesign));
    expect(bare.status).toBe(201);
  });

  it("brief is markdown that matches the renderer, including statuses", async () => {
    const project = await createProject(db, {
      ownerId: owner,
      name: "Team Tasks",
      document: teamTasksDesign,
    });
    await setComponentStatus(db, project.id, "svc_api", { status: "done" });
    const res = await getBrief(new Request(url("/b")), ctx("team-tasks"));
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const text = await res.text();
    expect(text).toBe(
      renderBrief({
        project: { name: "Team Tasks", slug: "team-tasks", description: "" },
        document: doc,
        revision: 1,
        version: null,
        statuses: new Map([["svc_api", "done"]]),
      }),
    );
  });

  it("status lists current statuses and ignores deleted nodes", async () => {
    const project = await createProject(db, {
      ownerId: owner,
      name: "P",
      document: teamTasksDesign,
    });
    await setComponentStatus(db, project.id, "svc_api", { status: "blocked", note: "why" });
    await setComponentStatus(db, project.id, "gone", { status: "done" });
    const res = await getStatus(new Request(url("/s")), ctx("p"));
    const body = await res.json();
    expect(Object.keys(body.statuses)).toEqual(["svc_api"]);
    expect(body.statuses.svc_api).toMatchObject({ status: "blocked", note: "why" });
  });

  it("scaffold returns json and ascii tree", async () => {
    await createProject(db, { ownerId: owner, name: "Team Tasks", document: teamTasksDesign });
    const jsonRes = await getScaffold(new Request(url("/s?version=draft")), ctx("team-tasks"));
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const jsonBody = await jsonRes.json();
    expect(jsonBody.files.length).toBeGreaterThan(10);

    const treeRes = await getScaffold(
      new Request(url("/s?version=draft&format=tree")),
      ctx("team-tasks"),
    );
    expect(treeRes.status).toBe(200);
    expect(treeRes.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const treeText = await treeRes.text();
    expect(treeText).toContain(". (project root)");
  });

  it("scaffold resolves services by name and rejects bad input", async () => {
    await createProject(db, { ownerId: owner, name: "Team Tasks", document: teamTasksDesign });

    const byName = await getScaffold(
      new Request(url("/s?version=draft&service=api")),
      ctx("team-tasks"),
    );
    expect(byName.status).toBe(200);
    const byNameBody = await byName.json();
    const paths = byNameBody.files.map((f: { path: string }) => f.path);
    expect(paths.some((p: string) => p.startsWith("apps/api/"))).toBe(true);
    expect(paths.some((p: string) => p.startsWith("apps/web/"))).toBe(false);

    const unknown = await getScaffold(
      new Request(url("/s?version=draft&service=nope")),
      ctx("team-tasks"),
    );
    expect(unknown.status).toBe(404);

    const badFormat = await getScaffold(
      new Request(url("/s?version=draft&format=xml")),
      ctx("team-tasks"),
    );
    expect(badFormat.status).toBe(422);
  });
});
