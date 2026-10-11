/**
 * Pure isomorphic generator for project skeletons and codebase scaffolds.
 *
 * Translates a DesignDocument (services, layers, modules, datastores, APIs, stack, env vars)
 * into a concrete file and directory scaffold tree.
 *
 * Ensures coding agents never invent unexpected folder layouts or hallucinate schemas.
 */
import {
  toAgentsMd,
  toCursorRules,
  toMcpConfig,
  type AgentRulesMeta,
} from "@/lib/design/agent-rules";
import { dataModel, toSqlDdl } from "@/lib/design/datamodel";
import { indexDesign } from "@/lib/design/graph";
import { toOpenApi } from "@/lib/design/openapi";
import type { DesignDocument, NodeOfKind } from "@/lib/design/schema";

export interface ScaffoldFile {
  path: string;
  content: string;
  description: string;
}

export interface ScaffoldOptions {
  serviceId?: string;
  includeMcp?: boolean;
}

export interface ScaffoldResult {
  layout: "single-package" | "monorepo";
  packageManager: string;
  files: ScaffoldFile[];
  directories: string[];
}

/** A scaffold request the design cannot satisfy (not a bug: caller maps it to 4xx). */
export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldError";
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "item"
  );
}

function cleanPath(p: string): string {
  return p.replace(/^\.?\//, "").replace(/\/+$/, "");
}

/** `path` relative to `folder` (both cleaned first); untouched when outside it. */
function stripPrefix(path: string, folder: string): string {
  const clean = cleanPath(path);
  if (!folder || folder === ".") return clean;
  if (clean === folder) return "";
  return clean.startsWith(`${folder}/`) ? clean.slice(folder.length + 1) : clean;
}

/**
 * Generates complete project skeleton with files, stubs, and configuration.
 */
export function generateProjectScaffold(
  doc: DesignDocument,
  meta: AgentRulesMeta = {},
  options: ScaffoldOptions = {},
): ScaffoldResult {
  const index = indexDesign(doc);
  const layout = doc.overview.repository?.layout ?? "single-package";
  const packageManager = doc.overview.repository?.packageManager || "npm";
  const projectName = meta.name || "Project";
  const projectSlug = meta.slug || "project";

  const files: ScaffoldFile[] = [];
  const dirSet = new Set<string>();

  const addFile = (path: string, content: string, description: string) => {
    const normalized = cleanPath(path);
    files.push({ path: normalized, content: content.trimEnd() + "\n", description });
    const parts = normalized.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join("/"));
    }
  };

  // 1. Root Agent Governance & IDE Guardrails
  addFile(
    "AGENTS.md",
    toAgentsMd(doc, meta),
    "Architecture rules and Clean Architecture layer constraints for AI coding agents",
  );
  addFile(".cursorrules", toCursorRules(doc, meta), "Compact prompt rules for Cursor AI IDE");
  if (options.includeMcp !== false) {
    addFile(
      ".mcp.json",
      toMcpConfig(meta),
      "Model Context Protocol configuration for connecting Claude Code and Cursor to Project Design",
    );
  }

  // 2. Root .gitignore & .env.example
  addFile(
    ".gitignore",
    `node_modules/
dist/
build/
.next/
.turbo/
.cache/
coverage/
*.log
.env
.env.local
.DS_Store
`,
    "Standard git ignore rules",
  );

  // Collect all environment variables across services
  const services = doc.nodes.filter((n) => n.kind === "service") as NodeOfKind<"service">[];
  const targetServices = options.serviceId
    ? services.filter((s) => s.id === options.serviceId)
    : services;
  if (layout === "single-package" && targetServices.length > 1) {
    throw new ScaffoldError(
      `Single-package layout cannot scaffold ${targetServices.length} services ` +
        `(${targetServices.map((s) => s.name).join(", ")}): their package.json, tsconfig.json ` +
        `and entry points would overwrite each other at the project root. ` +
        `Switch the repository layout to monorepo, or scaffold one service at a time.`,
    );
  }

  const envLines: string[] = [`# Environment Variables for ${projectName}`, ""];
  for (const svc of targetServices) {
    if (svc.data.env && svc.data.env.length > 0) {
      envLines.push(`## Service: ${svc.name}`);
      for (const e of svc.data.env) {
        const desc = e.description ? ` # ${e.description}` : "";
        const val = e.example || (e.secret ? "CHANGE_ME" : "");
        envLines.push(`${e.name}=${val}${desc}`);
      }
      envLines.push("");
    }
  }
  if (envLines.length > 2) {
    addFile(".env.example", envLines.join("\n"), "Environment variable templates");
  }

  // 3. Root package.json & tsconfig.json
  const isMonorepo = layout === "monorepo";

  if (isMonorepo) {
    const rootPkg = {
      name: projectSlug,
      private: true,
      workspaces: ["apps/*", "packages/*"],
      scripts: {
        dev: "turbo run dev || npm run dev --workspaces",
        build: "turbo run build || npm run build --workspaces",
        test: "turbo run test || npm run test --workspaces",
        lint: "turbo run lint || npm run lint --workspaces",
      },
    };
    addFile(
      "package.json",
      JSON.stringify(rootPkg, null, 2),
      "Monorepo root package configuration",
    );

    const rootTsConfig = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        baseUrl: ".",
      },
      exclude: ["node_modules", "dist", "build"],
    };
    addFile(
      "tsconfig.json",
      JSON.stringify(rootTsConfig, null, 2),
      "Monorepo root TypeScript configuration",
    );
  }

  // 4. Per-Service Scaffolding
  for (const svc of targetServices) {
    const svcFolder = cleanPath(svc.data.path || (isMonorepo ? `apps/${slugify(svc.name)}` : "."));
    const prefix = svcFolder ? `${svcFolder}/` : "";

    // Service package.json
    const svcPkg = {
      name: isMonorepo ? `@${projectSlug}/${slugify(svc.name)}` : projectSlug,
      version: "0.1.0",
      private: true,
      scripts: {
        dev: svc.data.type === "web-app" ? "next dev" : "tsx watch src/index.ts",
        build: svc.data.type === "web-app" ? "next build" : "tsc",
        start: svc.data.type === "web-app" ? "next start" : "node dist/index.js",
        test: "vitest run",
      },
    };
    addFile(
      `${prefix}package.json`,
      JSON.stringify(svcPkg, null, 2),
      `Package configuration for ${svc.name}`,
    );

    // Layer alias paths for service tsconfig
    const serviceLayers = doc.nodes.filter(
      (n) => n.kind === "layer" && n.parentId === svc.id,
    ) as NodeOfKind<"layer">[];

    const paths: Record<string, string[]> = {};
    for (const l of serviceLayers) {
      const alias = `@/${slugify(l.name)}/*`;
      const targetRel = stripPrefix(l.data.path, svcFolder) || `src/${slugify(l.name)}`;
      paths[alias] = [`${targetRel}/*`];
    }

    const svcTsConfig = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        baseUrl: ".",
        ...(Object.keys(paths).length > 0 ? { paths } : {}),
      },
      include: ["src/**/*"],
    };
    addFile(
      `${prefix}tsconfig.json`,
      JSON.stringify(svcTsConfig, null, 2),
      `TypeScript configuration for ${svc.name}`,
    );

    // Service README
    const svcReadme = [
      `# ${svc.name} (${svc.data.type})`,
      "",
      svc.description || "Service component in the architecture.",
      "",
      `- **Framework / Language**: ${svc.data.framework || "None"} (${svc.data.language || "TypeScript"})`,
      `- **Port**: ${svc.data.port ?? "N/A"}`,
      "",
      "## Responsibilities",
      ...(svc.data.responsibilities || []).map((r) => `- ${r}`),
    ];
    addFile(`${prefix}README.md`, svcReadme.join("\n"), `Overview for service ${svc.name}`);

    // Service Entry Stub
    if (svc.data.type === "web-app") {
      const pageStub = `export default function Page() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>${svc.name}</h1>
      <p>Initialized by Project Design Architecture Scaffold.</p>
    </main>
  );
}
`;
      addFile(`${prefix}src/app/page.tsx`, pageStub, `Web root page stub for ${svc.name}`);
    } else {
      const serverStub = `/**
 * Entrypoint for ${svc.name}
 * Responsibilities: ${(svc.data.responsibilities || []).join(", ")}
 */
const PORT = process.env.PORT || ${svc.data.port ?? 4000};

async function main() {
  console.log("${svc.name} listening on port " + PORT);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
`;
      addFile(`${prefix}src/index.ts`, serverStub, `Entrypoint stub for ${svc.name}`);
    }

    // 5. Per-Layer Scaffolding
    for (const l of serviceLayers) {
      const lFolder = cleanPath(l.data.path || `${prefix}src/${slugify(l.name)}`);
      const layerEdges = doc.edges.filter((e) => e.kind === "depends_on" && e.source === l.id);
      const allowedTargets = layerEdges.map((e) => index.node(e.target)?.name || e.target);

      const layerReadme = [
        `# Layer: ${l.name}`,
        "",
        `Path: \`${lFolder}\``,
        "",
        "## Clean Architecture Boundary Rules",
        allowedTargets.length > 0
          ? `Allowed to import/depend on: ${allowedTargets.map((t) => `\`${t}\``).join(", ")}`
          : "Leaf Core Layer: CANNOT import any outer layers.",
        "",
        ...(l.data.rules && l.data.rules.length > 0
          ? ["### Specific Constraints", ...l.data.rules.map((r) => `- ${r}`), ""]
          : []),
      ];
      addFile(
        `${lFolder}/README.md`,
        layerReadme.join("\n"),
        `Architecture layer guide for ${l.name}`,
      );

      // Stub index.ts for layer
      addFile(
        `${lFolder}/index.ts`,
        `/**\n * Layer: ${l.name}\n * Enforces boundaries: ${allowedTargets.join(", ") || "Core"}\n */\nexport {};\n`,
        `Layer export barrel for ${l.name}`,
      );
    }
  }

  // 6. Per-Module Stubs (if module defines exports or path)
  const targetServiceIds = new Set(targetServices.map((s) => s.id));
  const targetLayerIds = new Set(
    doc.nodes
      .filter((n) => n.kind === "layer" && n.parentId && targetServiceIds.has(n.parentId))
      .map((n) => n.id),
  );

  const modules = doc.nodes.filter((n) => n.kind === "module") as NodeOfKind<"module">[];
  for (const m of modules) {
    if (!m.data.path && !m.data.exports) continue;
    if (options.serviceId) {
      const belongs =
        (m.parentId && targetServiceIds.has(m.parentId)) ||
        (m.parentId && targetLayerIds.has(m.parentId));
      if (!belongs) continue;
    }
    const parent = m.parentId ? index.node(m.parentId) : undefined;
    const basePath = m.data.path
      ? cleanPath(m.data.path)
      : parent &&
          "data" in parent &&
          typeof parent.data === "object" &&
          parent.data &&
          "path" in parent.data &&
          typeof parent.data.path === "string"
        ? `${cleanPath(parent.data.path)}/${slugify(m.name)}`
        : `src/modules/${slugify(m.name)}`;

    const exportStubs = (m.data.exports || []).map((exp) => {
      // e.g. "registerTaskRoutes(app)" -> export function registerTaskRoutes(app: any) { ... }
      const funcMatch = exp.match(/^([a-zA-Z0-9_]+)\s*\((.*?)\)/);
      if (funcMatch) {
        const [, name, params] = funcMatch;
        return `export function ${name}(${params ? `${params}: any` : ""}) {\n  // TODO: Implement according to architecture spec\n}\n`;
      }
      return `export const ${slugify(exp).replace(/-/g, "_")} = {};\n`;
    });

    const moduleContent = [
      `/**`,
      ` * Module: ${m.name}`,
      ` * Responsibilities: ${(m.data.responsibilities || []).join(", ") || "None"}`,
      ` */`,
      "",
      ...exportStubs,
    ].join("\n");

    addFile(`${basePath}/index.ts`, moduleContent, `Module implementation stub for ${m.name}`);
  }

  // 7. Per-Datastore Schemas
  const datastores = doc.nodes.filter((n) => n.kind === "datastore") as NodeOfKind<"datastore">[];
  for (const ds of datastores) {
    const model = dataModel(index, ds.id);
    const ddl = toSqlDdl(model);
    if (ddl.trim()) {
      addFile(
        `db/${slugify(ds.name)}.schema.sql`,
        ddl,
        `PostgreSQL DDL schema and tables for ${ds.name}`,
      );
    }
  }

  // 8. Per-API OpenAPI specs
  const apis = doc.nodes.filter(
    (n) => n.kind === "api" && n.data.style === "rest",
  ) as NodeOfKind<"api">[];
  for (const api of apis) {
    const spec = toOpenApi(index, api.id);
    if (spec) {
      addFile(
        `specs/${slugify(api.name)}.openapi.json`,
        JSON.stringify(spec, null, 2),
        `OpenAPI 3.1 specification for ${api.name}`,
      );
    }
  }

  return {
    layout,
    packageManager,
    files,
    directories: Array.from(dirSet).sort(),
  };
}

interface TreeNode {
  name: string;
  isDir: boolean;
  children: Map<string, TreeNode>;
}

/**
 * Renders a visual ASCII directory tree of the generated scaffold.
 */
export function toScaffoldTreeAscii(result: ScaffoldResult): string {
  const root: TreeNode = { name: ".", isDir: true, children: new Map() };

  for (const file of result.files) {
    const parts = file.path.split("/");
    let curr = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      if (!curr.children.has(part)) {
        curr.children.set(part, {
          name: part,
          isDir: !isLast,
          children: new Map(),
        });
      }
      curr = curr.children.get(part)!;
    }
  }

  const lines: string[] = [". (project root)"];
  function printNode(node: TreeNode, indent: string) {
    const keys = Array.from(node.children.keys()).sort();
    for (let i = 0; i < keys.length; i++) {
      const isLast = i === keys.length - 1;
      const child = node.children.get(keys[i]!)!;
      const prefix = isLast ? "└── " : "├── ";
      const nextIndent = indent + (isLast ? "    " : "│   ");
      lines.push(`${indent}${prefix}${child.name}${child.isDir ? "/" : ""}`);
      if (child.isDir) {
        printNode(child, nextIndent);
      }
    }
  }

  printNode(root, "");
  return lines.join("\n");
}
