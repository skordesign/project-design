import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/mcp/route";
import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { getDb } from "@/server/db/client";
import { createProject } from "@/server/services/projects";
import { setComponentStatus } from "@/server/services/status";
import { createToken } from "@/server/services/tokens";
import { main } from "../scripts/design-gate.mjs";
import { resetDb, testUser } from "./helpers/db";

const db = getDb();

/** Routes fetch straight at the in-process MCP handler (no sockets). */
const routeFetch = async (input: string | URL, init?: RequestInit) => {
  const request = new Request(input.toString(), {
    method: init?.method ?? "POST",
    headers: init?.headers as HeadersInit,
    body: init?.body as BodyInit,
  });
  return POST(request);
};

async function seed() {
  const project = await createProject(db, {
    ownerId: (await testUser()).id,
    name: "Team Tasks",
    document: teamTasksDesign,
  });
  const { token } = await createToken(db, { userId: (await testUser()).id, name: "gate" });
  return { project, token };
}

describe("scripts/design-gate.mjs", () => {
  let logs: string[];
  let errors: string[];
  let savedExitCode: string | number | null | undefined;
  const env = { PROJECT_DESIGNER_TOKEN: "", PROJECT_DESIGN_TOKEN: "" };

  beforeEach(async () => {
    await resetDb();
    logs = [];
    errors = [];
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(a.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      errors.push(a.join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = savedExitCode;
  });

  const run = (argv: string[], token: string) =>
    main(
      ["--url", "http://localhost/api/mcp", "--token", token, ...argv],
      env,
      routeFetch as typeof fetch,
    );

  it("exits 0 on a passing gate and 1 with --min-done above progress", async () => {
    const { token } = await seed();
    expect(await run(["--project", "team-tasks"], token)).toBe(0);
    expect(logs.join("\n")).toContain("**0%** done");

    expect(await run(["--project", "team-tasks", "--min-done", "100"], token)).toBe(1);
    expect(errors.join("\n")).toContain("GATE: FAIL");
  });

  it("exits 1 on blocked steps with --fail-on-blocked and 2 without a token", async () => {
    const { project, token } = await seed();
    await setComponentStatus(db, project.id, "svc_api", { status: "blocked", note: "stuck" });

    expect(await run(["--project", "team-tasks", "--fail-on-blocked"], token)).toBe(1);
    expect(logs.join("\n")).toContain("BLOCKED [svc_api]");

    expect(await run(["--project", "team-tasks"], "")).toBe(2);
  });
});
