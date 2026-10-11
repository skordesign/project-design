import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { parseDesign } from "@/lib/design/integrity";
import { generateProjectScaffold, ScaffoldError, toScaffoldTreeAscii } from "@/lib/design/scaffold";

const doc = parseDesign(teamTasksDesign);
const meta = {
  name: "Team Tasks",
  slug: "team-tasks",
  appUrl: "https://design.example.com",
};

describe("generateProjectScaffold", () => {
  it("generates a complete monorepo skeleton matching architecture nodes", () => {
    const scaffold = generateProjectScaffold(doc, meta);

    expect(scaffold.layout).toBe("monorepo");
    expect(scaffold.packageManager).toBe("npm");
    expect(scaffold.files.length).toBeGreaterThan(10);

    const fileMap = new Map(scaffold.files.map((f) => [f.path, f]));

    // 1. Root Agent Governance
    expect(fileMap.has("AGENTS.md")).toBe(true);
    expect(fileMap.get("AGENTS.md")?.content).toContain("CRITICAL FOR ALL AI CODING AGENTS");

    expect(fileMap.has(".cursorrules")).toBe(true);
    expect(fileMap.has(".mcp.json")).toBe(true);
    expect(fileMap.has(".gitignore")).toBe(true);

    // 2. Root configs
    expect(fileMap.has("package.json")).toBe(true);
    expect(fileMap.get("package.json")?.content).toContain('"workspaces"');

    expect(fileMap.has("tsconfig.json")).toBe(true);

    // 3. Environment variables
    expect(fileMap.has(".env.example")).toBe(true);
    expect(fileMap.get(".env.example")?.content).toContain("DATABASE_URL=");
    expect(fileMap.get(".env.example")?.content).toContain("API_URL=");

    // 4. Services (Web and API)
    expect(fileMap.has("apps/web/package.json")).toBe(true);
    expect(fileMap.has("apps/web/tsconfig.json")).toBe(true);
    expect(fileMap.has("apps/web/src/app/page.tsx")).toBe(true);

    expect(fileMap.has("apps/api/package.json")).toBe(true);
    expect(fileMap.has("apps/api/tsconfig.json")).toBe(true);
    expect(fileMap.has("apps/api/src/index.ts")).toBe(true);

    // 5. Clean Architecture Layers
    expect(fileMap.has("apps/api/src/http/README.md")).toBe(true);
    expect(fileMap.get("apps/api/src/http/README.md")?.content).toContain("Application");

    expect(fileMap.has("apps/api/src/domain/README.md")).toBe(true);
    expect(fileMap.get("apps/api/src/domain/README.md")?.content).toContain("Leaf Core Layer");

    // 6. Module stubs
    expect(fileMap.has("apps/api/src/http/task-routes/index.ts")).toBe(true);
    expect(fileMap.get("apps/api/src/http/task-routes/index.ts")?.content).toContain(
      "export function registerTaskRoutes(app: any)",
    );

    // 7. Database SQL DDL
    expect(fileMap.has("db/main-database.schema.sql")).toBe(true);
    expect(fileMap.get("db/main-database.schema.sql")?.content).toContain(
      "CREATE TABLE IF NOT EXISTS",
    );

    // 8. OpenAPI Specs
    expect(fileMap.has("specs/tasks-rest-api.openapi.json")).toBe(true);
    expect(fileMap.get("specs/tasks-rest-api.openapi.json")?.content).toContain(
      '"openapi": "3.1.0"',
    );
  });

  it("can filter scaffold to a specific service", () => {
    const scaffold = generateProjectScaffold(doc, meta, { serviceId: "svc_api" });
    const paths = scaffold.files.map((f) => f.path);

    expect(paths.some((p) => p.startsWith("apps/api"))).toBe(true);
    expect(paths.some((p) => p.startsWith("apps/web"))).toBe(false);
  });

  it("keeps layer paths intact when the service folder is '.' or has dots", () => {
    const single = parseDesign({
      schemaVersion: 1,
      overview: {
        summary: "",
        goals: [],
        nonGoals: [],
        architectureStyle: "layered",
        architectureNotes: "",
        repository: { layout: "single-package", packageManager: "npm" },
      },
      stack: [],
      conventions: [],
      decisions: [],
      nodes: [
        {
          id: "svc_main",
          kind: "service",
          name: "Main",
          position: { x: 0, y: 0 },
          data: { type: "api", path: "." },
        },
        {
          id: "lyr_app",
          kind: "layer",
          name: "App",
          parentId: "svc_main",
          position: { x: 0, y: 0 },
          data: { path: "src/app" },
        },
        {
          id: "lyr_v2",
          kind: "layer",
          name: "V2",
          parentId: "svc_main",
          position: { x: 0, y: 0 },
          data: { path: "apps/api.v2/infra" },
        },
      ],
      edges: [],
    });
    const scaffold = generateProjectScaffold(single, meta);
    const tsconfig = JSON.parse(
      scaffold.files.find((f) => f.path === "tsconfig.json")!.content,
    ) as { compilerOptions: { paths: Record<string, string[]> } };
    // "." must not eat the first character; dots in folder names are literal.
    expect(tsconfig.compilerOptions.paths["@/app/*"]).toEqual(["src/app/*"]);
    expect(tsconfig.compilerOptions.paths["@/v2/*"]).toEqual(["apps/api.v2/infra/*"]);
  });

  it("refuses a single-package scaffold with several services", () => {
    const multi = parseDesign({
      schemaVersion: 1,
      overview: {
        summary: "",
        goals: [],
        nonGoals: [],
        architectureStyle: "layered",
        architectureNotes: "",
        repository: { layout: "single-package", packageManager: "npm" },
      },
      stack: [],
      conventions: [],
      decisions: [],
      nodes: [
        {
          id: "svc_a",
          kind: "service",
          name: "A",
          position: { x: 0, y: 0 },
          data: { type: "api", path: "." },
        },
        {
          id: "svc_b",
          kind: "service",
          name: "B",
          position: { x: 300, y: 0 },
          data: { type: "worker", path: "." },
        },
      ],
      edges: [],
    });
    expect(() => generateProjectScaffold(multi, meta)).toThrow(ScaffoldError);
    // Scoping to one service is the explicit escape hatch.
    const scoped = generateProjectScaffold(multi, meta, { serviceId: "svc_a" });
    expect(scoped.files.map((f) => f.path)).toContain("package.json");
  });

  it("emits root configs for a one-service monorepo", () => {
    const mono = parseDesign({
      schemaVersion: 1,
      overview: {
        summary: "",
        goals: [],
        nonGoals: [],
        architectureStyle: "layered",
        architectureNotes: "",
        repository: { layout: "monorepo", packageManager: "npm" },
      },
      stack: [],
      conventions: [],
      decisions: [],
      nodes: [
        {
          id: "svc_api",
          kind: "service",
          name: "API",
          position: { x: 0, y: 0 },
          data: { type: "api", path: "apps/api" },
        },
      ],
      edges: [],
    });
    const scaffold = generateProjectScaffold(mono, meta);
    const paths = scaffold.files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("tsconfig.json");
    expect(paths).toContain("apps/api/package.json");
  });
});

describe("toScaffoldTreeAscii", () => {
  it("renders readable directory tree", () => {
    const scaffold = generateProjectScaffold(doc, meta);
    const tree = toScaffoldTreeAscii(scaffold);

    expect(tree).toContain(". (project root)");
    expect(tree).toContain("AGENTS.md");
    expect(tree).toContain("apps");
  });
});
