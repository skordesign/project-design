# Project Design — Implementation Plan

> **For the implementing agent.** This is the complete, implementation-ready plan for turning [IDEA.md](IDEA.md) into a working, Dockerised web app. Build it phase by phase (§15). Each phase lists its tasks, its acceptance checks and the commands that must pass. Everything in [Appendix A](#appendix-a--verified-reference-files) was installed, formatted, linted, type-checked, tested (unit, integration against real Postgres 18, Playwright smoke), built with `next build`, run as a Docker image under Docker Compose, and called over HTTP by MCP clients on **2026-10-08**. Appendix A was then replayed into an empty directory with the §5 commands to confirm they work. Copy those files verbatim instead of rewriting them. When a phase is done, trim it from this file (PDVS workflow); delete the file when every phase is done.

---

## 0. Ground rules

1. **Don't redesign.** The decisions in §1 are locked. If one turns out to be impossible, stop and ask; don't quietly pick an alternative.
2. **Copy the VERIFIED files exactly** (Appendix A), including the parts marked `PROTOTYPE`, which later phases replace. They encode details that were found the hard way, such as Zod 4 `prefault`, Cache Components `connection()`, Postgres 18's volume path, the MCP v2 handler wiring, and `tsx`/CommonJS top-level-await.
3. **Read the bundled Next.js docs first.** Next 16.4 differs from most training data (AGENTS.md says so too). Before writing routing, data, caching or proxy code, read the matching guide in `node_modules/next/dist/docs/01-app/`. The rules that matter for this app are in §6.3.
4. **One contract.** `src/lib/design/schema.ts` defines the design document. Every document that enters the system (UI save, import, restore, tests) goes through `safeParseDesign`/`parseDesign` from `integrity.ts`. Nothing writes `projects.document` or `project_versions.document` any other way.
5. **Boundaries** (ESLint enforces them, see `eslint.config.mjs`):
   - `src/lib/design/**` is pure and isomorphic. It must not import React, Next, `node:*`, `@/server`, `@/components` or `@/stores`.
   - `src/server/**` is server-only.
   - `src/components/**`, `src/stores/**` and `src/lib/**` never import `@/server/*` or `@/app/api/*`.
6. **Green before moving on.** At the end of every phase, `npm run verify` and `npm run test:e2e` must pass, and `docker compose up -d --build --wait` must report the app healthy. Then commit with the message `Phase N: <title>`.
7. **UI kit.** Use the shadcn/ui components in `src/components/ui` (generated; don't hand-edit them, add new ones with `npx shadcn@4.21.4 add <name>`), Tailwind 4 utility classes, and lucide-react icons only. There is no DESIGN_SYSTEM.md. If one appears before a UI phase (for example via the `/ui` skill), follow it over §11.1.

## 1. Product summary and locked decisions

**What it is.** A self-hosted web app where one person designs a software project on a canvas: services, the layers and modules inside them, data stores and entities, APIs with typed operations, queues and channels, third-party integrations and actors. Alongside the canvas go the project-wide tech stack, conventions and architecture decisions. Coding agents (Claude Code, Cursor, Codex, …) connect over **MCP** and read the design. They get a markdown brief, the raw JSON, per-component context, an OpenAPI contract, the data model, a dependency-ordered build plan and the changes between versions. With those, they generate a codebase that matches the design and report progress back per component.

| Decision | Choice | Why |
|---|---|---|
| Framework | **Next.js 16.4** (App Router) + React 19.3 + TypeScript 6.0 | IDEA.md |
| Canvas | **React Flow** (`@xyflow/react` 12), custom nodes, nested group nodes | Architecture diagrams are node/edge graphs with nesting (service ⊃ layer ⊃ module); MIT licence; IDEA.md says "Canvas for design" |
| Database | **PostgreSQL 18** + **Drizzle ORM 0.45** (node-postgres), SQL migrations committed under `drizzle/` | IDEA.md; typed queries, plain SQL migrations |
| Design storage | **One JSONB document per project** (the draft) with an integer `revision` for optimistic concurrency, plus immutable **published versions** | One contract serves the canvas, the API, import/export and MCP; whole-document saves stay simple; versions let agents pin a design and diff it |
| MCP | `@modelcontextprotocol/server` **2.3** `createMcpHandler`, mounted at **`/api/mcp`** (Streamable HTTP, stateless) inside the Next app. It serves the 2026-07-28 protocol and 2025-era clients | No second process; verified with the v2 SDK client and a raw 2025-06-18 `initialize` |
| MCP auth | Bearer tokens `pd_<43 chars>`, stored as SHA-256 only, optionally **scoped to one project** | Agents need headless auth; a scoped token lets an agent omit the project argument |
| UI auth | **GitHub OAuth sign-in** (hand-rolled, `src/server/auth`), hashed DB sessions; each user owns their projects and MCP tokens. Without GitHub credentials: local mode, no login, one built-in user. Optional outer HTTP Basic via `APP_BASIC_AUTH` in `src/proxy.ts` | Multi-user ownership was requested on 2026-10-09 |
| UI kit | shadcn/ui (Radix, `radix-nova` preset, neutral), Tailwind 4, lucide-react, next-themes (light/dark/system), sonner toasts, Geist fonts from the `geist` package | Standard for Next; local fonts keep Docker builds offline-safe |
| Client state | zustand 5 (vanilla store per open project) + **zundo** undo/redo over the document | Verified in `designer-store.ts` |
| Rendering | **Cache Components on** (Next 16.4 default). DB reads go inside `<Suspense>` after `await connection()`. No `"use cache"` in v1 | Framework default; the data is always fresh |
| Docker | Multi-stage `node:24-alpine` standalone image (~300 MB, non-root) + `postgres:18-alpine`; migrations run on boot (`instrumentation.ts`, advisory lock) | Requirement; verified healthy under Compose |
| Package manager | npm 11 with a committed `package-lock.json` | Matches the user's other projects |
| Tests | Vitest 5 projects `unit` + `integration` (real Postgres test DB); Playwright 1.64 e2e against the standalone build | Verified |

**IDEA.md → plan mapping**

| IDEA.md | Here |
|---|---|
| Tech stack | `stack[]` items (category, name, version, notes, optional scope to nodes) + per-service `language` / `framework` / `runtime` (§7.1) |
| Design pattern | `patterns[]` on every node (30-item catalogue + free text) + project `architectureStyle` |
| Architecture | `overview.architectureStyle` + notes, `decisions[]` (ADRs), the graph itself |
| Layers | `layer` containers inside a `service`; `depends_on` edges between layers declare the allowed direction; `validate_design` flags violations |
| APIs | `api` nodes with typed operations (method, path, request/response shapes, errors); OpenAPI 3.1 output |
| Integrations | `integration` nodes (provider, SDK, env vars) + `uses` edges |
| "…" | `datastore` + `entity` (fields, indexes, `relation` edges), `queue` (channels + payloads, `publishes`/`subscribes`), `actor`, `note`, `conventions[]`, repository layout |
| Expose MCP tools for agents to understand the schema | `get_design_schema` + 11 more tools, 3 prompts, 3 resources (§9) |
| Agent generates the project to match the design | `implement_design` prompt + `get_build_plan` + `set_component_status` write-back shown on the canvas |

**Glossary.** *Design / document*: the JSON described by `schema.ts`. *Node*: a box on the canvas (10 kinds). *Container*: a node kind that holds children (`service`, `layer`, `datastore`). *Edge*: a typed connection (9 kinds). *Draft*: the editable document in `projects.document`. *Revision*: a counter that goes up on each successful draft save. *Version*: an immutable published snapshot (1, 2, 3 …). *Brief*: the markdown rendering of a design for agents. *Principal*: who an MCP request acts as (token id + optional project scope).

## 2. Scope

**In (v1):** everything in §1. That covers the projects list (create blank, from example, or from archetype templates; rename, duplicate, delete, import/export JSON) and the canvas designer (palette, nesting, typed connections, inspector forms for all kinds, undo/redo, autosave, validation panel, component status badges, walkthrough flow player, high-res PNG/SVG export, Mermaid flow/sequence export, SQL DDL export). It also covers the project sections (Overview, Stack, Conventions, Decisions, Brief preview, Versions with publish, diff and restore), the MCP tokens settings page, the full MCP surface, Feishu card integration, Docker and Compose, and README.

**Out (later; don't build now):** teams, sharing, permissions beyond per-user ownership; real-time multi-user editing; OAuth for MCP; generating code inside the app; reverse-engineering a design from an existing repo; comments; i18n; a native-app shell; host allow-listing / DNS-rebinding protection for the unauthenticated UI (document the localhost-only default instead). Flow layout uses elkjs layered (untidy canvases auto-arrange along the flow on open; lazy-loaded so the initial bundle stays light).

## 3. Tech stack (pinned, VERIFIED compatible on 2026-10-08)

| Package | Version | Note |
|---|---|---|
| next / eslint-config-next | 16.4.0 (exact) | Turbopack builds; `cacheComponents` + `partialPrefetching` on; Proxy replaces Middleware |
| react / react-dom | 19.3.0 | — |
| typescript | ~6.0.3 | `typescript-eslint` (inside eslint-config-next) needs `< 6.1`; **don't** move to TS 7 |
| eslint | ^9.39.5 | eslint-config-next's plugins don't accept ESLint 10 yet; npm's "no longer supported" warning is expected |
| tailwindcss + @tailwindcss/turbopack | ^4.3.3 | Next 16.4's Tailwind loader (`next.config.ts` `turbopack.rules`); there is **no** postcss config |
| shadcn (CLI, devDependency) | 4.21.4 | `globals.css` imports `shadcn/tailwind.css`; preset `radix-nova`; components import `cn` from the `cn` package |
| radix-ui, cn, class-variance-authority, tw-animate-css, cmdk, sonner, next-themes, lucide-react | ^1.7.0, ^0.4.0, ^0.7.1, ^1.4.0, ^1.1.1, ^2.0.8, ^0.4.6, ^1.52.0 | Pulled in by shadcn components |
| @xyflow/react | ^12.12.0 | Import `@xyflow/react/dist/style.css` once in the canvas component |
| elkjs | ^0.12.0 | Flow layout (`layout-elk.ts`, layered RIGHT, lazy `import()` so the initial bundle stays light) |
| zustand / zundo | ^5.0.15 / ^2.3.0 | `zustand/vanilla` `createStore` + `temporal` |
| zod | ^4.6.5 | Use `z.url()` (not `z.string().url()`), `.prefault({})` for nested object defaults, `z.toJSONSchema` |
| drizzle-orm / drizzle-kit / pg / @types/pg | ^0.45.3 / ^0.31.11 / ^8.23.1 / ^8.23.1 | Turbopack bundles drizzle; `pg` stays external |
| @modelcontextprotocol/server / client | ^2.3.1 / ^2.3.1 (client is dev-only, for tests) | `createMcpHandler(factory, opts).fetch(request, { authInfo })` |
| geist | ^1.7.2 | `geist/font/sans` + `geist/font/mono` (no Google Fonts fetch at build) |
| vitest | ^5.0.3 | `resolve.tsconfigPaths: true` (Vite 8); config is `.mts` so Vite loads it as ESM |
| @playwright/test | 1.64.0 | Chromium headless shell v1248 (`npx playwright install chromium`) |
| prettier / tsx / @types/node | ^3.9.9 / ^4.23.15 / ^24.19.1 | `tsx` runs `.ts` as CommonJS here, so scripts use `async function main()`, not top-level `await` |
| Node / npm | ≥ 24 (tested 24.18) / 11.16 | `package.json` `allowScripts` approves `esbuild` and `unrs-resolver` install scripts |
| Docker / Compose | tested 29.8 / v5.6 | Images `node:24-alpine`, `postgres:18-alpine` |

Rules: don't add runtime dependencies beyond these without a reason written in the commit message. In particular, add **no** form library, markdown renderer, data-fetching library, second ORM, or extra global state library. Forms are controlled inputs that write to the store or post to server actions.

## 4. Repository layout (final)

`V` = VERIFIED file from Appendix A (copy verbatim). `P` = VERIFIED prototype, replaced in the phase shown. `G` = generated by a command in §5. Unmarked = you write it in the phase shown.

```
project-design/
├─ IDEA.md  CURRENT_PLAN.md                     (exist)
├─ AGENTS.md  CLAUDE.md  README.md              V (README grows in Phase 7)
├─ package.json                                 V   package-lock.json G
├─ next.config.ts  tsconfig.json  components.json  eslint.config.mjs        V
├─ vitest.config.mts  playwright.config.ts  drizzle.config.ts               V
├─ .prettierrc.json  .prettierignore  .gitignore  .dockerignore  .env.example  V
├─ Dockerfile  compose.yaml  docker/postgres/init/01-create-test-db.sql     V
├─ drizzle/                                     G   (0000_init.sql + meta/; later migrations via db:generate)
├─ scripts/start-standalone.mjs                 V   (e2e + local prod run)
├─ e2e/ smoke.spec.ts (V)  designer.spec.ts  agent-flow.spec.ts             (Phases 5–7)
├─ tests/
│  ├─ setup/global-setup.ts  helpers/db.ts      V
│  ├─ mcp.integration.test.ts                   V → extended in Phase 3
│  ├─ projects.integration.test.ts  versions.integration.test.ts  tokens.integration.test.ts  rest.integration.test.ts   (Phase 2)
│  └─ mcp-tools.integration.test.ts             (Phase 3)
└─ src/
   ├─ instrumentation.ts  proxy.ts              V
   ├─ app/
   │  ├─ layout.tsx  globals.css  icon.svg      V
   │  ├─ page.tsx                               P → Phase 4 (projects list)
   │  ├─ actions/ projects.ts  versions.ts  tokens.ts                        (Phases 4, 6)
   │  ├─ settings/page.tsx                                                   (Phase 4)
   │  ├─ projects/[slug]/
   │  │  ├─ layout.tsx                          (Phase 5: loader + DesignerStoreProvider + header + tabs)
   │  │  ├─ page.tsx                            P → Phase 5 (canvas)
   │  │  └─ overview/ stack/ conventions/ decisions/ brief/ versions/ page.tsx   (Phase 6)
   │  └─ api/
   │     ├─ health/route.ts  mcp/route.ts       V
   │     └─ projects/ import/route.ts  [slug]/design/route.ts  [slug]/export/route.ts  [slug]/brief/route.ts  [slug]/status/route.ts  (Phase 2)
   ├─ components/
   │  ├─ ui/                                    G (shadcn)
   │  ├─ providers.tsx                          V
   │  ├─ app-shell/ top-bar.tsx  theme-toggle.tsx                            (Phase 4)
   │  ├─ projects/ project-card.tsx  new-project-dialog.tsx  import-button.tsx  (Phase 4)
   │  ├─ settings/ tokens-table.tsx  create-token-dialog.tsx  connect-snippets.tsx  (Phase 4)
   │  ├─ designer/
   │  │  ├─ canvas.tsx                          P → Phase 5
   │  │  ├─ store-provider.tsx  autosave.tsx  to-flow.ts  palette.tsx  toolbar.tsx  validation-panel.tsx  edge-kind-menu.tsx
   │  │  ├─ nodes/ base-node.tsx  container-node.tsx  service-node.tsx … note-node.tsx  index.ts
   │  │  ├─ edges/ design-edge.tsx
   │  │  └─ inspector/ inspector.tsx  node-form.tsx  edge-form.tsx  fields-editor.tsx  shape-editor.tsx
   │  │                operations-editor.tsx  channels-editor.tsx  env-editor.tsx  string-list.tsx  tags-input.tsx  patterns-picker.tsx  use-debounced-commit.ts
   │  └─ sections/ overview-form.tsx  stack-table.tsx  conventions-list.tsx  decisions-list.tsx  brief-view.tsx  versions-table.tsx  diff-view.tsx  (Phase 6)
   ├─ lib/
   │  ├─ utils.ts                               V
   │  └─ design/
   │     ├─ schema.ts  catalog.ts  ids.ts  integrity.ts  geometry.ts        V (+ tests V)
   │     ├─ examples/team-tasks.ts              V
   │     ├─ graph.ts  validate.ts  brief.ts  openapi.ts  datamodel.ts  build-plan.ts  diff.ts  export-format.ts  slug.ts   (Phase 1, each with *.test.ts)
   │     └─ __fixtures__/ team-tasks.brief.md  team-tasks.openapi.json  team-tasks.er.mmd   (Phase 1, file snapshots)
   ├─ stores/ designer-store.ts (+ test)        V   selection-store.ts  status-store.ts   (Phase 5)
   └─ server/
      ├─ env.ts                                 V
      ├─ db/ schema.ts  client.ts  migrate.ts  migrate-cli.ts               V
      ├─ errors.ts  http.ts                     (Phase 2)
      ├─ services/ tokens.ts (V)  projects.ts (P → Phase 2)  versions.ts  status.ts   (Phase 2)
      └─ mcp/ server.ts (P → Phase 3)  context.ts  tools/*.ts  prompts.ts  resources.ts   (Phase 3)
```

## 5. Phase 0: scaffold (exact steps)

Run these in the project root, which already contains `IDEA.md` and `CURRENT_PLAN.md`. Keep both files.

```bash
git init -b main
# 1. Write every file in Appendix A at its path, byte for byte.
# 2. Install (package.json already pins everything and approves install scripts):
npm install
# 3. Generate the shadcn components (components.json + globals.css are already in place):
npx -y shadcn@4.21.4 add -y alert-dialog badge button card checkbox command dialog \
  dropdown-menu input label popover scroll-area select separator sheet sonner switch \
  table tabs textarea tooltip < /dev/null
# 4. Database (Postgres 18 on 127.0.0.1:5434; creates project_design and project_design_test):
npm run db:up
npx drizzle-kit generate --name init     # writes drizzle/0000_init.sql + drizzle/meta/*
# 5. Browsers for e2e:
npx playwright install chromium
# 6. Verify:
npm run verify          # prettier, eslint, next typegen + tsc, vitest unit+integration, next build
npm run test:e2e        # standalone server on :3100 against the test DB, canvas smoke
docker compose up -d --build --wait      # full stack; app on http://localhost:3000
curl -s http://localhost:3000/api/health # {"ok":true}
git add -A && git commit -m "Phase 0: scaffold Next.js, Postgres, MCP endpoint and Docker"
```

Expected results:
- `verify` exits 0 with `Test Files 4 passed`, `Tests 18 passed`, and a route table listing `/`, `/api/health`, `/api/mcp` and `/projects/[slug]`.
- `test:e2e` reports `1 passed`.
- `docker compose up` ends with `Container project-design-app-1 Healthy`, and the app log shows `[migrate] database is up to date`.

Troubleshooting:
- **Port 5434 or 3000 is busy:** set `DB_PORT` / `APP_PORT` (Compose) and update `.env` / `DATABASE_URL_TEST` to match.
- **The test DB is missing:** the init script only runs on a fresh volume. Run `docker compose down -v && npm run db:up`.
- **`next dev` rewrites AGENTS.md:** that's expected (see its header). Commit the result.

## 6. Architecture

```
 Browser ─────────────┐                         Agent (Claude Code, Cursor, Codex …)
  /                   │ RSC pages + server actions         │ Streamable HTTP, Bearer pd_…
  /projects/[slug]/*  │ PUT /api/projects/[slug]/design    │
  /settings           │                                    ▼
┌─────────────────────▼──────── Next.js 16 app (one Node process) ───────────────────────────┐
│ src/proxy.ts (optional Basic auth; skips /api/mcp, /api/health)                            │
│ src/app/**            pages · actions · route handlers ──┐     /api/mcp/route.ts            │
│ src/components/**     client UI ── src/stores (zustand)  │     createMcpHandler → McpServer │
│                                                          ▼        per request (principal)   │
│ src/lib/design/**   schema · integrity · graph · validate · brief · openapi · datamodel ·   │
│   (pure, shared by browser + server)   build-plan · diff · geometry                         │
│ src/server/services/**  projects · versions · tokens · status ──► Drizzle ──► pg Pool      │
│ src/instrumentation.ts  runs drizzle migrations on boot (advisory lock)                    │
└────────────────────────────────────────────────────────────────────┬───────────────────────┘
                                                                     ▼
                                                     PostgreSQL 18 (Docker volume pgdata)
```

### 6.1 Data flows

- **Open a project:** `projects/[slug]/layout.tsx` (server) awaits `params` inside `<Suspense>` and loads `{project, revision, document, statuses}` through the services. It renders `<DesignerStoreProvider initial=…>`, which calls `createDesignerStore` once per mount and key `slug`, around the header, tabs and `children`. Every tab reads and writes the same store.
- **Edit:** UI → store action → new `document` object (undo entry) → `<Autosave>` notices `document !== savedDocument` → debounced `PUT /api/projects/[slug]/design {revision, document}` → service `saveDraft` → `safeParseDesign` → `UPDATE … WHERE revision = $rev` → `{revision}` → `markSaved` (§12).
- **Agent read:** `POST /api/mcp` → bearer → `verifyToken` → principal → `createMcpHandler` factory → `createDesignMcpServer({db, principal})` → tool → `resolveDocument(project, version)` → pure renderer (brief / openapi / plan / diff) → text result.
- **Agent write-back:** `set_component_status` → `component_status` upsert. The canvas polls `GET /api/projects/[slug]/status` every 10 s while the tab is visible and shows badges.

### 6.2 Error model (`src/server/errors.ts`, Phase 2)

```ts
export type AppErrorCode =
  | "NOT_FOUND" | "CONFLICT" | "VALIDATION" | "UNAUTHORIZED" | "PAYLOAD_TOO_LARGE";
export class AppError extends Error {
  constructor(readonly code: AppErrorCode, message: string, readonly details?: unknown) { super(message); }
}
```

`src/server/http.ts` exports `errorResponse(error: unknown): Response`:
- `AppError` → 404 / 409 / 422 / 401 / 413 with body `{ error: { code, message, details } }`.
- `DesignIntegrityError` → 422 with `details: issues`.
- `ZodError` → 422 with `details: error.issues`.
- Anything else → log `[api]` and return 500 `{ error: { code: "INTERNAL", message: "Internal error" } }`.

It also exports `readJson(request, maxBytes)`, which returns 413 when the body is over the limit. The limit is 5 MB for the design PUT and import, 1 MB elsewhere.

Rules:
- Services throw `AppError`. They never return HTTP objects.
- Server actions catch `AppError` and return `{ ok: false, error: { code, message } }` for the UI to show as a toast.
- MCP tools never throw for domain errors. They return `{ isError: true, content: [{ type: "text", text: message }] }`.
- A project hidden from a scoped principal is reported as `NOT_FOUND`, never as forbidden.

### 6.3 Next.js 16.4 rules for this app (Cache Components)

Read `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`, `08-caching.md`, `07-mutating-data.md` and `03-api-reference/04-functions/{connection,refresh}.md`.

1. **Reads go inside `<Suspense>`.** In pages and layouts, do the database read in an async child component wrapped in `<Suspense fallback=…>`. If that component reads no request API (`params`, `cookies()`, `headers()`, `searchParams`), call `await connection()` from `next/server` first. Appendix `src/app/page.tsx` shows the pattern.
2. **GET route handlers that read the DB must call `await connection()` first.** Without it, Next prerenders them at build time (this happened to `/api/health`; see its comment). POST, PUT and DELETE handlers are always dynamic.
3. `params` is a `Promise`. Type pages and layouts with the generated globals `PageProps<"/projects/[slug]">` / `LayoutProps<"/projects/[slug]">` (`npm run typecheck` runs `next typegen` first).
4. **Server actions** live in `src/app/actions/*.ts` (`"use server"` at the top). After a mutation, call `refresh()` from `next/cache`, or `redirect()` to a new URL. Don't use `revalidatePath`/`revalidateTag`; nothing is cached.
5. `notFound()` thrown inside a Suspense boundary renders the not-found UI with HTTP **200**, because streaming has already started (verified). That's acceptable for pages. REST routes return real 404s.
6. Don't use `"use cache"` in v1.
7. `src/proxy.ts` is the old Middleware. It runs on Node; keep it to the Basic-auth check.
8. Client components that use React Flow, the store or browser APIs start with `"use client"` and live under `src/components/**`.

## 7. Domain model (`src/lib/design`)

### 7.1 The document (VERIFIED `schema.ts`)

```
DesignDocument
├─ schemaVersion: 1
├─ overview  { summary, goals[], nonGoals[], architectureStyle, architectureNotes,
│              repository { layout: single-package|monorepo, packageManager, notes } }
├─ stack[]        { id, category, name, version, notes, scope: nodeId[] }      (scope [] = whole project)
├─ conventions[]  { id, category, level: must|should|may, rule, scope[] }
├─ decisions[]    { id, title, status, context, decision, consequences, date }
├─ nodes[]   common { id, kind, name, description, parentId, position{x,y} (relative to parent),
│                     size{width,height}|null, tags[], patterns[{name, notes}], data{…per kind} }
└─ edges[]   common { id, kind, source, target, label, description, data{…per kind} }
```

| Node kind | Container | Allowed parents | `data` |
|---|---|---|---|
| `service` | yes | top level | type (web-app/api/worker/cli/library/mobile/desktop/function/other), language, framework, runtime, path, port, responsibilities[], env[] |
| `layer` | yes | service | path, responsibilities[], rules[] |
| `module` | no | service, layer | path, responsibilities[], exports[] |
| `entity` | no | top level, datastore, layer, service | fields[] (Field), indexes[{fields[], unique}] |
| `datastore` | yes | top level | engine, version, purpose |
| `api` | no | top level | style (rest/graphql/grpc/trpc/websocket/other), basePath, version, auth, operations[] |
| `integration` | no | top level | provider, category, purpose, docsUrl, sdk, env[] |
| `queue` | no | top level | technology, channels[{id, name, description, payload: TypeShape}] |
| `actor` | no | top level | type (human/system), goals[] |
| `note` | no | top level, service, layer, datastore | color (the text is `description`) |

| Edge kind | From → To | `data` |
|---|---|---|
| `depends_on` | service/layer/module → service/layer/module | — |
| `calls` | service/module → api/service | protocol, operations[] (op ids on the target API) |
| `exposes` | service/module → api | — |
| `accesses` | service/layer/module → datastore/entity | mode read/write/read-write |
| `publishes` / `subscribes` | service/module → queue | channelId |
| `uses` | service/module → integration | purpose |
| `relation` | entity → entity (self allowed) | cardinality, foreignKey (on the target / "many" side), required, onDelete |
| `interacts` | actor → service/api | via |

- **`Field`**: `{ name (identifier), type (string text int float decimal boolean date datetime uuid email url json enum ref), required, list, unique, primary, default|null, enumValues[], refEntityId|null, description }`.
- **`TypeShape`** (API request/response, channel payload): `{ entityId|null, list, fields[], description }`. When `entityId` is set, the shape is that entity (or a list of it) and `fields` is ignored; otherwise it is the inline fields.
- `catalog.ts` (VERIFIED) holds the human/agent descriptions of every kind, the `PATTERNS` list, the architecture-style descriptions and the helpers `allowedEdgeKinds(from, to)` (most likely kind first) and `canContain(parentKind|null, childKind)`. The canvas, `integrity.ts` and the MCP schema tool all use these. Never duplicate the rules elsewhere.
- **Ids** (`ids.ts`, VERIFIED): node ids `svc_/lyr_/mod_/ent_/dst_/api_/int_/que_/act_/nte_` + 10 base36 chars; edges `e_…`; list items `stk_/cnv_/adr_/op_/ch_` + 8 chars. Imported documents may use any id matching `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`. Ids are stable forever and are what agents reference.

### 7.2 Integrity (VERIFIED `integrity.ts`)

`checkIntegrity(doc)` returns `Issue[]` (`{severity, code, message, nodeId?, edgeId?}`). Every issue it returns is an `error`, and `safeParseDesign` rejects a document that has any. The codes are:
- Duplicate ids: `node.duplicate_id`, `stack.duplicate_id`, `conventions.duplicate_id`, `decisions.duplicate_id`, `api.duplicate_operation_id`, `queue.duplicate_channel_id`, `edge.duplicate_id`.
- Containment: `node.unknown_parent`, `node.bad_parent`, `node.needs_parent`, `node.parent_cycle`.
- Field and reference checks: `field.duplicate`, `field.enum_without_values`, `field.ref_without_entity`, `ref.not_entity`, `entity.index_unknown_field`, `scope.unknown_node`.
- Edge checks: `edge.unknown_endpoint`, `edge.bad_endpoints`, `edge.self_loop` (relation excepted), `edge.duplicate` (same kind, source and target), `edge.unknown_operation`, `edge.unknown_channel`.

`safeParseDesign` also reorders nodes parents-first, which React Flow requires.

### 7.3 Graph index (`graph.ts`, Phase 1)

```ts
export interface DesignIndex {
  doc: DesignDocument;
  node(id: string): DesignNode | undefined;
  /** Children of a node (null = top level), sorted by position.y then position.x then name. */
  children(parentId: string | null): DesignNode[];
  ancestors(id: string): DesignNode[];            // nearest first
  descendants(id: string): DesignNode[];          // depth-first, children order
  outgoing(id: string, kind?: EdgeKind): DesignEdge[];
  incoming(id: string, kind?: EdgeKind): DesignEdge[];
  /** "API › Application › Task use cases" */
  path(id: string): string;
  serviceOf(id: string): NodeOfKind<"service"> | null;   // itself or nearest ancestor service
  layerOf(id: string): NodeOfKind<"layer"> | null;
  /**
   * Stack that applies to a node: items scoped to the node or an ancestor (nearest scope wins
   * per category) + project-wide items whose category is not overridden. Project order kept.
   */
  stackFor(id: string): StackItem[];
  conventionsFor(id: string): Convention[];       // project-wide + scoped to node or ancestors
  findByName(name: string): DesignNode[];         // case-insensitive exact match
}
export function indexDesign(doc: DesignDocument): DesignIndex;
```

Build the maps once (O(n + e)). Every other Phase 1 module takes a `DesignIndex`.

### 7.4 Validation (`validate.ts`, Phase 1)

`validateDesign(doc): Issue[]` returns `checkIntegrity(doc)` plus the rules below. Sort the result errors → warnings → info, then by node order. Each message names the nodes involved by `name`.

| Code | Severity | Rule |
|---|---|---|
| `design.empty` | info | No nodes |
| `overview.no_summary` | info | `overview.summary` is empty |
| `stack.no_language` | warning | No project-wide `language` stack item **and** at least one service with empty `data.language` |
| `service.no_path` | warning | More than one service, and this one has an empty `data.path` |
| `service.duplicate_path` | warning | Two services share a non-empty `path` |
| `env.duplicate` | warning | A service or integration declares the same env var name twice |
| `node.duplicate_name` | warning | Siblings (same `parentId`) of the same kind with the same name, case-insensitive |
| `node.no_description` | info | A service, module, api or integration with an empty description **and** no responsibilities/purpose |
| `layer.empty` | info | A layer with no children |
| `layer.dependency_violation` | warning | A `depends_on` or `calls` edge from a node in layer A to a node in layer B of the same service, where A ≠ B and there is no direct `depends_on` A → B. Message: "Task routes (HTTP) depends on Task model (Domain), but HTTP has no depends_on to Domain" |
| `dependency.cycle` | warning | A cycle in `depends_on` edges (Tarjan SCC; one issue per cycle, listing names in order) |
| `api.no_implementer` | warning | An api with no incoming `exposes` |
| `api.no_operations` | warning | An api with zero operations |
| `api.rest_incomplete` | warning | A REST operation without a method or path |
| `api.duplicate_route` | warning | Two REST operations with the same method + path |
| `entity.no_fields` | warning | An entity without fields |
| `entity.no_primary_key` | warning | An entity inside a datastore with no `primary` field |
| `relation.fk_missing` | warning | `relation.data.foreignKey` is set, but the target entity has no field with that name |
| `datastore.unused` | warning | No `accesses` edge to the datastore or to any entity inside it |
| `integration.unused` | warning | No incoming `uses` |
| `queue.no_channels` | warning | A queue with zero channels |
| `queue.no_producer` / `queue.no_consumer` | warning | A queue (or a specific channel, when edges name channels) without publishes/subscribes |
| `edge.channel_unset` | info | publishes/subscribes with `channelId: null` while the queue has more than one channel |

Tests: the example yields **no errors and no warnings** (adjust the example only if a rule is clearly right). Add one minimal failing document per rule.

### 7.5 Brief (`brief.ts`, Phase 1)

`renderBrief(input: { project: { name, slug, description }, document, revision: number, version: { number, label } | null, statuses?: Map<string, ComponentStatus> }): string` returns deterministic markdown. It is the main thing agents read, so keep it complete, compact and ordered:

```
# <name> — design brief
> project `<slug>` · <"draft revision 12" | "version 3 (<label>)"> · generated by Project Design
> Ids in [brackets] are stable. Use them with get_component, get_api_contract and set_component_status.
> MUST conventions and layer rules are hard constraints.

<description>

## Overview          summary · Goals (list) · Non-goals (list) · Architecture style: <style> — <catalog description> · notes · Repository: <layout>, <packageManager>, notes
## Tech stack        table: Category | Choice | Version | Applies to (names, or "everything") | Notes
## Conventions       ### MUST / ### SHOULD / ### MAY, each "- [id] (category) rule — applies to: names" (omit empty levels)
## Components        nested list in children() order, top-level kinds service → datastore → api → queue → integration → actor (notes go to ## Notes):
                     - **Name** [id] — <kind> · <type> · <language / framework / runtime> · `path` · port N · status: done
                       - Responsibilities: …; Exports: `a`, `b`; Rules: …; Patterns: Repository (notes), …
                       - Depends on: X, Y · Calls: Tasks REST API (listTasks, createTask) over http · Accesses: Main database (read-write) · Publishes: Domain events/task.assigned · Uses: Resend (purpose)
                       (children nested two spaces deeper)
## Data model        per datastore: "### Main database [dst_pg] — postgres 18 — purpose", then per entity "#### Task [ent_task]" + field table (Field | Type | Required | Unique | Default | Notes) + "Indexes:" + relation lines "Project 1—N Task via Task.projectId (required, on delete cascade)"; domain entities (not in a datastore) under "### Domain models"
## APIs              per api: "### Tasks REST API [api_rest] — rest · base /v1 · version 1.0.0 · auth bearer · implemented by: API · consumed by: Tasks UI" + table Operation | Method | Path | Request | Response | Errors
## Messaging         per queue: "### Domain events [que_events] — redis-streams" + "- `task.assigned` [ch_assigned] — payload { taskId: uuid, assigneeId: uuid } · producers: … · consumers: …"
## Integrations      per integration: "### Resend [int_email] — email · sdk `resend` · docs <url> · used by: Notifier — purpose" + env list
## Environment       table Service/Integration | Variable | Required | Secret | Description | Example
## Actors            "- Team member [act_member] (human) — goals; interacts with Web via browser"
## Decisions         "### [adr_events] <title> — accepted · 2026-10-01" + Context / Decision / Consequences paragraphs
## Notes             "- <name> [id] (in <parent>): text"
## Build order       numbered list from buildPlan(): "1. [id] <title> — after: a, b"
```

- Leave out sections that would be empty, except `## Overview` and `## Components`.
- Type formatting (`formatShape`, `formatFieldType`, exported for reuse):
  - An entity shape prints as `Task` or `Task[]`.
  - Inline fields print as `{ title: string, assigneeId?: uuid }`, where `?` marks not required and `[]` marks a list.
  - Enums print as `enum(open|done)`; refs print the entity name.
  - A missing shape prints as `—`.
- Test with a vitest file snapshot: `expect(renderBrief(...)).toMatchFileSnapshot("./__fixtures__/team-tasks.brief.md")`. Review the first generated file by eye, since it is the product's main output.

### 7.6 OpenAPI (`openapi.ts`, Phase 1)

`toOpenApi(index, apiId): object | null` returns `null` for non-REST styles. Otherwise it builds `openapi: "3.1.0"`:
- **`info`, `servers`:** `info` is `{ title: api.name, version: data.version || "0.0.0", description }`; `servers` is `[{ url: basePath || "/" }]`.
- **`paths[path][method]`:** each entry is `{ operationId: name, summary, parameters, requestBody?, responses, security? }`.
  - Path params come from `{x}` in the path (`in: path`, `required: true`, `schema: {type: string}`).
  - `requestBody` (only when `request` is set) is `application/json`.
  - The success response is `"200"` with the response schema, or `"204"` when there's no response.
  - Each error becomes `"<status>": { description }`.
- **Schemas:** inline shapes become object schemas. Entities go under `components.schemas.<SafeName>`, including entities reachable through `ref` fields (collect transitively) and referenced with `$ref`. Lists become `{ type: "array", items }`.
- **Field type mapping:**
  - `string` and `text` → `string`; `int` → `integer`; `float` → `number`; `boolean` → `boolean`.
  - `decimal` → `string` + `format: decimal`.
  - `date` / `datetime` / `uuid` / `email` / `url` → `string` + format `date` / `date-time` / `uuid` / `email` / `uri`.
  - `json` → `{}`; `enum` → `string` + `enum`; `ref` → `$ref`.
  - A field becomes `required` when `required` is true.
  - `default`: parse numbers and booleans for numeric and boolean types; otherwise keep the string.
- **Security:**
  - Scheme by `api.auth`: `bearer` (and `oauth2`) → `{type: http, scheme: bearer}`; `api-key` → `{type: apiKey, in: header, name: "X-API-Key"}`; `session` → `{type: apiKey, in: cookie, name: "session"}`; `none` / `other` → none.
  - Top-level `security` applies the scheme. An operation with `auth: "none"` sets `security: []`.
- **Test:** file snapshot `__fixtures__/team-tasks.openapi.json`. Also assert three operations, a `Task` `$ref`, and the `{projectId}` parameter.

### 7.7 Data model (`datamodel.ts`, Phase 1)

`dataModel(index, datastoreId?)` returns `{ datastores: [{ id, name, engine, version, entities: [{ id, name, fields, indexes }] }], domainModels: Entity[], relations: [{ id, from, to, cardinality, foreignKey, required, onDelete }] }`.

`toMermaidEr(model)` returns an `erDiagram`:
- Entity names are sanitised to `[A-Za-z0-9_]`.
- Field lines are `type name PK|FK|UK`. FK is detected from relation `foreignKey`.
- Cardinality: one-to-one `||--||` (required) / `||--o|`; one-to-many `||--|{` (required) / `||--o{`; many-to-many `}o--o{`. The label is the foreign key, or `"relates"`.

Test with file snapshot `__fixtures__/team-tasks.er.mmd`.

### 7.8 Build plan (`build-plan.ts`, Phase 1)

```ts
export interface BuildStep {
  order: number;                 // 1-based
  id: string;                    // node id, or "setup"
  kind: NodeKind | "setup";
  title: string;                 // "Implement Task use cases"
  path: string;                  // index.path(id)
  dependsOn: string[];           // step ids that must come first (direct)
  status: ComponentStatus | null;
  instruction: string;           // one or two sentences, ends with: Details: get_component("<id>").
  cycle?: true;                  // emitted while breaking a dependency cycle
}
export function buildPlan(index: DesignIndex, statuses?: Map<string, ComponentStatus>): BuildStep[];
```

**Algorithm:**
1. The first step is always `setup` ("Repository & tooling": layout, package manager, project-wide stack, lint/test tooling, MUST conventions).
2. Candidates are all nodes except `actor` and `note`. "Y before X" constraints:
   - X `depends_on` Y; X `calls` Y (api or service); X `exposes` api Y; X `accesses` Y; X `publishes`/`subscribes` Y; X `uses` Y.
   - The parent comes before the child. A datastore comes before its entities.
   - Entities referenced by an API's shapes, or by `ref` fields, come before that API or entity.
3. Run Kahn's algorithm. The ready-queue tie-break is kind priority (datastore 0, entity 1, queue 2, integration 3, api 4, service 5, layer 6, module 7), then parents-first document order.
4. If Kahn stalls (a cycle), take the remaining node with the lowest priority and document position, mark it `cycle: true`, and continue.
5. Instruction templates per kind:
   - datastore: "Provision <engine> <version> for <purpose>…"
   - entity in a datastore: "Create the <name> table/collection (fields…) and its migration"
   - domain entity: "Define the <name> type in <parent path>"
   - queue: "Set up <technology> with typed producers/consumers for <channels>"
   - integration: "Wrap <provider> (<sdk>) behind an adapter; credentials from <env>"
   - api: "Define the <style> contract for <ops>; use get_api_contract"
   - service: "Scaffold the <type> at <path> with <language>/<framework>…"
   - layer: "Create <path>; enforce <rules>; may depend on <layers>"
   - module: "Implement <name> in <path> exposing <exports>"

**Test:** for the example, assert `setup` is first, `dst_pg` comes before `ent_task`, `ent_task` before `api_rest`, `api_rest` before `svc_api` before `mod_routes`, and `lyr_domain` before `lyr_app` before `lyr_http`. Add a cycle test.

### 7.9 Diff (`diff.ts`, Phase 1)

```ts
export interface ItemChange<T> { before: T; after: T; fields: string[] }
export interface Section<T> { added: T[]; removed: T[]; changed: ItemChange<T>[] }
export interface DesignDiff {
  overview: string[];                       // changed overview keys
  stack: Section<StackItem>; conventions: Section<Convention>; decisions: Section<Decision>;
  nodes: Section<DesignNode>; edges: Section<DesignEdge>;
  isEmpty: boolean;
}
export function diffDesigns(before: DesignDocument, after: DesignDocument): DesignDiff;
export function renderDiffMarkdown(diff: DesignDiff, after: DesignIndex, before: DesignIndex): string;
```

- Match items by `id`.
- `fields` lists the changed top-level keys, using dotted paths for `data.*` (`data.fields`, `data.operations`). Compare each key by stable JSON.
- Ignore `position` and `size`, since they are layout only, but **report `parentId` changes**.
- In the markdown, use headings per section with bullets like `+ Added module **Audit log** [mod_x] in API › Application`, `~ Changed **Task** [ent_task]: data.fields`, `- Removed …`.
- Tests: no changes → `isEmpty`; a moved node is still empty; a reparented node is a change; add/remove/change cases for each section.

### 7.10 Import/export envelope (`export-format.ts`) and slugs (`slug.ts`), Phase 1

```ts
export const ExportEnvelopeSchema = z.object({
  format: z.literal("project-design"),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  project: z.object({ name: z.string().min(1).max(120), slug: z.string(), description: z.string().default("") }),
  version: z.object({ number: z.number().int().positive(), label: z.string() }).nullable(),
  document: z.unknown(),                     // validated separately with safeParseDesign
});
export function toEnvelope(project, document, version): ExportEnvelope;
/** Accepts an envelope or a bare document ({ schemaVersion: 1, … }). */
export function readImport(json: unknown): { project: { name; slug; description } | null; document: unknown };
```

`slugify(name)` does the following: NFKD, strip diacritics, lowercase, runs of non-`[a-z0-9]` → `-`, trim dashes, cut to 60 characters, fall back to `"project"`. The result must satisfy the DB check `^[a-z0-9]+(-[a-z0-9]+)*$`.

## 8. Persistence and services (`src/server`)

### 8.1 Tables (VERIFIED `src/server/db/schema.ts`; migration generated in §5)

| Table | Columns | Notes |
|---|---|---|
| `projects` | id uuid PK, slug text unique (check `^[a-z0-9]+(-[a-z0-9]+)*$`), name, description, document jsonb, revision int (starts at 1), created_at, updated_at | The draft |
| `project_versions` | id, project_id FK cascade, version int, label, notes, document jsonb, source_revision, created_at; unique (project_id, version) | Immutable snapshots |
| `api_tokens` | id, name, token_hash unique, token_prefix, project_id FK cascade (nullable = all projects), created_at, last_used_at, revoked_at | Deleting a project deletes its scoped tokens |
| `component_status` | (project_id, node_id) PK, status check (todo, in_progress, done, blocked), note, updated_by_token_id FK set null, updated_at | Agent progress |

Schema changes: edit `schema.ts`, then run `npm run db:generate -- --name <change>` and commit the SQL. The app migrates itself on boot (`MIGRATE_ON_START`, default true); tests migrate the test DB in `tests/setup/global-setup.ts`.

### 8.2 Services (Phase 2)

Every function takes `db: Db` first, so tests can pass the test DB. A `principal?: Principal` argument restricts visibility; it is omitted for UI calls, which are trusted.

**`projects.ts`** (replaces the prototype; keep the existing exports compatible):

| Function | Behaviour |
|---|---|
| `listProjects(db, principal?)` | `{ slug, name, description, revision, latestVersion: number \| null, nodeCount, updatedAt }[]` ordered by `updatedAt desc`. `latestVersion` comes from a `max(version)` subquery and `nodeCount` from `jsonb_array_length(document->'nodes')` |
| `getProject(db, slug, principal?)` | The row, or `AppError NOT_FOUND`. A scoped principal sees only its project |
| `createProject(db, { name, slug?, description?, document? })` | `slug ?? slugify(name)`. On a unique violation (pg code `23505`), retry with `-2`, `-3` … up to `-50`. The document defaults to `emptyDesign()` and always goes through `parseDesign`. Returns the row |
| `updateProjectMeta(db, slug, { name?, description?, slug? })` | A new slug must be valid and unused (CONFLICT). Doesn't bump `revision` |
| `duplicateProject(db, slug, { name })` | Copies the draft with a new slug. Versions, tokens and statuses are not copied |
| `deleteProject(db, slug)` | Hard delete; cascades to everything else |
| `saveDraft(db, slug, { revision, document })` | `safeParseDesign`; on failure, `VALIDATION` with the issues. Runs `UPDATE projects SET document, revision = revision + 1, updated_at = now() WHERE slug = $1 AND revision = $2 RETURNING revision, updated_at`. Zero rows → check that the project exists (`NOT_FOUND`), else `CONFLICT` with `details: { currentRevision }` |
| `importProject(db, json)` | `readImport` → `safeParseDesign` (VALIDATION with issues) → `createProject`, using the envelope's name/slug/description, or `"Imported design"` |
| `exportProject(db, slug, ref)` | `resolveDocument` → `toEnvelope` |

**`versions.ts`:**

| Function | Behaviour |
|---|---|
| `publishVersion(db, slug, { label, notes })` | In a transaction: `SELECT … FOR UPDATE` the project row; `next = coalesce(max(version), 0) + 1`. If the latest version's document has a `diffDesigns(...).isEmpty` diff against the draft, return `VALIDATION "No changes since version N"`. Otherwise insert `{ document: draft, sourceRevision: revision }` and return `{ version, createdAt }` |
| `listVersions(db, slug)` | `{ version, label, notes, sourceRevision, createdAt, nodeCount }[]` newest first |
| `getVersion(db, slug, version)` | The row, or NOT_FOUND |
| `resolveDocument(db, slug, ref: "draft" \| "latest" \| number, principal?)` | `{ project: {id, slug, name, description}, document, revision, version: { number, label } \| null }`. `"latest"` with no versions → `NOT_FOUND "No published version yet; use version \"draft\""` |
| `restoreVersion(db, slug, version, { revision })` | `saveDraft` with the version's document (409 rules apply) |

**`status.ts`:**
- `setComponentStatus(db, projectId, nodeId, { status, note }, tokenId?)` upserts with `onConflictDoUpdate`.
- `getStatuses(db, projectId)` returns `Map<nodeId, { status, note, updatedAt }>`.
- A status row whose node no longer exists is ignored by readers and never deleted.

**`tokens.ts`:** VERIFIED (`createToken`, `verifyToken`, `listTokens`, `revokeToken`, `hashToken`). The plaintext is returned once, by `createToken` only.

**Tests (Phase 2, `tests/*.integration.test.ts`, each file calls `beforeEach(resetDb)`):**
- slug collisions (`team-tasks`, `team-tasks-2`);
- `saveDraft` happy path increments the revision; a stale revision gives CONFLICT with `currentRevision`; an invalid document gives VALIDATION with issue codes;
- two concurrent saves with the same revision: exactly one wins;
- publish numbering 1, 2; "no changes" refused; `resolveDocument` for draft / latest / number / missing;
- restore;
- import from an envelope and from a bare document, invalid import rejected;
- export round-trip (`import(export(x))` gives an equal document);
- delete cascades;
- token scoping and revocation (already covered by the VERIFIED MCP test);
- status upsert.

## 9. MCP server (`src/server/mcp`)

### 9.1 Endpoint (VERIFIED `src/app/api/mcp/route.ts`)

- `GET`/`POST`/`DELETE /api/mcp`.
- Auth: `Authorization: Bearer pd_…` → `verifyToken` → principal, passed as `authInfo.extra.principal`. A missing or invalid token gets 401 with `WWW-Authenticate: Bearer error="invalid_token"`.
- The handler is created once per process. Its factory builds a fresh `McpServer` per request, so serving is stateless: modern 2026-07-28 traffic plus the 2025 stateless fallback, with the default `responseMode: "auto"`.
- **Don't** add sessions, an SSE event store, or Origin checks; bearer auth already blocks browser-driven calls.

### 9.2 Common tool arguments (`context.ts`)

```ts
const ProjectArg = z.string().optional()
  .describe("Project slug. Optional when the token is scoped to one project or only one project exists.");
const VersionArg = z.union([z.literal("draft"), z.literal("latest"), z.number().int().positive()])
  .default("draft")
  .describe('"draft" (current, default), "latest" (newest published version) or a version number.');
```

`resolveTarget(ctx, { project, version })` turns these into `{ project, document, index: indexDesign(document), revision, version, statuses }`:
- The project comes from the argument, or the token's scope, or the only visible project.
- Otherwise it returns a tool error: "Several projects are available: a, b. Pass project." Unknown project: "Unknown project "x". Available: a, b".

Every tool result is `{ content: [{ type: "text", text }] }`. JSON is `JSON.stringify(value, null, 2)` and markdown is plain text. Domain failures use `isError: true` (`toolError(message)` helper). Register tools in `tools/*.ts`, one file per group, each exporting `register…(server, ctx)`.

### 9.3 Tools

All tools are `annotations: { readOnlyHint: true, openWorldHint: false }` except `set_component_status`. Descriptions are written for agents; use them as given.

| Tool | Input | Output | Description (verbatim) |
|---|---|---|---|
| `list_projects` | — | `[{ slug, name, description, revision, latestVersion, updatedAt }]` | "List the project designs this token can read. Call first if you don't know the project slug." |
| `get_design_schema` | — | `{ guide, nodeKinds: NODE_KIND_META, edgeKinds: EDGE_KIND_META, fieldTypes: FIELD_TYPE_DESCRIPTIONS, architectureStyles, patterns: PATTERNS, jsonSchema: designJsonSchema() }` | "Explain the design format: what every node kind, edge kind and field type means, containment rules, and the JSON Schema of a design document. Read once before interpreting a design." `guide` is a short fixed markdown text in `tools/schema.ts`: how containment, positions, ids, scopes, TypeShape and versions work |
| `get_project_brief` | project?, version? | markdown (§7.5) | "The whole design as a markdown brief: overview, stack, conventions, component tree, data model, APIs, messaging, integrations, env vars, decisions and build order. Start here before writing code." |
| `get_project_design` | project?, version? | `{ project: {slug,name,description}, revision, version, document }` | "The raw design document (JSON) for exact values. Prefer get_project_brief for reading and get_component for one part." |
| `list_components` | project?, version?, kind? (enum of NODE_KINDS), parentId? | `[{ id, kind, name, path, parentId, status }]` | "List components (nodes), optionally filtered by kind or parent." |
| `get_component` | project?, version?, `id` (id **or** exact name) | `{ component, path, parent: {id,name,kind}\|null, children: [{id,name,kind}], relations: { outgoing: [{ edgeId, kind, label, data, target: {id,name,kind} }], incoming: [...] }, stack: StackItem[], conventions: Convention[], allowedLayerDependencies?: [{id,name}] (layers and nodes inside layers), status }` | "Everything needed to implement one component: its definition, where it sits, what it depends on and what depends on it, the stack and conventions that apply to it, and its status." A name matching several nodes returns a tool error listing `name [id] (kind)` candidates |
| `get_api_contract` | project?, version?, `api` (id or name), format `"openapi"` (default) \| `"json"` | OpenAPI 3.1 JSON (§7.6), or `{ api: node, implementedBy, consumedBy, entities }` for json | "The contract of one API. REST APIs are returned as OpenAPI 3.1; use format json for other styles." OpenAPI on a non-REST API → tool error suggesting json |
| `get_data_model` | project?, version?, datastore? (id or name), format `"json"` (default) \| `"mermaid"` | §7.7 | "Entities, fields, indexes and relations, for one datastore or all of them, as JSON or a Mermaid ER diagram." |
| `get_build_plan` | project?, version? | `{ steps: BuildStep[] }` (§7.8) with current statuses | "A dependency-ordered list of implementation steps. Work through it in order, calling get_component for each step." |
| `validate_design` | project?, version? | `{ errors, warnings, infos, issues: Issue[] }` | "Check the design for problems (broken rules, unused or unimplemented parts, layer violations). Report warnings that affect your work instead of guessing." |
| `get_design_changes` | project?, `from` (int version), `to` (`"draft"` default \| int) | `{ from, to, summary: renderDiffMarkdown, diff: DesignDiff }` | "What changed in the design between two versions (or a version and the draft). Use to update an existing codebase incrementally." |
| `set_component_status` | project?, `id`, `status` (todo \| in_progress \| done \| blocked), note? (≤ 2000) | `{ ok: true, id, status }` | "Record implementation progress for a component (shown on the canvas). Set in_progress when you start, done when it builds and its tests pass, blocked with a note if the design stops you." Annotations `{ readOnlyHint: false, idempotentHint: true, openWorldHint: false }`. The id must exist in the **draft**; otherwise a tool error |

### 9.4 Prompts (`prompts.ts`)

Prompt arguments are strings. Each prompt returns a single user message. Substitute `<slug>` (resolved as in §9.2; when unresolvable, say "the project").

- **`implement_design`** `{ project?: string }`:
  > You are implementing the project "<name>" (`<slug>`) from its design in the project-design MCP server.
  > 1. Call `get_project_brief` and read all of it. MUST conventions and layer rules are hard constraints.
  > 2. Call `get_build_plan` and work through the steps in order. For each step, call `get_component` (and `get_api_contract` / `get_data_model` where relevant) before writing code.
  > 3. Call `set_component_status` with `in_progress` when you start a step. Set `done` once it builds and its tests pass, or `blocked` with a note that explains why.
  > 4. Don't invent components, endpoints, fields or dependencies that are not in the design. If the design is missing something you need, stop and say exactly what is missing.
  > 5. When you're finished, call `validate_design` and report anything that affected the implementation.
- **`sync_design_changes`** `{ project?: string, since: string }`:
  > Call `get_design_changes` with `from: <since>`. Update the existing codebase so it matches the current draft. Change only what the diff requires, keep the existing code style, and update the status of each component you touch. List any change you could not apply.
- **`review_against_design`** `{ project?: string }`:
  > Read `get_project_brief`, then review this repository against it. List the deviations, grouped as: missing components, extra or forbidden dependencies (layer rules), API mismatches (paths, methods, payloads), data model mismatches, stack or convention violations. Cite file paths. Don't change code.

### 9.5 Resources (`resources.ts`)

| URI | MIME | Content |
|---|---|---|
| `design://schema` | `application/schema+json` | `designJsonSchema()` |
| `design://projects/{slug}/brief` (`ResourceTemplate`, `list` = visible projects) | `text/markdown` | draft brief |
| `design://projects/{slug}/document` (`ResourceTemplate`, `list` = visible projects) | `application/json` | draft document |

Use `new ResourceTemplate("design://projects/{slug}/brief", { list: async () => ({ resources: [...] }) })` with `server.registerResource(name, template, { title, mimeType }, (uri, { slug }) => …)`.

### 9.6 Tests (Phase 3, `tests/mcp-tools.integration.test.ts`)

Reuse the VERIFIED `routeFetch` + `Client` pattern from `tests/mcp.integration.test.ts`.
- `tools/list` returns exactly the 12 names.
- Every tool works against the example. `get_project_brief` equals `renderBrief(...)` for the same input, and `get_component("Task use cases")` resolves by name.
- Ambiguous and unknown project/component errors are `isError`.
- `version: "latest"` before and after publishing.
- `get_design_changes` after an edit.
- `set_component_status`, then `get_build_plan` shows the status.
- A scoped token omits `project`.
- `prompts/list` and `prompts/get` substitute the slug; `resources/list` and `resources/read` for the brief.

### 9.7 Connecting agents (rendered on `/settings`, also in the README)

`APP_URL` (env) is the base. With token `pd_…`:

```bash
# Claude Code
claude mcp add --transport http project-design <APP_URL>/api/mcp --header "Authorization: Bearer pd_…"
```

```json
// .mcp.json in the generated repo (keep the token in an env var)
{ "mcpServers": { "project-design": { "type": "http", "url": "<APP_URL>/api/mcp",
  "headers": { "Authorization": "Bearer ${PROJECT_DESIGN_TOKEN}" } } } }
```

Generic: "Streamable HTTP MCP server at `<APP_URL>/api/mcp` with header `Authorization: Bearer <token>`". Show it with copy buttons. Recommend creating a **project-scoped** token per generated repo.

## 10. REST routes (Phase 2, `src/app/api/projects/**`)

Thin wrappers: parse input, call a service, return JSON. Wrap each in `try { … } catch (e) { return errorResponse(e) }`. GET handlers call `await connection()` first (§6.3).

| Route | Behaviour |
|---|---|
| `GET /api/projects/[slug]/design` | `{ revision, document, updatedAt }` |
| `PUT /api/projects/[slug]/design` | Body `{ revision: int, document }` (≤ 5 MB) → `saveDraft` → 200 `{ revision, updatedAt }` · 409 `CONFLICT` `details.currentRevision` · 422 issues |
| `GET /api/projects/[slug]/export?version=draft\|latest\|N` | Envelope JSON with `Content-Disposition: attachment; filename="<slug>-<ref>.design.json"` |
| `GET /api/projects/[slug]/brief?version=…` | `text/markdown; charset=utf-8`, filename `<slug>-<ref>.md` |
| `GET /api/projects/[slug]/status` | `{ statuses: { [nodeId]: { status, note, updatedAt } } }` |
| `POST /api/projects/import` | JSON body (envelope or bare document, ≤ 5 MB) → 201 `{ slug }` |

Tests (`tests/rest.integration.test.ts`): call the exported handlers directly with `new Request(...)`, as the MCP test does. Cover PUT success, 409, 422 and 413; export headers; brief content type; import 201 and 422.

## 11. UI specification

### 11.1 Visual direction

- shadcn `radix-nova` neutral theme with light, dark and system modes (`next-themes`, class strategy; React Flow `colorMode` follows `resolvedTheme`). Geist Sans/Mono, lucide icons.
- It's a dense, tool-like UI: 14 px base text, compact controls (`size="sm"` buttons in toolbars), no marketing chrome.
- Node kinds get a fixed accent colour. Use Tailwind palette classes on a 3 px left border and the kind icon tint: service indigo, layer slate, module sky, entity amber, datastore emerald, api violet, integration pink, queue orange, actor teal, note yellow. Keep the map in `components/designer/nodes/kind-style.ts`.
- Status badge colours: todo gray, in_progress blue, done green, blocked red.
- Layouts work from 1024 px wide. Below 1280 px the inspector becomes a `Sheet`.

### 11.2 App shell (Phase 4)

- `TopBar` (server component): "Project Design" wordmark linking `/`, nav links Projects (`/`) and Settings (`/settings`), and a `ThemeToggle` (client: light / dark / system dropdown).
- Pages under `/projects/[slug]` use the full viewport height (header 48 px + tabs 40 px + content).

### 11.3 Projects page `/` (Phase 4)

- **Header:** "Projects" title, plus `New project` (primary) and `Import` buttons.
- **Grid of `ProjectCard`s:** name (link), description (2-line clamp), meta line "rev 12 · v3 · 22 components · updated 2 h ago" (`Intl.RelativeTimeFormat`), and a `DropdownMenu` with Open / Rename / Duplicate / Export JSON (download link to the export route) / Delete.
  - Delete opens an `AlertDialog`: "Delete <name>? Versions, tokens scoped to it and agent statuses are deleted too."
- **New project dialog:** Name (required, ≤ 120 characters) and Description fields, with "Start from" radios **Blank** / **Example: Team Tasks**. On submit, `createProjectAction` redirects to `/projects/<slug>`.
- **Import:** a hidden file input (`.json`) → `POST /api/projects/import` → toast and `router.push`; a 422 shows the first three issue messages.
- **Empty state:** an icon, "No designs yet", and the two buttons.
- **Server actions** (`src/app/actions/projects.ts`): `createProjectAction`, `renameProjectAction`, `duplicateProjectAction`, `deleteProjectAction`. Validate with zod, call the service, `refresh()` or `redirect()`, return `{ ok, error? }`.

### 11.4 Settings `/settings` (Phase 4)

- **MCP tokens table:** Name, Token (`pd_ab12cd…`), Scope (All projects / project name), Created, Last used (relative or "never"), Revoked badge, and a `Revoke` action (confirm).
- **Create token dialog:** name, and scope `Select` (All projects + each project). On success, show the token **once** in a read-only input with Copy, the §9.7 snippets filled in, and the warning "You won't see this token again."
- **Connect panel:** the §9.7 snippets with a `<token>` placeholder, using `env().APP_URL`.
- Server actions in `src/app/actions/tokens.ts`.

### 11.5 Project layout `/projects/[slug]/*` (Phase 5)

- `layout.tsx` loads the data in `<Suspense>` (skeleton fallback) and wraps everything in `DesignerStoreProvider` + `<Autosave/>`.
- **Header** (left to right):
  - The project name (click to rename inline → `renameProjectAction`).
  - A `SaveIndicator`: "Saved", "Saving…", "Unsaved changes", "Couldn't save · Retry", or "Changed elsewhere · Reload".
  - Spacer.
  - `Validate` button with a count badge (errors red, else warnings amber) that toggles the validation panel.
  - `Publish` (dialog: label, notes → `publishVersionAction`, toast "Published v4").
  - `Export` (dialog: diagram as PNG / SVG / PDF / MMD diagram-as-code with live preview
    and background choice, plus Design JSON, Markdown brief and SQL DDL).
  - `Connect agent` (dialog with the §9.7 snippets and a link to `/settings`).
- **Tabs** (links, not client tabs): Canvas · Overview · Stack · Conventions · Decisions · Brief · Versions.
- `DesignerStoreProvider` (`store-provider.tsx`, client) holds `useState(() => createDesignerStore(initial))`, a React context, and `useDesigner(selector)` built on `useStore(store, selector)`. It also provides `useTemporal()` for undo/redo state, `useProjectMeta()` (`{ name, slug, description }` from the loader; the Brief tab needs it) and `saveNow()` from `<Autosave>`.
- Keyboard shortcuts are registered once in the layout: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z and Ctrl+Y redo, Ctrl/⌘+S save now. Ignore them while focus is in an input or textarea, except Ctrl/⌘+S.

### 11.6 Canvas tab (Phase 5)

**Layout.** Palette (left, 208 px) | React Flow (fills) | Inspector (right, 360 px; `Sheet` below 1280 px).

**Mapping (`to-flow.ts`, pure, unit-tested).**
- `toFlowNodes(doc, statuses, selection)` returns RF nodes: `{ id, type: kind, position, parentId, data: { node, status }, width/height from size for containers, selected, zIndex }`. Containers get zIndex 0, so children render above them.
- `toFlowEdges(doc, selection)` returns RF edges: `{ id, source, target, type: "design", data: { edge }, selected, markerEnd: arrow }`.
- Never add `extent: "parent"`. Nodes may be dragged out of a container to re-parent them.

**State sync.**
- The canvas keeps local RF state (`useNodesState`/`useEdgesState`), rebuilt from the store whenever `document` or `statuses` change. Selection is preserved by id.
- `onNodesChange` applies every change locally (smooth dragging, selection, dimensions). The store is touched only when:
  1. A position change has `dragging: false` (drag end). Call `commitGeometry` for the moved nodes, then re-parent the primary dragged node: compute `findDropParent(doc, id, absoluteCenter)`. If it differs from `parentId` **and** `canContain` allows it → `setParent`. If the node needs a parent (layer, module) and none is found → revert by rebuilding from the store and toast "A layer must sit inside a service".
  2. A dimension change has `resizing: false` → `commitGeometry` with the new size.
  3. `onNodesDelete` / `onEdgesDelete` → `removeElements`. Deleting a container with children first shows a confirm "Delete API and its 9 nested components?"
- Selection lives in a small separate zustand store, `selection-store.ts` (`{ nodeIds, edgeIds }`), set by `onSelectionChange` and read by the inspector and validation panel.

**Connecting.**
- `connectionMode={ConnectionMode.Loose}`; each node has a source and target `Handle` on all four sides.
- `isValidConnection` → `allowedEdgeKinds(sourceKind, targetKind).length > 0`.
- `onConnect`:
  - Zero allowed kinds → toast "A Datastore can't connect to an Actor".
  - One kind → `connect`.
  - Several → open `EdgeKindMenu` at the pointer, listing the allowed kinds with their `EDGE_KIND_META` labels and descriptions. Choosing one calls `connect(source, target, kind)`.
  - A `null` result (duplicate) → toast "Already connected".

**Palette.**
- One button per node kind (icon, label, description tooltip from the catalog).
- Drag uses HTML5 DnD with `application/x-design-kind`. On drop, `screenToFlowPosition` → `findDropParent` on a temporary rect → `addNode(kind, relativePosition, parent)`. When the kind needs a parent and the drop isn't on an allowed container, refuse with a toast.
- A click adds the node at the viewport centre (top level; disabled for layer/module unless a service or layer is selected, in which case the node goes inside it).
- The new node is selected and the inspector's name field focused.

**Node components** (`nodes/*`):
- **Shared parts:** `BaseNode` (card, kind accent, icon, kind label, name, subtitle, tags as small badges, pattern chips with up to 2 then "+n", status dot with tooltip "done · note…") and `ContainerNode` (title bar with the same parts, `NodeResizer` visible when selected, min 160×80, translucent body).
- **Subtitles:**
  - service: `type · language/framework · :port`
  - layer: path
  - module: first responsibility, or exports count
  - datastore: `engine version`
  - api: `style · N operations`
  - integration: `provider · category`
  - queue: `technology · N channels`
  - actor: type
- **Entities** list up to 6 fields as `name: type` rows (PK / ? markers) plus "+n more".
- **Notes** render the description text (line-clamped to the node height) on the note colour.
- The name and subtitle truncate with ellipsis.

**Edge component** (`edges/design-edge.tsx`):
- Smooth-step path with a label pill (`EDGE_KIND_META.label`, plus protocol for calls, mode for accesses, `1—N` / `1—1` / `N—N` for relation, channel name for publishes/subscribes).
- Styles: depends_on dashed muted; calls solid with arrow; exposes thick solid; accesses dotted; publishes/subscribes animated dashes; uses solid pink; relation solid amber with the cardinality label; interacts thin.

**Chrome.** `Background` (dots, gap 16), `MiniMap` (node colour by kind), `Controls`, `snapToGrid` [8, 8], `fitView` on first load only. The viewport is saved in `localStorage` key `pd:viewport:<slug>` on move end (try/catch) and restored on load. `deleteKeyCode={["Backspace", "Delete"]}`, `multiSelectionKeyCode="Shift"`.

**Toolbar** (top-left overlay): Undo, Redo (disabled per `useTemporal` past/future), Fit view, and toggles for the Validation panel and Minimap.

**Validation panel** (bottom-left overlay, 360×280, scrollable):
- `validateDesign(document)` memoised on `document`, grouped by severity, each issue with an icon and message.
- Clicking an issue selects its node or edge and centres it with `setCenter`.
- "No problems found" when empty.

**Status polling.** `useStatuses(slug)` fetches `/api/projects/[slug]/status` every 10 s while `document.visibilityState === "visible"`. It lives in a separate tiny store, since statuses are not part of the document or undo history.

### 11.7 Inspector (Phase 5)

The inspector shows the selected single node or edge. With nothing selected it shows "Select a component to edit it" plus counts by kind; with several selected, "N selected" and a Delete button.

**Text editing → undo granularity.** Text inputs keep local state and commit to the store on blur, Enter (single-line), or 600 ms after the last keystroke (`use-debounced-commit.ts`). Without this, every keystroke would become an undo step. Selects, switches and checkboxes commit immediately. Invalid input (checked with the zod field schema) shows a red helper text and is not committed.

**Common section (every node).**
- Name and Description (textarea; "Markdown supported").
- Tags (`TagsInput`: Enter or comma adds a tag, backspace removes the last).
- Patterns (`PatternsPicker`: a `Command` popover over `PATTERNS` grouped by category, plus a "Use '<typed>'" free entry; each chosen pattern has a notes input and remove ×).
- Parent (read-only path; "Move to…" `Select` of allowed containers → `setParent`).
- Status (read-only badge + note + updated time, if any).

**Per kind.**
- **service:** Type select, Language, Framework, Runtime, Path, Port (number or empty), Responsibilities (`StringList`), Env (`EnvEditor`: table Name / Required / Secret / Example / Description, add/remove).
- **layer:** Path, Responsibilities, Rules (`StringList`), plus a read-only "May depend on" list derived from the layer's `depends_on` edges.
- **module:** Path, Responsibilities, Exports (`StringList`, monospace).
- **entity:** `FieldsEditor` and an Indexes list (multi-select of field names + unique switch).
  - `FieldsEditor` is a compact table with one row per field: Name, Type select, Req, List, Unique, PK, Default, then the Enum values input (when enum) or Entity select (when ref), and a row menu with Move up / Move down / Description / Delete.
  - "Add field" appends `{ name: "field<n>", type: "string" }`.
- **datastore:** Engine select, Version, Purpose.
- **api:** Style, Base path, Version, Auth select, and an `OperationsEditor`.
  - The `OperationsEditor` is an accordion with one item per operation, headed `METHOD path · name`.
  - Each item has: Name, Summary, Method + Path (REST only), Auth (inherit/none/required), Request and Response (`ShapeEditor`), Errors (rows of status + description), and Delete.
  - "Add operation" generates `op_…` ids via `newItemId("op")`.
- **ShapeEditor:** a mode `Segmented`/`Select` of None / Entity / Inline fields. Entity mode has an entity select plus a List switch; Inline mode embeds a `FieldsEditor`.
- **integration:** Provider, Category, Purpose, Docs URL, SDK, Env.
- **queue:** Technology and a `ChannelsEditor` (one row per channel: name, description, payload `ShapeEditor`; ids via `newItemId("ch")`).
- **actor:** Type and Goals. **note:** Colour swatches.

**Edge inspector.**
- Shows the kind (a select limited to `allowedEdgeKinds(source, target)`; changing the kind replaces `data` with the new kind's defaults via `EdgeSchema.parse`), From → To names (click selects the node), Label and Description.
- Kind data:
  - calls: Protocol, plus Operations (a checkbox list of the target API's operations, when the target is an api).
  - accesses: Mode. publishes/subscribes: Channel select from the target queue.
  - relation: Cardinality, Foreign key (a select of the target entity's fields + free text), Required, On delete.
  - uses: Purpose. interacts: Via.

### 11.8 Section tabs (Phase 6)

All tabs edit the same store through `updateSections` and autosave like the canvas.
- **Overview:** Summary (textarea), Goals / Non-goals (`StringList`), Architecture style (`Select`; the catalog description shows under it), Architecture notes, Repository layout (radio), Package manager, Repository notes.
- **Stack:** a table grouped by category (category order as in `STACK_CATEGORIES`) with Name, Version, Applies to (badges of scoped node names, or "Everything"), Notes, and row actions Edit / Delete. The "Add" dialog has Category, Name, Version, Notes and Scope (a multi-select `Command` of services, layers and modules).
- **Conventions:** a list grouped by level (MUST / SHOULD / MAY) and showing category, rule text and scope. Edit inline (rule textarea commits on blur). Add with category, level, rule and scope.
- **Decisions:** a list of cards (title, status badge, date). Clicking opens an editor dialog with Title, Status, Date (`input type=date`), Context, Decision and Consequences.
- **Brief:**
  - The source is a `Select` of Draft (rendered client-side from the store with `renderBrief`, since it is pure) or a published version (fetch `/api/projects/[slug]/brief?version=N`).
  - Shows the read-only monospace markdown in a `ScrollArea` with Copy and Download buttons, and the line "This is exactly what `get_project_brief` returns."
  - The draft brief has no statuses unless they are passed in. Pass the polled statuses so it matches MCP.
- **Versions:**
  - A table of versions (Version, Label, Created, Components, Notes tooltip).
  - Row actions: **View changes vs draft** opens a dialog with `renderDiffMarkdown` output, rendered as a `<pre>`. **Export JSON** links to the export route. **Restore** shows a confirm ("Replaces the draft. Your current draft can be recovered with undo until you leave the page."), then `restoreVersionAction`, then `store.replaceDocument(doc, revision)`.
  - A `Publish` button in the tab header (same dialog as the header).
  - Empty state: "Publish a version to give agents a stable design to build against."
- Server actions in `src/app/actions/versions.ts`: `publishVersionAction(slug, { label, notes })`, which first flushes autosave (the client awaits `saveNow()`), and `restoreVersionAction(slug, version, revision)`, which returns `{ ok, revision, document }` so the client can call `replaceDocument`.

## 12. Autosave and concurrency (Phase 5, `components/designer/autosave.tsx`)

1. **Saving:**
   - Subscribe to the store. When `isDirty` and `status` is not `saving` or `conflict`, debounce **800 ms**.
   - Then `markSaving()`, capture `sent = document` and `rev = revision`, and `PUT /api/projects/[slug]/design { revision: rev, document: sent }`.
2. **Response handling:**

   | Response | Action |
   |---|---|
   | 200 | `markSaved(sent, body.revision)`. If still dirty (edits arrived while saving), schedule again |
   | 409 | `markSaveFailed("conflict", …)` and open a dialog "This design was changed somewhere else (another tab, an import or a restore)" with **Reload** (GET the design, `replaceDocument(doc, rev)`, clear zundo history) or **Keep mine** (GET to learn `revision`, set it, save again) |
   | 422 | `markSaveFailed("error", first issue message)`. This is a bug signal, so log the issues to the console |
   | Network / 5xx | `markSaveFailed("error", "Couldn't save")`, retry with backoff 2, 4, 8, 16, 30 s; the indicator's Retry button saves immediately |

3. **Other triggers:**
   - `saveNow()` (exposed via context) cancels the debounce and saves immediately; Ctrl/⌘+S calls it.
   - `beforeunload` warns while dirty or saving.
   - On route change within the project the store survives (layout), so nothing is needed.

**Tests:**
- Unit-test the scheduling logic as a pure function or class with fake timers (`createAutosaver({ save, delay })`).
- The 409 path is covered by an e2e test (§15 Phase 5).

## 13. Error handling matrix

| Situation | Behaviour |
|---|---|
| Save conflict (two tabs) | 409 → conflict dialog (§12); nothing is lost silently |
| Invalid document reaches the server | 422 with issues; the UI shows "Couldn't save"; the console has the issues |
| Database down | `/api/health` 503 → container unhealthy; pages show the Next error boundary (`src/app/error.tsx` with a Retry button, Phase 4); MCP returns tool errors via thrown exceptions (500 is fine) |
| Import of a bad file | 422 → toast with the first three issues |
| MCP with a missing, revoked or unknown token | 401 + `WWW-Authenticate` |
| MCP unknown or ambiguous project/component | Tool error listing the candidates |
| MCP `latest` with no versions | Tool error "No published version yet; use version "draft"" |
| Deleting a container | Confirm with the nested count; it is one undo step |
| Dropping a layer/module outside a service | Refused with a toast; the position reverts |
| Request body too large | 413 |
| Unknown slug in a page | Not-found UI (`src/app/projects/[slug]/not-found.tsx`; HTTP 200 inside Suspense, §6.3) |

## 14. Security notes

- **Exposure.** The UI and REST API require a GitHub sign-in; each user sees only their own projects and tokens. Compose binds every port to 127.0.0.1. The README must say: don't expose the app beyond localhost without `APP_BASIC_AUTH` and TLS.
- **Tokens.** MCP tokens carry 32 random bytes and only the SHA-256 hash is stored. The plaintext is shown once. Revocation is immediate; there is no caching of verification.
- **Queries and limits.** All SQL goes through Drizzle (parameterised). JSON bodies are size-limited (§6.2). Every inbound document is validated by zod and the integrity checks.
- **Rendering.** Render markdown and notes as text. No `dangerouslySetInnerHTML` anywhere.
- **Phase 7:** run the `/security-review` skill on the branch and fix what it finds.

## 15. Phases (do them in order; each ends with `npm run verify && npm run test:e2e` green, the Compose stack healthy, and a commit)

### Phase 7: Hardening and release (≈ 1.5 days)
- [ ] README: what the app is, a screenshot (`docs/screenshot.png`, taken by Playwright), Docker quick start, development, connecting agents (§9.7), backup/restore (`docker compose exec db pg_dump -U design project_design > backup.sql` / `psql` restore), env vars table, and security notes (§14).
- [ ] Run `/security-review` and fix the findings. Check that no `console.log` remains outside the `[migrate]`, `[mcp]`, `[api]`, `[auth]` and `[health]` prefixes.
- [ ] Docker: `docker compose down -v && docker compose up -d --build --wait` from a clean clone (`git clone . /tmp/pd-clean`). The image stays under 350 MB, and a restart keeps the data.
- [ ] Performance: with a 500-node synthetic design, `get_project_brief` stays under 200 ms locally (log the timing in a test, no assertion flakiness), and the design PUT stays under 300 ms.
- **Accept:** everything in §16 passes from a clean clone.

## 16. Verification commands (reference)

| Command | What it checks |
|---|---|
| `npm run format:check` | Prettier (ignores `src/components/ui`, `drizzle/meta`, the lockfile) |
| `npm run lint` | ESLint (next core-web-vitals + TS + import-boundary rules) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` (includes e2e and config files) |
| `npm run test` | Vitest `unit` project (`src/**/*.test.ts`) |
| `npm run test:integration` | Vitest `integration` project (`tests/**/*.integration.test.ts`) against `DATABASE_URL_TEST`; migrates it first |
| `npm run test:all` | Both projects |
| `npm run verify` | format:check → lint → typecheck → test:all → build |
| `npm run test:e2e` | Playwright; builds nothing itself, so run `npm run build` first (verify does). Starts `scripts/start-standalone.mjs` on :3100 against the test DB |
| `npm run db:up` | `docker compose up -d --wait db` |
| `npm run db:generate -- --name x` | New SQL migration from `schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` without starting the app |
| `docker compose up -d --build --wait` | Full stack; app healthy on :3000 (`APP_PORT`), db on 127.0.0.1:5434 (`DB_PORT`) |

---
## Appendix A — VERIFIED reference files

Generated from the verification scaffold on 2026-10-08. Every file below was installed, then `npm run verify` passed (Prettier, ESLint, typecheck, **18/18 Vitest tests**: 15 unit + 3 integration against Postgres 18, and `next build`), `npm run test:e2e` passed (1/1), and `docker compose up -d --build --wait` reported the app healthy. Each file was then extracted from this document into an empty directory and the §5 commands re-run there with the same results. Create each file at the path shown, byte for byte.

Not reproduced here because §5 generates them:
- `src/components/ui/*` (shadcn CLI);
- `drizzle/0000_init.sql` + `drizzle/meta/*` (drizzle-kit);
- `package-lock.json` and `next-env.d.ts`.

Files with a `PROTOTYPE` comment at the top are minimal versions that later phases replace (see §4).

### `package.json`

```json
{
  "name": "project-design",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "next typegen && tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:all": "vitest run",
    "db:up": "docker compose up -d --wait db",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx --env-file-if-exists=.env src/server/db/migrate-cli.ts",
    "verify": "npm run format:check && npm run lint && npm run typecheck && npm run test:all && npm run build",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^2.3.1",
    "@xyflow/react": "^12.12.0",
    "class-variance-authority": "^0.7.1",
    "cmdk": "^1.1.1",
    "cn": "^0.4.0",
    "drizzle-orm": "^0.45.3",
    "geist": "^1.7.2",
    "lucide-react": "^1.52.0",
    "next": "16.4.0",
    "next-themes": "^0.4.6",
    "pg": "^8.23.1",
    "radix-ui": "^1.7.0",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "sonner": "^2.0.8",
    "tw-animate-css": "^1.4.0",
    "zod": "^4.6.5",
    "zundo": "^2.3.0",
    "zustand": "^5.0.15"
  },
  "devDependencies": {
    "@modelcontextprotocol/client": "^2.3.1",
    "@playwright/test": "^1.64.0",
    "@tailwindcss/turbopack": "^4.3.3",
    "@types/node": "^24.19.1",
    "@types/pg": "^8.23.1",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "drizzle-kit": "^0.31.11",
    "eslint": "^9.39.5",
    "eslint-config-next": "16.4.0",
    "prettier": "^3.9.9",
    "shadcn": "^4.21.4",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.23.15",
    "typescript": "~6.0.3",
    "vitest": "^5.0.3"
  },
  "allowScripts": {
    "esbuild": true,
    "unrs-resolver": true
  },
  "engines": {
    "node": ">=24"
  }
}
```

### `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone so the Docker runtime stage ships only traced files.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

### `components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}
```

### `eslint.config.mjs`

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Browser-bound and isomorphic code must never pull in server modules (pg, secrets).
    files: ["src/components/**", "src/stores/**", "src/lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/server/*", "@/app/api/*"], message: "Server-only module." }] },
      ],
    },
  },
  {
    // The design core is shared by the canvas, the API and the MCP server.
    files: ["src/lib/design/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "@/app/*", "@/components/*", "@/stores/*"],
              message: "Keep src/lib/design pure.",
            },
            {
              group: ["react", "react-dom", "next", "next/*", "node:*"],
              message: "Keep src/lib/design isomorphic.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
```

### `vitest.config.mts`

```ts
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://design:design@localhost:5434/project_design_test";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/**/*.integration.test.ts"],
          globalSetup: ["tests/setup/global-setup.ts"],
          // Files share one database; run them one after another.
          fileParallelism: false,
          env: { DATABASE_URL: TEST_DATABASE_URL, MIGRATE_ON_START: "false" },
        },
      },
    ],
  },
});
```

### `playwright.config.ts`

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://design:design@localhost:5434/project_design_test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/start-standalone.mjs",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL, PORT: String(PORT), HOSTNAME: "127.0.0.1" },
  },
});
```

### `drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://design:design@localhost:5434/project_design",
  },
});
```

### `.prettierrc.json`

```json
{
  "printWidth": 100
}
```

### `.prettierignore`

```gitignore
.next
node_modules
drizzle/meta
package-lock.json
next-env.d.ts
test-results
playwright-report
# Generated by the shadcn CLI.
src/components/ui
# Plans, docs and vitest file snapshots are not code.
*.md
src/lib/design/__fixtures__
```

### `.gitignore`

```gitignore
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage
/test-results/
/playwright-report/

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*
!.env.example

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

### `.dockerignore`

```gitignore
.git
.next
node_modules
coverage
test-results
playwright-report
.env
.env.*
!.env.example
npm-debug.log*
Dockerfile
compose.yaml
```

### `.env.example`

```bash
# Copy to .env for `npm run dev`. Docker Compose sets these itself.
DATABASE_URL=postgres://design:design@localhost:5434/project_design
# Integration tests use a separate database (created by docker/postgres/init).
DATABASE_URL_TEST=postgres://design:design@localhost:5434/project_design_test
# Public base URL, used in the MCP connection snippets on /settings.
APP_URL=http://localhost:3000
# Optional "user:password". When set, every page and REST route asks for HTTP
# Basic auth. /api/mcp and /api/health are excluded (MCP uses bearer tokens).
APP_BASIC_AUTH=
```

### `Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1

# Next.js standalone build: the runtime stage runs `.next/standalone/server.js`
# instead of `next start`, so the final image carries no full node_modules.
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# git does not track empty directories; make sure the runtime COPY resolves.
RUN mkdir -p public && npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

# The standalone server does not copy `public` or `.next/static` itself.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Read at start-up by the migration runner (src/server/db/migrate.ts); file
# tracing only follows imports, so the SQL is not in the standalone output.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000

# Run the server as PID 1 so SIGTERM reaches it directly.
CMD ["node", "server.js"]
```

### `compose.yaml`

```yaml
name: project-design

services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: design
      POSTGRES_PASSWORD: design
      POSTGRES_DB: project_design
    ports:
      # 5434 on the host avoids clashing with a local Postgres on 5432.
      - "127.0.0.1:${DB_PORT:-5434}:5432"
    volumes:
      # Postgres 18 images keep data under /var/lib/postgresql/<major>/docker,
      # so the volume is mounted one level up from the old .../data path.
      - pgdata:/var/lib/postgresql
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U design -d project_design"]
      interval: 2s
      timeout: 3s
      retries: 30

  app:
    build: .
    environment:
      DATABASE_URL: postgres://design:design@db:5432/project_design
      APP_URL: ${APP_URL:-http://localhost:3000}
      APP_BASIC_AUTH: ${APP_BASIC_AUTH:-}
    ports:
      - "127.0.0.1:${APP_PORT:-3000}:3000"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 10s

volumes:
  pgdata:
```

### `docker/postgres/init/01-create-test-db.sql`

```sql
-- Runs once, when the db volume is first initialised. Integration tests
-- (npm run test:integration) use this database so dev data is never touched.
CREATE DATABASE project_design_test OWNER design;
```

### `AGENTS.md`

```md
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Design

A Next.js app for designing a software project (stack, architecture, layers,
modules, data, APIs, queues, integrations) on a canvas, exposed to coding agents
over MCP at `/api/mcp`. Work in progress is planned in `CURRENT_PLAN.md`.

## Commands

- `npm run db:up` — Postgres 18 in Docker on 127.0.0.1:5434 (dev + test databases)
- `npm run dev` — dev server on :3000 (migrates the database on start)
- `npm run verify` — format check, lint, typecheck, all Vitest tests, production build
- `npm run test` / `npm run test:integration` / `npm run test:e2e`
- `npm run db:generate -- --name <change>` — new SQL migration after editing `src/server/db/schema.ts`
- `docker compose up -d --build --wait` — full stack on :3000

## Rules

- `src/lib/design/schema.ts` is the one contract for design documents. Every document that
  enters the system goes through `parseDesign` / `safeParseDesign` (`integrity.ts`).
- `src/lib/design` is pure and isomorphic; `src/server` is server-only. Components and
  stores never import `@/server/*` (ESLint enforces both).
- Cache Components is on: read the database inside `<Suspense>`; call `await connection()`
  before uncached reads that use no request API, including in GET route handlers.
- Never edit `drizzle/` by hand; generate migrations.
- UI is shadcn/ui (`src/components/ui`, generated — don't hand-edit), Tailwind 4, lucide icons.
```

### `CLAUDE.md`

```md
@AGENTS.md
```

### `README.md`

````md
# Project Design

Design a software project — tech stack, architecture style, services, layers, modules,
data model, APIs, queues and integrations — on a canvas, then let coding agents read that
design over MCP and generate a codebase that matches it.

## Run it

```bash
docker compose up -d --build --wait
open http://localhost:3000
```

Data lives in the `pgdata` Docker volume. Ports bind to 127.0.0.1 only. To expose the app
beyond localhost, set `APP_BASIC_AUTH=user:password` (and put it behind TLS).

## Develop

```bash
cp .env.example .env
npm install
npm run db:up        # Postgres on 127.0.0.1:5434
npm run dev          # http://localhost:3000
npm run verify       # format, lint, typecheck, tests, build
```

## Connect an agent

Create a token under **Settings → MCP tokens**, then for Claude Code:

```bash
claude mcp add --transport http project-design http://localhost:3000/api/mcp \
  --header "Authorization: Bearer pd_…"
```
````

### `scripts/start-standalone.mjs`

```js
// Runs the standalone server the way the Docker image does (used by e2e).
// `next start` does not serve an `output: "standalone"` build's static files.
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const root = ".next/standalone";
if (!existsSync(`${root}/server.js`)) {
  console.error("No standalone build. Run `npm run build` first.");
  process.exit(1);
}
cpSync(".next/static", `${root}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${root}/public`, { recursive: true });
cpSync("drizzle", `${root}/drizzle`, { recursive: true });

const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
```

### `src/instrumentation.ts`

```ts
/**
 * Runs once per server instance, before the first request is served: the
 * place to migrate the database on start-up.
 */
export async function register() {
  // The Edge runtime has no TCP sockets, so `pg` is only imported on Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { env } = await import("@/server/env");
  const config = env();
  if (!config.MIGRATE_ON_START) return;

  const { runMigrations } = await import("@/server/db/migrate");
  await runMigrations(config.DATABASE_URL);
  console.log("[migrate] database is up to date");
}
```

### `src/proxy.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic auth for the UI and REST routes (APP_BASIC_AUTH="user:pass").
 * /api/mcp authenticates with bearer tokens and /api/health must stay open for
 * the container healthcheck, so the matcher skips both.
 */
export function proxy(request: NextRequest) {
  const expected = process.env.APP_BASIC_AUTH;
  if (!expected) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded && safeEqual(decodeBase64(encoded), expected)) {
    return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Project Design", charset="UTF-8"' },
  });
}

function decodeBase64(value: string): string {
  try {
    return atob(value);
  } catch {
    return "";
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!api/mcp|api/health|_next/static|_next/image|favicon.ico).*)"],
};
```

### `src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Design",
  description: "Design a project's architecture and expose it to coding agents over MCP.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### `src/app/globals.css`

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-geist-sans);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

### `src/app/icon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#6366f1" stroke-width="2.5">
  <rect x="3" y="3" width="11" height="9" rx="2" />
  <rect x="18" y="3" width="11" height="9" rx="2" />
  <rect x="10.5" y="20" width="11" height="9" rx="2" />
  <path d="M8.5 12v4h15v-4M16 16v4" />
</svg>
```

### `src/app/page.tsx`

```tsx
// PROTOTYPE — Phase 4 replaces this page (§11.2). Kept to prove the
// Cache Components data pattern: runtime DB reads live inside <Suspense>.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { getDb } from "@/server/db/client";
import { listProjects } from "@/server/services/projects";

async function ProjectList() {
  await connection();
  const projects = await listProjects(getDb());
  if (projects.length === 0) return <p className="text-muted-foreground">No projects yet.</p>;
  return (
    <ul className="space-y-2">
      {projects.map((p) => (
        <li key={p.id}>
          <Link className="underline" href={`/projects/${p.slug}`}>
            {p.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">Projects</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <ProjectList />
      </Suspense>
    </main>
  );
}
```

### `src/app/projects/[slug]/page.tsx`

```tsx
// PROTOTYPE — Phase 5 replaces this page with the designer (§12).
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DesignerCanvas } from "@/components/designer/canvas";
import { getDb } from "@/server/db/client";
import { getProjectBySlug } from "@/server/services/projects";

async function Designer({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(getDb(), slug);
  if (!project) notFound();
  return <DesignerCanvas document={project.document} />;
}

export default function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  return (
    <div className="h-dvh w-full">
      <Suspense fallback={<p className="p-8 text-muted-foreground">Loading design…</p>}>
        <Designer params={params} />
      </Suspense>
    </div>
  );
}
```

### `src/app/api/health/route.ts`

```ts
import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { getDb } from "@/server/db/client";

/** Liveness + database reachability, used by the Docker healthcheck. */
export async function GET() {
  // With Cache Components a GET handler without request data is prerendered at
  // build time; connection() keeps it per-request.
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[health]", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
```

### `src/app/api/mcp/route.ts`

```ts
import { createMcpHandler } from "@modelcontextprotocol/server";

import { getDb } from "@/server/db/client";
import { createDesignMcpServer } from "@/server/mcp/server";
import { verifyToken, type Principal } from "@/server/services/tokens";

// One handler per process. The factory builds a fresh McpServer per request
// (stateless), bound to the principal resolved from the bearer token.
const handler = createMcpHandler(
  (ctx) => {
    const principal = ctx.authInfo?.extra?.principal as Principal | undefined;
    if (!principal) throw new Error("unauthenticated MCP request reached the factory");
    return createDesignMcpServer({ db: getDb(), principal });
  },
  { onerror: (error) => console.error("[mcp]", error) },
);

function unauthorized(message: string): Response {
  return Response.json(
    { error: "invalid_token", error_description: message },
    { status: 401, headers: { "WWW-Authenticate": `Bearer error="invalid_token"` } },
  );
}

async function serve(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return unauthorized("Missing bearer token. Create one under Settings → MCP tokens.");
  const principal = await verifyToken(getDb(), match[1]);
  if (!principal) return unauthorized("Unknown or revoked token.");
  return handler.fetch(request, {
    authInfo: {
      token: match[1],
      clientId: principal.tokenId,
      scopes: [],
      extra: { principal },
    },
  });
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
```

### `src/components/providers.tsx`

```tsx
"use client";

import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </ThemeProvider>
  );
}
```

### `src/components/designer/canvas.tsx`

```tsx
"use client";
// PROTOTYPE — Phase 5 replaces this with the full designer (§12).
import "@xyflow/react/dist/style.css";

import { Background, Controls, MiniMap, ReactFlow, type Node } from "@xyflow/react";
import { useTheme } from "next-themes";
import { useMemo } from "react";

import type { DesignDocument } from "@/lib/design/schema";

export function DesignerCanvas({ document }: { document: DesignDocument }) {
  const { resolvedTheme } = useTheme();
  const nodes = useMemo<Node[]>(
    () =>
      document.nodes.map((n) => ({
        id: n.id,
        position: n.position,
        parentId: n.parentId ?? undefined,
        data: { label: `${n.kind}: ${n.name}` },
        ...(n.size ? { width: n.size.width, height: n.size.height } : {}),
      })),
    [document.nodes],
  );
  const edges = useMemo(
    () =>
      document.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.kind })),
    [document.edges],
  );
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
    >
      <Background />
      <MiniMap />
      <Controls />
    </ReactFlow>
  );
}
```

### `src/lib/utils.ts`

```ts
export { cn } from "cn";
```

### `src/lib/design/schema.ts`

```ts
/**
 * The design document: the single contract shared by the canvas, the database
 * (projects.document / project_versions.document), import/export files and the
 * MCP tools. Isomorphic: no Node or React imports.
 *
 * Rules that span several objects (dangling ids, parent kinds, edge endpoint
 * kinds) live in integrity.ts, not here, so this file maps 1:1 to JSON Schema.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1;

// ── Primitives ──────────────────────────────────────────────────────────────

export const IdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "ids are 1-64 chars of [A-Za-z0-9_-]");
const Line = z.string().trim().min(1).max(500);
const Text = (max = 10_000) => z.string().max(max).default("");
const Short = (max = 120) => z.string().trim().max(max).default("");
const Tag = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^,\n]+$/);

export const NODE_KINDS = [
  "service",
  "layer",
  "module",
  "entity",
  "datastore",
  "api",
  "integration",
  "queue",
  "actor",
  "note",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const EDGE_KINDS = [
  "depends_on",
  "calls",
  "exposes",
  "accesses",
  "publishes",
  "subscribes",
  "uses",
  "relation",
  "interacts",
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const FIELD_TYPES = [
  "string",
  "text",
  "int",
  "float",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "uuid",
  "email",
  "url",
  "json",
  "enum",
  "ref",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const ARCHITECTURE_STYLES = [
  "layered",
  "clean",
  "hexagonal",
  "modular-monolith",
  "microservices",
  "event-driven",
  "serverless",
  "mvc",
  "other",
] as const;

// ── Reusable shapes ─────────────────────────────────────────────────────────

/** A typed field: entity columns, API payload fields, message payload fields. */
export const FieldSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "field names are identifiers"),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(true),
  list: z.boolean().default(false),
  unique: z.boolean().default(false),
  primary: z.boolean().default(false),
  default: z.string().max(200).nullable().default(null),
  /** Only for type "enum". */
  enumValues: z.array(z.string().trim().min(1).max(64)).max(100).default([]),
  /** Only for type "ref": the entity node this field holds (nested object, not a FK). */
  refEntityId: IdSchema.nullable().default(null),
  description: Text(2000),
});
export type Field = z.output<typeof FieldSchema>;

/** A payload: an entity (optionally a list of it) or an inline list of fields. */
export const TypeShapeSchema = z.object({
  entityId: IdSchema.nullable().default(null),
  list: z.boolean().default(false),
  fields: z.array(FieldSchema).max(200).default([]),
  description: Text(2000),
});
export type TypeShape = z.output<typeof TypeShapeSchema>;

export const EnvVarSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]*$/, "env var names are UPPER_SNAKE_CASE")
    .max(100),
  description: Text(1000),
  required: z.boolean().default(true),
  secret: z.boolean().default(false),
  example: Short(200),
});
export type EnvVar = z.output<typeof EnvVarSchema>;

export const PatternUseSchema = z.object({
  /** A design pattern name, ideally one from catalog.ts PATTERNS (free text allowed). */
  name: z.string().trim().min(1).max(80),
  notes: Text(2000),
});

// ── Nodes ───────────────────────────────────────────────────────────────────

const PositionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const SizeSchema = z.object({
  width: z.number().positive().max(20_000),
  height: z.number().positive().max(20_000),
});

const NodeBase = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  /** Markdown. For notes this is the note text. */
  description: Text(),
  /** Container node (see catalog PARENT_RULES); null = top level. */
  parentId: IdSchema.nullable().default(null),
  /** Canvas position, relative to the parent when parentId is set (React Flow convention). */
  position: PositionSchema.prefault({ x: 0, y: 0 }),
  /** Set for resizable containers (service, layer, datastore); null = auto. */
  size: SizeSchema.nullable().default(null),
  tags: z.array(Tag).max(30).default([]),
  patterns: z.array(PatternUseSchema).max(30).default([]),
});

export const ServiceDataSchema = z.object({
  type: z
    .enum(["web-app", "api", "worker", "cli", "library", "mobile", "desktop", "function", "other"])
    .default("api"),
  language: Short(60),
  framework: Short(60),
  runtime: Short(60),
  /** Directory in the generated repository, e.g. "apps/web". */
  path: Short(200),
  port: z.number().int().min(1).max(65_535).nullable().default(null),
  responsibilities: z.array(Line).max(50).default([]),
  env: z.array(EnvVarSchema).max(100).default([]),
});

export const LayerDataSchema = z.object({
  path: Short(200),
  responsibilities: z.array(Line).max(50).default([]),
  /** Free-text rules, e.g. "No framework imports". Allowed dependencies are depends_on edges. */
  rules: z.array(Line).max(50).default([]),
});

export const ModuleDataSchema = z.object({
  path: Short(200),
  responsibilities: z.array(Line).max(50).default([]),
  /** Public interface, one signature or symbol per line. */
  exports: z.array(Line).max(100).default([]),
});

export const EntityDataSchema = z.object({
  fields: z.array(FieldSchema).max(300).default([]),
  indexes: z
    .array(
      z.object({
        fields: z.array(z.string().trim().min(1).max(64)).min(1).max(16),
        unique: z.boolean().default(false),
      }),
    )
    .max(50)
    .default([]),
});

export const DatastoreDataSchema = z.object({
  engine: z
    .enum([
      "postgres",
      "mysql",
      "sqlite",
      "mongodb",
      "redis",
      "dynamodb",
      "s3",
      "elasticsearch",
      "other",
    ])
    .default("postgres"),
  version: Short(40),
  purpose: Text(2000),
});

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export const OperationSchema = z.object({
  id: IdSchema,
  /** Identifier-like name: operationId for REST, field for GraphQL, method for gRPC/tRPC. */
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z_][A-Za-z0-9_.]*$/),
  summary: Text(2000),
  /** REST only. */
  method: z.enum(HTTP_METHODS).nullable().default(null),
  /** REST only, relative to the API basePath, with {param} placeholders. */
  path: z.string().trim().max(300).nullable().default(null),
  auth: z.enum(["inherit", "none", "required"]).default("inherit"),
  request: TypeShapeSchema.nullable().default(null),
  response: TypeShapeSchema.nullable().default(null),
  errors: z
    .array(z.object({ status: z.number().int().min(100).max(599), description: Text(500) }))
    .max(20)
    .default([]),
});
export type Operation = z.output<typeof OperationSchema>;

export const ApiDataSchema = z.object({
  style: z.enum(["rest", "graphql", "grpc", "trpc", "websocket", "other"]).default("rest"),
  basePath: Short(200),
  version: Short(40),
  auth: z.enum(["none", "session", "bearer", "api-key", "oauth2", "other"]).default("none"),
  operations: z.array(OperationSchema).max(300).default([]),
});

export const IntegrationDataSchema = z.object({
  provider: Short(80),
  category: z
    .enum([
      "payments",
      "auth",
      "email",
      "storage",
      "ai",
      "analytics",
      "messaging",
      "monitoring",
      "other",
    ])
    .default("other"),
  purpose: Text(2000),
  docsUrl: Short(500),
  sdk: Short(120),
  env: z.array(EnvVarSchema).max(50).default([]),
});

export const ChannelSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(200),
  description: Text(2000),
  payload: TypeShapeSchema.prefault({}),
});

export const QueueDataSchema = z.object({
  technology: z
    .enum(["kafka", "rabbitmq", "sqs", "sns", "redis-streams", "nats", "pubsub", "other"])
    .default("other"),
  channels: z.array(ChannelSchema).max(200).default([]),
});

export const ActorDataSchema = z.object({
  type: z.enum(["human", "system"]).default("human"),
  goals: z.array(Line).max(50).default([]),
});

export const NoteDataSchema = z.object({
  color: z.enum(["yellow", "blue", "green", "pink", "gray"]).default("yellow"),
});

// Every data schema below has a default for every field, so `{}` is a valid input.
const node = <K extends NodeKind, D extends z.ZodObject>(kind: K, data: D) =>
  NodeBase.extend({ kind: z.literal(kind), data: data.prefault({} as z.input<D>) });

export const ServiceNodeSchema = node("service", ServiceDataSchema);
export const LayerNodeSchema = node("layer", LayerDataSchema);
export const ModuleNodeSchema = node("module", ModuleDataSchema);
export const EntityNodeSchema = node("entity", EntityDataSchema);
export const DatastoreNodeSchema = node("datastore", DatastoreDataSchema);
export const ApiNodeSchema = node("api", ApiDataSchema);
export const IntegrationNodeSchema = node("integration", IntegrationDataSchema);
export const QueueNodeSchema = node("queue", QueueDataSchema);
export const ActorNodeSchema = node("actor", ActorDataSchema);
export const NoteNodeSchema = node("note", NoteDataSchema);

export const NodeSchema = z.discriminatedUnion("kind", [
  ServiceNodeSchema,
  LayerNodeSchema,
  ModuleNodeSchema,
  EntityNodeSchema,
  DatastoreNodeSchema,
  ApiNodeSchema,
  IntegrationNodeSchema,
  QueueNodeSchema,
  ActorNodeSchema,
  NoteNodeSchema,
]);
export type DesignNode = z.output<typeof NodeSchema>;
export type NodeOfKind<K extends NodeKind> = Extract<DesignNode, { kind: K }>;

// ── Edges ───────────────────────────────────────────────────────────────────

const EdgeBase = z.object({
  id: IdSchema,
  source: IdSchema,
  target: IdSchema,
  label: Short(120),
  description: Text(4000),
});

const edge = <K extends EdgeKind, D extends z.ZodObject>(kind: K, data: D) =>
  EdgeBase.extend({ kind: z.literal(kind), data: data.prefault({} as z.input<D>) });

export const EdgeSchema = z.discriminatedUnion("kind", [
  edge("depends_on", z.object({})),
  edge(
    "calls",
    z.object({
      protocol: z
        .enum(["http", "grpc", "graphql", "websocket", "in-process", "other"])
        .default("http"),
      /** Operation ids on the target API this caller uses; empty = unspecified. */
      operations: z.array(IdSchema).max(300).default([]),
    }),
  ),
  edge("exposes", z.object({})),
  edge(
    "accesses",
    z.object({ mode: z.enum(["read", "write", "read-write"]).default("read-write") }),
  ),
  edge("publishes", z.object({ channelId: IdSchema.nullable().default(null) })),
  edge("subscribes", z.object({ channelId: IdSchema.nullable().default(null) })),
  edge("uses", z.object({ purpose: Text(1000) })),
  edge(
    "relation",
    z.object({
      cardinality: z.enum(["one-to-one", "one-to-many", "many-to-many"]).default("one-to-many"),
      /** FK field on the "many" side, if it exists. */
      foreignKey: Short(64),
      required: z.boolean().default(false),
      onDelete: z.enum(["no-action", "cascade", "restrict", "set-null"]).default("no-action"),
    }),
  ),
  edge("interacts", z.object({ via: Short(120) })),
]);
export type DesignEdge = z.output<typeof EdgeSchema>;
export type EdgeOfKind<K extends EdgeKind> = Extract<DesignEdge, { kind: K }>;

// ── Project-level sections ──────────────────────────────────────────────────

export const STACK_CATEGORIES = [
  "language",
  "framework",
  "ui",
  "database",
  "orm",
  "cache",
  "messaging",
  "auth",
  "testing",
  "build",
  "ci",
  "hosting",
  "observability",
  "library",
  "other",
] as const;

export const StackItemSchema = z.object({
  id: IdSchema,
  category: z.enum(STACK_CATEGORIES),
  name: z.string().trim().min(1).max(80),
  version: Short(40),
  notes: Text(2000),
  /** Node ids this choice applies to (and their descendants); empty = whole project. */
  scope: z.array(IdSchema).max(100).default([]),
});
export type StackItem = z.output<typeof StackItemSchema>;

export const CONVENTION_CATEGORIES = [
  "structure",
  "naming",
  "code-style",
  "testing",
  "error-handling",
  "security",
  "performance",
  "documentation",
  "git",
  "other",
] as const;

export const ConventionSchema = z.object({
  id: IdSchema,
  category: z.enum(CONVENTION_CATEGORIES),
  level: z.enum(["must", "should", "may"]).default("should"),
  rule: z.string().trim().min(1).max(2000),
  scope: z.array(IdSchema).max(100).default([]),
});
export type Convention = z.output<typeof ConventionSchema>;

export const DecisionSchema = z.object({
  id: IdSchema,
  title: z.string().trim().min(1).max(200),
  status: z.enum(["proposed", "accepted", "deprecated", "superseded"]).default("accepted"),
  context: Text(),
  decision: Text(),
  consequences: Text(),
  date: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
    .default(""),
});
export type Decision = z.output<typeof DecisionSchema>;

export const OverviewSchema = z.object({
  summary: Text(),
  goals: z.array(Line).max(50).default([]),
  nonGoals: z.array(Line).max(50).default([]),
  architectureStyle: z.enum(ARCHITECTURE_STYLES).default("layered"),
  architectureNotes: Text(),
  repository: z
    .object({
      layout: z.enum(["single-package", "monorepo"]).default("single-package"),
      packageManager: Short(40),
      notes: Text(4000),
    })
    .prefault({}),
});

// ── Document ────────────────────────────────────────────────────────────────

export const DesignDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  overview: OverviewSchema.prefault({}),
  stack: z.array(StackItemSchema).max(200).default([]),
  conventions: z.array(ConventionSchema).max(300).default([]),
  decisions: z.array(DecisionSchema).max(200).default([]),
  nodes: z.array(NodeSchema).max(2_000).default([]),
  edges: z.array(EdgeSchema).max(5_000).default([]),
});
export type DesignDocument = z.output<typeof DesignDocumentSchema>;
export type DesignDocumentInput = z.input<typeof DesignDocumentSchema>;

export function emptyDesign(): DesignDocument {
  return DesignDocumentSchema.parse({ schemaVersion: SCHEMA_VERSION });
}

/** JSON Schema (2020-12) of the *input* form: everything with a default is optional. */
export function designJsonSchema() {
  return z.toJSONSchema(DesignDocumentSchema, { io: "input", target: "draft-2020-12" });
}
```

### `src/lib/design/catalog.ts`

```ts
/**
 * Semantics of the design vocabulary. The canvas uses it for the palette,
 * containment and connection rules; integrity.ts enforces the same rules; the
 * MCP `get_design_schema` tool hands these descriptions to agents verbatim, so
 * write them for an agent that has never seen this app.
 */
import type { EdgeKind, FieldType, NodeKind } from "@/lib/design/schema";
import { ARCHITECTURE_STYLES } from "@/lib/design/schema";

export interface NodeKindMeta {
  label: string;
  /** lucide-react icon name (PascalCase) used on the canvas and palette. */
  icon: string;
  /** Resizable group node that can hold children. */
  container: boolean;
  /** Allowed parent kinds; null = may sit at the top level. */
  parents: (NodeKind | null)[];
  defaultSize: { width: number; height: number };
  description: string;
}

export const NODE_KIND_META: Record<NodeKind, NodeKindMeta> = {
  service: {
    label: "Service",
    icon: "Box",
    container: true,
    parents: [null],
    defaultSize: { width: 520, height: 360 },
    description:
      "A deployable or runnable unit: web app, API server, worker, CLI, library or mobile app. " +
      "Generate one top-level directory/package per service at data.path. Layers and modules " +
      "inside it are its internal structure.",
  },
  layer: {
    label: "Layer",
    icon: "Layers",
    container: true,
    parents: ["service"],
    defaultSize: { width: 440, height: 140 },
    description:
      "An architectural layer inside a service (e.g. presentation, application, domain, " +
      "infrastructure). Modules inside a layer may only depend on modules in the same layer or " +
      "in layers this layer has a depends_on edge to. data.rules are hard constraints.",
  },
  module: {
    label: "Module",
    icon: "Puzzle",
    container: false,
    parents: ["service", "layer"],
    defaultSize: { width: 200, height: 72 },
    description:
      "A cohesive unit of code (feature, component, package or class group) with the listed " +
      "responsibilities. data.exports is its public interface; other modules use only that.",
  },
  entity: {
    label: "Entity",
    icon: "Table2",
    container: false,
    parents: [null, "datastore", "layer", "service"],
    defaultSize: { width: 220, height: 120 },
    description:
      "A data model with typed fields. Inside a datastore it is a persisted table/collection; " +
      "inside a layer or service it is a domain/model type. Relations between entities are " +
      "relation edges, not ref fields.",
  },
  datastore: {
    label: "Datastore",
    icon: "Database",
    container: true,
    parents: [null],
    defaultSize: { width: 480, height: 300 },
    description:
      "A database, cache, object store or search index. Entities inside it are its schema. " +
      "Services/modules reach it through accesses edges.",
  },
  api: {
    label: "API",
    icon: "Plug",
    container: false,
    parents: [null],
    defaultSize: { width: 220, height: 96 },
    description:
      "An interface contract (REST, GraphQL, gRPC, tRPC, WebSocket) with operations and typed " +
      "payloads. The service/module with an exposes edge implements it; nodes with calls edges " +
      "consume it.",
  },
  integration: {
    label: "Integration",
    icon: "Cable",
    container: false,
    parents: [null],
    defaultSize: { width: 220, height: 80 },
    description:
      "A third-party system (payments, email, auth, AI, storage…). Wrap it behind an adapter in " +
      "each node that has a uses edge to it; data.env lists the credentials it needs.",
  },
  queue: {
    label: "Queue / Topic",
    icon: "Waypoints",
    container: false,
    parents: [null],
    defaultSize: { width: 220, height: 96 },
    description:
      "A message broker or event bus with named channels and typed payloads. Producers have " +
      "publishes edges, consumers have subscribes edges (edge.data.channelId picks the channel).",
  },
  actor: {
    label: "Actor",
    icon: "User",
    container: false,
    parents: [null],
    defaultSize: { width: 180, height: 72 },
    description:
      "A human role or external system that uses the project. Context only; nothing is generated.",
  },
  note: {
    label: "Note",
    icon: "StickyNote",
    container: false,
    parents: [null, "service", "layer", "datastore"],
    defaultSize: { width: 220, height: 120 },
    description: "A free-text annotation. Read it as guidance; it generates nothing by itself.",
  },
};

export const CONTAINER_KINDS = (Object.keys(NODE_KIND_META) as NodeKind[]).filter(
  (k) => NODE_KIND_META[k].container,
);

export interface EdgeKindMeta {
  label: string;
  from: NodeKind[];
  to: NodeKind[];
  description: string;
}

export const EDGE_KIND_META: Record<EdgeKind, EdgeKindMeta> = {
  depends_on: {
    label: "depends on",
    from: ["service", "layer", "module"],
    to: ["service", "layer", "module"],
    description:
      "Source code imports/uses the target. Between layers it declares an allowed dependency " +
      "direction; never generate imports that go against it.",
  },
  calls: {
    label: "calls",
    from: ["service", "module"],
    to: ["api", "service"],
    description:
      "Runtime request from source to target over data.protocol. data.operations lists the " +
      "target API operation ids used (empty = unspecified).",
  },
  exposes: {
    label: "exposes",
    from: ["service", "module"],
    to: ["api"],
    description: "Source implements and serves the target API contract.",
  },
  accesses: {
    label: "accesses",
    from: ["service", "layer", "module"],
    to: ["datastore", "entity"],
    description: "Source reads and/or writes the target store or entity (data.mode).",
  },
  publishes: {
    label: "publishes",
    from: ["service", "module"],
    to: ["queue"],
    description: "Source produces messages to the queue (channel = data.channelId).",
  },
  subscribes: {
    label: "subscribes",
    from: ["service", "module"],
    to: ["queue"],
    description: "Source consumes messages from the queue (channel = data.channelId).",
  },
  uses: {
    label: "uses",
    from: ["service", "module"],
    to: ["integration"],
    description: "Source calls the third-party integration (data.purpose says why).",
  },
  relation: {
    label: "relation",
    from: ["entity"],
    to: ["entity"],
    description:
      "Data relationship. one-to-many means one source row has many target rows; the foreign " +
      "key (data.foreignKey) lives on the target. many-to-many needs a join table.",
  },
  interacts: {
    label: "interacts",
    from: ["actor"],
    to: ["service", "api"],
    description: "An actor uses the target (data.via, e.g. 'browser', 'mobile app').",
  },
};

/** Edge kinds allowed between two node kinds, most likely first (used to preselect on connect). */
export function allowedEdgeKinds(from: NodeKind, to: NodeKind): EdgeKind[] {
  const order: EdgeKind[] = [
    "relation",
    "interacts",
    "exposes",
    "calls",
    "accesses",
    "publishes",
    "subscribes",
    "uses",
    "depends_on",
  ];
  return order.filter(
    (k) => EDGE_KIND_META[k].from.includes(from) && EDGE_KIND_META[k].to.includes(to),
  );
}

export function canContain(parent: NodeKind | null, child: NodeKind): boolean {
  return NODE_KIND_META[child].parents.includes(parent);
}

export const FIELD_TYPE_DESCRIPTIONS: Record<FieldType, string> = {
  string: "Short text (≤ 255 chars)",
  text: "Long text",
  int: "Integer",
  float: "Floating point number",
  decimal: "Exact decimal (money)",
  boolean: "true / false",
  date: "Calendar date (YYYY-MM-DD)",
  datetime: "Timestamp with time zone (ISO 8601)",
  uuid: "UUID",
  email: "Email address",
  url: "URL",
  json: "Arbitrary JSON",
  enum: "One of enumValues",
  ref: "Nested object of entity refEntityId (use list for arrays)",
};

export const ARCHITECTURE_STYLE_DESCRIPTIONS: Record<(typeof ARCHITECTURE_STYLES)[number], string> =
  {
    layered: "Horizontal layers; each layer only calls the layer(s) below it.",
    clean:
      "Clean Architecture: entities → use cases → interface adapters → frameworks; " +
      "dependencies point inward only.",
    hexagonal:
      "Ports and adapters: the domain core defines ports; adapters implement them at the edges.",
    "modular-monolith":
      "One deployable split into strongly bounded modules that talk through public interfaces.",
    microservices:
      "Independently deployable services that own their data and talk over APIs/events.",
    "event-driven": "Components communicate mainly by publishing and consuming events.",
    serverless: "Functions triggered by events/HTTP on managed infrastructure.",
    mvc: "Model-View-Controller.",
    other: "See overview.architectureNotes.",
  };

export interface PatternMeta {
  name: string;
  category: "creational" | "structural" | "behavioral" | "architectural" | "data" | "resilience";
  summary: string;
}

/** Suggestions for the patterns picker. Nodes may also name patterns not listed here. */
export const PATTERNS: PatternMeta[] = [
  { name: "Repository", category: "data", summary: "Collection-like interface over persistence." },
  { name: "Unit of Work", category: "data", summary: "Track changes and commit them atomically." },
  { name: "Data Mapper", category: "data", summary: "Map between domain objects and storage." },
  { name: "CQRS", category: "architectural", summary: "Separate read models from write models." },
  { name: "Event Sourcing", category: "data", summary: "Persist state as a sequence of events." },
  {
    name: "Transactional Outbox",
    category: "data",
    summary: "Write events in the same transaction as state, publish later.",
  },
  {
    name: "Service Layer",
    category: "architectural",
    summary: "Application operations as a thin orchestration layer.",
  },
  {
    name: "Dependency Injection",
    category: "structural",
    summary: "Pass collaborators in instead of constructing them.",
  },
  {
    name: "Ports and Adapters",
    category: "architectural",
    summary: "Core defines interfaces; edges implement them.",
  },
  {
    name: "API Gateway",
    category: "architectural",
    summary: "Single entry point that routes to services.",
  },
  {
    name: "Backend for Frontend",
    category: "architectural",
    summary: "An API shaped for one client.",
  },
  {
    name: "Saga",
    category: "resilience",
    summary: "Coordinate a multi-step transaction with compensations.",
  },
  {
    name: "Circuit Breaker",
    category: "resilience",
    summary: "Stop calling a failing dependency for a while.",
  },
  {
    name: "Retry with Backoff",
    category: "resilience",
    summary: "Retry transient failures with increasing delays.",
  },
  {
    name: "Idempotency Key",
    category: "resilience",
    summary: "Make retried requests safe to repeat.",
  },
  { name: "Factory", category: "creational", summary: "Encapsulate object creation." },
  { name: "Builder", category: "creational", summary: "Construct complex objects step by step." },
  { name: "Singleton", category: "creational", summary: "One shared instance (use sparingly)." },
  { name: "Adapter", category: "structural", summary: "Convert one interface into another." },
  { name: "Facade", category: "structural", summary: "Simple interface over a complex subsystem." },
  { name: "Decorator", category: "structural", summary: "Add behaviour by wrapping." },
  { name: "Proxy", category: "structural", summary: "Stand-in that controls access to an object." },
  {
    name: "Strategy",
    category: "behavioral",
    summary: "Interchangeable algorithms behind one interface.",
  },
  { name: "Observer", category: "behavioral", summary: "Notify subscribers of changes." },
  { name: "Command", category: "behavioral", summary: "Encapsulate a request as an object." },
  {
    name: "Mediator",
    category: "behavioral",
    summary: "Centralise communication between objects.",
  },
  {
    name: "Chain of Responsibility",
    category: "behavioral",
    summary: "Pass a request along handlers (middleware).",
  },
  { name: "State Machine", category: "behavioral", summary: "Explicit states and transitions." },
  {
    name: "Specification",
    category: "behavioral",
    summary: "Composable business rules/predicates.",
  },
  {
    name: "Pub/Sub",
    category: "architectural",
    summary: "Publishers and subscribers decoupled by topics.",
  },
];
```

### `src/lib/design/ids.ts`

```ts
import type { EdgeKind, NodeKind } from "@/lib/design/schema";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Short random id body (lowercase base36). 10 chars = ~51 bits; plenty per project. */
export function randomIdBody(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const NODE_ID_PREFIX: Record<NodeKind, string> = {
  service: "svc",
  layer: "lyr",
  module: "mod",
  entity: "ent",
  datastore: "dst",
  api: "api",
  integration: "int",
  queue: "que",
  actor: "act",
  note: "nte",
};

export const newNodeId = (kind: NodeKind) => `${NODE_ID_PREFIX[kind]}_${randomIdBody()}`;
export const newEdgeId = (_kind?: EdgeKind) => `e_${randomIdBody()}`;
/** Ids for list items inside a document: stack items, conventions, decisions, operations… */
export const newItemId = (prefix: "stk" | "cnv" | "adr" | "op" | "ch") =>
  `${prefix}_${randomIdBody(8)}`;
```

### `src/lib/design/integrity.ts`

```ts
/**
 * Structural rules a design must satisfy before it is stored. Anything here is
 * an "error": the save is rejected. Quality checks (warnings) live in validate.ts.
 */
import { canContain, EDGE_KIND_META } from "@/lib/design/catalog";
import {
  DesignDocumentSchema,
  type DesignDocument,
  type DesignNode,
  type Field,
  type TypeShape,
} from "@/lib/design/schema";

export interface Issue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export class DesignIntegrityError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`Design has ${issues.length} integrity error(s): ${issues[0]?.message ?? ""}`);
    this.name = "DesignIntegrityError";
  }
}

export function checkIntegrity(doc: DesignDocument): Issue[] {
  const issues: Issue[] = [];
  const err = (code: string, message: string, ref: { nodeId?: string; edgeId?: string } = {}) =>
    issues.push({ severity: "error", code, message, ...ref });

  const nodes = new Map<string, DesignNode>();
  for (const n of doc.nodes) {
    if (nodes.has(n.id)) err("node.duplicate_id", `Duplicate node id "${n.id}"`, { nodeId: n.id });
    nodes.set(n.id, n);
  }

  for (const [section, items] of [
    ["stack", doc.stack],
    ["conventions", doc.conventions],
    ["decisions", doc.decisions],
  ] as const) {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) err(`${section}.duplicate_id`, `Duplicate ${section} id "${item.id}"`);
      seen.add(item.id);
    }
  }
  for (const item of [...doc.stack, ...doc.conventions]) {
    for (const id of item.scope) {
      if (!nodes.has(id))
        err("scope.unknown_node", `"${item.id}" is scoped to unknown node "${id}"`);
    }
  }

  const checkEntityRef = (id: string | null, where: string, nodeId: string) => {
    if (id === null) return;
    if (nodes.get(id)?.kind !== "entity") {
      err("ref.not_entity", `${where} references "${id}", which is not an entity`, { nodeId });
    }
  };
  const checkFields = (fields: Field[], where: string, nodeId: string) => {
    const names = new Set<string>();
    for (const f of fields) {
      if (names.has(f.name))
        err("field.duplicate", `${where}: duplicate field "${f.name}"`, { nodeId });
      names.add(f.name);
      if (f.type === "enum" && f.enumValues.length === 0) {
        err("field.enum_without_values", `${where}.${f.name}: enum needs enumValues`, { nodeId });
      }
      if (f.type === "ref") {
        if (f.refEntityId === null) {
          err("field.ref_without_entity", `${where}.${f.name}: ref needs refEntityId`, { nodeId });
        } else checkEntityRef(f.refEntityId, `${where}.${f.name}`, nodeId);
      }
    }
  };
  const checkShape = (shape: TypeShape | null, where: string, nodeId: string) => {
    if (!shape) return;
    checkEntityRef(shape.entityId, where, nodeId);
    checkFields(shape.fields, where, nodeId);
  };

  for (const n of doc.nodes) {
    const ref = { nodeId: n.id };
    if (n.parentId !== null) {
      const parent = nodes.get(n.parentId);
      if (!parent)
        err("node.unknown_parent", `"${n.name}" has unknown parent "${n.parentId}"`, ref);
      else if (!canContain(parent.kind, n.kind)) {
        err("node.bad_parent", `A ${n.kind} cannot be placed inside a ${parent.kind}`, ref);
      }
    } else if (!canContain(null, n.kind)) {
      err("node.needs_parent", `A ${n.kind} must be placed inside a container`, ref);
    }

    switch (n.kind) {
      case "entity":
        checkFields(n.data.fields, n.name, n.id);
        for (const idx of n.data.indexes) {
          for (const f of idx.fields) {
            if (!n.data.fields.some((x) => x.name === f)) {
              err("entity.index_unknown_field", `${n.name}: index uses unknown field "${f}"`, ref);
            }
          }
        }
        break;
      case "api": {
        const opIds = new Set<string>();
        for (const op of n.data.operations) {
          if (opIds.has(op.id))
            err("api.duplicate_operation_id", `${n.name}: duplicate operation id "${op.id}"`, ref);
          opIds.add(op.id);
          checkShape(op.request, `${n.name}.${op.name}.request`, n.id);
          checkShape(op.response, `${n.name}.${op.name}.response`, n.id);
        }
        break;
      }
      case "queue": {
        const chIds = new Set<string>();
        for (const ch of n.data.channels) {
          if (chIds.has(ch.id))
            err("queue.duplicate_channel_id", `${n.name}: duplicate channel id "${ch.id}"`, ref);
          chIds.add(ch.id);
          checkShape(ch.payload, `${n.name}.${ch.name}`, n.id);
        }
        break;
      }
    }
  }

  // Parent chains must terminate (no cycles).
  for (const n of doc.nodes) {
    const seen = new Set<string>([n.id]);
    let cur = n.parentId;
    while (cur !== null) {
      if (seen.has(cur)) {
        err("node.parent_cycle", `"${n.name}" is inside itself`, { nodeId: n.id });
        break;
      }
      seen.add(cur);
      cur = nodes.get(cur)?.parentId ?? null;
    }
  }

  const edgeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  for (const e of doc.edges) {
    const ref = { edgeId: e.id };
    if (edgeIds.has(e.id)) err("edge.duplicate_id", `Duplicate edge id "${e.id}"`, ref);
    edgeIds.add(e.id);
    const source = nodes.get(e.source);
    const target = nodes.get(e.target);
    if (!source || !target) {
      err("edge.unknown_endpoint", `Edge "${e.id}" points at a missing node`, ref);
      continue;
    }
    const meta = EDGE_KIND_META[e.kind];
    if (!meta.from.includes(source.kind) || !meta.to.includes(target.kind)) {
      err(
        "edge.bad_endpoints",
        `"${e.kind}" cannot connect a ${source.kind} to a ${target.kind}`,
        ref,
      );
    }
    if (e.source === e.target && e.kind !== "relation") {
      err("edge.self_loop", `"${source.name}" cannot ${meta.label} itself`, ref);
    }
    const key = `${e.kind}|${e.source}|${e.target}`;
    if (edgeKeys.has(key))
      err("edge.duplicate", `Duplicate ${e.kind} edge ${source.name} → ${target.name}`, ref);
    edgeKeys.add(key);

    if (e.kind === "calls" && target.kind === "api") {
      const ops = new Set(target.data.operations.map((o) => o.id));
      for (const op of e.data.operations) {
        if (!ops.has(op))
          err(
            "edge.unknown_operation",
            `${source.name} calls unknown operation "${op}" on ${target.name}`,
            ref,
          );
      }
    }
    if ((e.kind === "publishes" || e.kind === "subscribes") && e.data.channelId !== null) {
      if (target.kind === "queue" && !target.data.channels.some((c) => c.id === e.data.channelId)) {
        err(
          "edge.unknown_channel",
          `${source.name} ${e.kind} to unknown channel on ${target.name}`,
          ref,
        );
      }
    }
  }

  return issues;
}

/** Parents before children: React Flow requires it, and it keeps exports stable. */
export function sortNodesParentFirst(nodes: DesignNode[]): DesignNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = (n: DesignNode): number => {
    let d = 0;
    let cur = n.parentId;
    while (cur !== null && d <= nodes.length) {
      d++;
      cur = byId.get(cur)?.parentId ?? null;
    }
    return d;
  };
  return nodes
    .map((n, i) => ({ n, i, d: depth(n) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.n);
}

export type ParseResult = { ok: true; document: DesignDocument } | { ok: false; issues: Issue[] };

/** Schema + integrity in one step. Use it for every document entering the system. */
export function safeParseDesign(input: unknown): ParseResult {
  const parsed = DesignDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        severity: "error",
        code: `schema.${i.code}`,
        message: `${i.path.join(".") || "(root)"}: ${i.message}`,
      })),
    };
  }
  const issues = checkIntegrity(parsed.data);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, document: { ...parsed.data, nodes: sortNodesParentFirst(parsed.data.nodes) } };
}

export function parseDesign(input: unknown): DesignDocument {
  const result = safeParseDesign(input);
  if (!result.ok) throw new DesignIntegrityError(result.issues);
  return result.document;
}
```

### `src/lib/design/geometry.ts`

```ts
/**
 * Canvas geometry on the design document. Positions are stored relative to the
 * parent (React Flow's convention); these helpers convert and re-parent.
 */
import { canContain, NODE_KIND_META } from "@/lib/design/catalog";
import { sortNodesParentFirst } from "@/lib/design/integrity";
import type { DesignDocument, DesignNode } from "@/lib/design/schema";

export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}

export function nodeSize(n: DesignNode): { width: number; height: number } {
  return n.size ?? NODE_KIND_META[n.kind].defaultSize;
}

export function absolutePosition(doc: DesignDocument, id: string): Point {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  let x = 0;
  let y = 0;
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ <= doc.nodes.length) {
    x += cur.position.x;
    y += cur.position.y;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return { x, y };
}

export function absoluteRect(doc: DesignDocument, id: string): Rect {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown node ${id}`);
  return { ...absolutePosition(doc, id), ...nodeSize(n) };
}

/** The node and every node nested inside it. */
export function subtreeIds(doc: DesignDocument, id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of doc.nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * The container a node dropped with its centre at `center` belongs in: the
 * smallest allowed container whose rect contains the point (never itself or a
 * descendant). null = top level, or no allowed container under the point.
 */
export function findDropParent(doc: DesignDocument, nodeId: string, center: Point): string | null {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const excluded = subtreeIds(doc, nodeId);
  let best: { id: string; area: number } | null = null;
  for (const c of doc.nodes) {
    if (excluded.has(c.id) || !NODE_KIND_META[c.kind].container) continue;
    if (!canContain(c.kind, node.kind)) continue;
    const r = absoluteRect(doc, c.id);
    const inside =
      center.x >= r.x && center.x <= r.x + r.width && center.y >= r.y && center.y <= r.y + r.height;
    if (inside && (!best || r.width * r.height < best.area)) {
      best = { id: c.id, area: r.width * r.height };
    }
  }
  return best?.id ?? null;
}

/** Moves a node under a new parent (or to the top level) without moving it on screen. */
export function reparentNode(
  doc: DesignDocument,
  nodeId: string,
  newParentId: string | null,
): DesignDocument {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Unknown node ${nodeId}`);
  if (node.parentId === newParentId) return doc;
  const parent = newParentId ? doc.nodes.find((n) => n.id === newParentId) : null;
  if (newParentId && !parent) throw new Error(`Unknown parent ${newParentId}`);
  if (!canContain(parent?.kind ?? null, node.kind)) {
    throw new Error(
      `A ${node.kind} cannot be placed inside ${parent ? `a ${parent.kind}` : "the canvas"}`,
    );
  }
  if (newParentId && subtreeIds(doc, nodeId).has(newParentId)) {
    throw new Error("A node cannot be placed inside itself");
  }
  const abs = absolutePosition(doc, nodeId);
  const origin = newParentId ? absolutePosition(doc, newParentId) : { x: 0, y: 0 };
  const moved = {
    ...node,
    parentId: newParentId,
    position: { x: abs.x - origin.x, y: abs.y - origin.y },
  };
  return {
    ...doc,
    nodes: sortNodesParentFirst(doc.nodes.map((n) => (n.id === nodeId ? moved : n))),
  };
}
```

### `src/lib/design/examples/team-tasks.ts`

```ts
/**
 * A small but complete design that exercises every node and edge kind. Used by
 * tests (fixed ids keep outputs stable) and by "New project → From example".
 */
import type { DesignDocumentInput } from "@/lib/design/schema";

export const TEAM_TASKS_EXAMPLE = {
  name: "Team Tasks",
  slug: "team-tasks",
  description: "Task tracker for small teams, with email notifications.",
} as const;

export const teamTasksDesign: DesignDocumentInput = {
  schemaVersion: 1,
  overview: {
    summary:
      "A web app where small teams create projects, add tasks, assign them and get an email " +
      "when a task is assigned to them.",
    goals: ["Create, assign and complete tasks", "Email the assignee on assignment"],
    nonGoals: ["Mobile apps", "Real-time collaboration"],
    architectureStyle: "clean",
    architectureNotes:
      "The API follows Clean Architecture. Side effects (email) happen in a worker fed by events.",
    repository: { layout: "monorepo", packageManager: "npm" },
  },
  stack: [
    { id: "stk_lang", category: "language", name: "TypeScript", version: "5.9" },
    { id: "stk_web", category: "framework", name: "Next.js", version: "16", scope: ["svc_web"] },
    { id: "stk_api", category: "framework", name: "Fastify", version: "5", scope: ["svc_api"] },
    { id: "stk_db", category: "database", name: "PostgreSQL", version: "18" },
    { id: "stk_orm", category: "orm", name: "Drizzle ORM" },
    { id: "stk_test", category: "testing", name: "Vitest" },
  ],
  conventions: [
    {
      id: "cnv_tests",
      category: "testing",
      level: "must",
      rule: "Every use case has a unit test.",
    },
    {
      id: "cnv_errors",
      category: "error-handling",
      level: "must",
      rule: "Use cases return typed results; only the HTTP layer maps them to status codes.",
      scope: ["svc_api"],
    },
    { id: "cnv_names", category: "naming", level: "should", rule: "Files are kebab-case." },
  ],
  decisions: [
    {
      id: "adr_events",
      title: "Send email from a worker, not from the request",
      context: "Email providers are slow and fail transiently.",
      decision: "The API publishes task.assigned; the notifier worker sends the email.",
      consequences: "Emails are eventually consistent; the API stays fast.",
      date: "2026-10-01",
    },
  ],
  nodes: [
    {
      id: "act_member",
      kind: "actor",
      name: "Team member",
      position: { x: -320, y: 40 },
      data: { goals: ["Track my tasks"] },
    },
    {
      id: "svc_web",
      kind: "service",
      name: "Web",
      position: { x: 0, y: 0 },
      size: { width: 300, height: 200 },
      data: {
        type: "web-app",
        language: "TypeScript",
        framework: "Next.js",
        path: "apps/web",
        port: 3000,
        responsibilities: ["Server-rendered UI", "Session handling"],
        env: [
          { name: "API_URL", description: "Base URL of the API", example: "http://localhost:4000" },
        ],
      },
    },
    {
      id: "mod_web_tasks",
      kind: "module",
      name: "Tasks UI",
      parentId: "svc_web",
      position: { x: 40, y: 60 },
      data: { path: "apps/web/src/features/tasks", responsibilities: ["Task list and editor"] },
    },
    {
      id: "svc_api",
      kind: "service",
      name: "API",
      position: { x: 420, y: 0 },
      size: { width: 520, height: 520 },
      data: {
        type: "api",
        language: "TypeScript",
        framework: "Fastify",
        path: "apps/api",
        port: 4000,
        responsibilities: ["REST API", "Business rules"],
        env: [
          { name: "DATABASE_URL", description: "Postgres connection string", secret: true },
          { name: "BROKER_URL", description: "Redis URL for events", secret: true },
        ],
      },
    },
    {
      id: "lyr_http",
      kind: "layer",
      name: "HTTP",
      parentId: "svc_api",
      position: { x: 20, y: 40 },
      size: { width: 480, height: 100 },
      data: { path: "apps/api/src/http", rules: ["No business logic in route handlers"] },
    },
    {
      id: "lyr_app",
      kind: "layer",
      name: "Application",
      parentId: "svc_api",
      position: { x: 20, y: 160 },
      size: { width: 480, height: 100 },
      data: { path: "apps/api/src/application" },
    },
    {
      id: "lyr_domain",
      kind: "layer",
      name: "Domain",
      parentId: "svc_api",
      position: { x: 20, y: 280 },
      size: { width: 480, height: 100 },
      data: { path: "apps/api/src/domain", rules: ["No framework or database imports"] },
    },
    {
      id: "lyr_infra",
      kind: "layer",
      name: "Infrastructure",
      parentId: "svc_api",
      position: { x: 20, y: 400 },
      size: { width: 480, height: 100 },
      data: { path: "apps/api/src/infrastructure" },
    },
    {
      id: "mod_routes",
      kind: "module",
      name: "Task routes",
      parentId: "lyr_http",
      position: { x: 20, y: 20 },
      data: { exports: ["registerTaskRoutes(app)"] },
    },
    {
      id: "mod_usecases",
      kind: "module",
      name: "Task use cases",
      parentId: "lyr_app",
      position: { x: 20, y: 20 },
      patterns: [{ name: "Service Layer" }],
      data: {
        exports: ["createTask(input)", "assignTask(taskId, userId)", "completeTask(taskId)"],
      },
    },
    {
      id: "mod_domain",
      kind: "module",
      name: "Task model",
      parentId: "lyr_domain",
      position: { x: 20, y: 20 },
      patterns: [{ name: "State Machine", notes: "open → done" }],
      data: { exports: ["Task", "TaskRepository (port)"] },
    },
    {
      id: "mod_repo",
      kind: "module",
      name: "Postgres task repository",
      parentId: "lyr_infra",
      position: { x: 20, y: 20 },
      patterns: [{ name: "Repository" }, { name: "Transactional Outbox" }],
      data: { exports: ["PgTaskRepository implements TaskRepository"] },
    },
    {
      id: "api_rest",
      kind: "api",
      name: "Tasks REST API",
      position: { x: 420, y: -200 },
      data: {
        style: "rest",
        basePath: "/v1",
        version: "1.0.0",
        auth: "bearer",
        operations: [
          {
            id: "op_list",
            name: "listTasks",
            summary: "List tasks of a project",
            method: "GET",
            path: "/projects/{projectId}/tasks",
            response: { entityId: "ent_task", list: true },
          },
          {
            id: "op_create",
            name: "createTask",
            summary: "Create a task",
            method: "POST",
            path: "/projects/{projectId}/tasks",
            request: {
              fields: [
                { name: "title", type: "string" },
                { name: "assigneeId", type: "uuid", required: false },
              ],
            },
            response: { entityId: "ent_task" },
            errors: [{ status: 404, description: "Project not found" }],
          },
          {
            id: "op_complete",
            name: "completeTask",
            summary: "Mark a task done",
            method: "POST",
            path: "/tasks/{taskId}/complete",
            response: { entityId: "ent_task" },
          },
        ],
      },
    },
    {
      id: "dst_pg",
      kind: "datastore",
      name: "Main database",
      position: { x: 1040, y: 0 },
      size: { width: 300, height: 420 },
      data: { engine: "postgres", version: "18", purpose: "System of record" },
    },
    {
      id: "ent_user",
      kind: "entity",
      name: "User",
      parentId: "dst_pg",
      position: { x: 20, y: 40 },
      data: {
        fields: [
          { name: "id", type: "uuid", primary: true },
          { name: "email", type: "email", unique: true },
          { name: "name", type: "string" },
        ],
      },
    },
    {
      id: "ent_project",
      kind: "entity",
      name: "Project",
      parentId: "dst_pg",
      position: { x: 20, y: 160 },
      data: {
        fields: [
          { name: "id", type: "uuid", primary: true },
          { name: "name", type: "string" },
        ],
      },
    },
    {
      id: "ent_task",
      kind: "entity",
      name: "Task",
      parentId: "dst_pg",
      position: { x: 20, y: 280 },
      data: {
        fields: [
          { name: "id", type: "uuid", primary: true },
          { name: "projectId", type: "uuid" },
          { name: "assigneeId", type: "uuid", required: false },
          { name: "title", type: "string" },
          { name: "status", type: "enum", enumValues: ["open", "done"], default: "open" },
          { name: "createdAt", type: "datetime" },
        ],
        indexes: [{ fields: ["projectId", "status"] }],
      },
    },
    {
      id: "que_events",
      kind: "queue",
      name: "Domain events",
      position: { x: 1040, y: 500 },
      data: {
        technology: "redis-streams",
        channels: [
          {
            id: "ch_assigned",
            name: "task.assigned",
            payload: {
              fields: [
                { name: "taskId", type: "uuid" },
                { name: "assigneeId", type: "uuid" },
              ],
            },
          },
        ],
      },
    },
    {
      id: "svc_notifier",
      kind: "service",
      name: "Notifier",
      position: { x: 1440, y: 460 },
      size: { width: 280, height: 160 },
      data: {
        type: "worker",
        language: "TypeScript",
        runtime: "Node.js 24",
        path: "apps/notifier",
        responsibilities: ["Send assignment emails"],
        env: [{ name: "RESEND_API_KEY", description: "Email provider key", secret: true }],
      },
    },
    {
      id: "int_email",
      kind: "integration",
      name: "Resend",
      position: { x: 1800, y: 500 },
      data: {
        provider: "Resend",
        category: "email",
        purpose: "Transactional email",
        sdk: "resend",
      },
    },
    {
      id: "nte_scope",
      kind: "note",
      name: "Scope",
      description: "Start with one team per account; invitations come later.",
      position: { x: 0, y: 260 },
    },
  ],
  edges: [
    {
      id: "e_member_web",
      kind: "interacts",
      source: "act_member",
      target: "svc_web",
      data: { via: "browser" },
    },
    {
      id: "e_web_api",
      kind: "calls",
      source: "mod_web_tasks",
      target: "api_rest",
      data: { operations: ["op_list", "op_create", "op_complete"] },
    },
    { id: "e_api_exposes", kind: "exposes", source: "svc_api", target: "api_rest" },
    { id: "e_http_app", kind: "depends_on", source: "lyr_http", target: "lyr_app" },
    { id: "e_app_domain", kind: "depends_on", source: "lyr_app", target: "lyr_domain" },
    { id: "e_infra_domain", kind: "depends_on", source: "lyr_infra", target: "lyr_domain" },
    { id: "e_routes_uc", kind: "depends_on", source: "mod_routes", target: "mod_usecases" },
    { id: "e_uc_domain", kind: "depends_on", source: "mod_usecases", target: "mod_domain" },
    { id: "e_repo_domain", kind: "depends_on", source: "mod_repo", target: "mod_domain" },
    { id: "e_repo_db", kind: "accesses", source: "mod_repo", target: "dst_pg" },
    {
      id: "e_repo_pub",
      kind: "publishes",
      source: "mod_repo",
      target: "que_events",
      data: { channelId: "ch_assigned" },
    },
    {
      id: "e_notifier_sub",
      kind: "subscribes",
      source: "svc_notifier",
      target: "que_events",
      data: { channelId: "ch_assigned" },
    },
    {
      id: "e_notifier_email",
      kind: "uses",
      source: "svc_notifier",
      target: "int_email",
      data: { purpose: "Send email" },
    },
    {
      id: "e_project_tasks",
      kind: "relation",
      source: "ent_project",
      target: "ent_task",
      data: {
        cardinality: "one-to-many",
        foreignKey: "projectId",
        required: true,
        onDelete: "cascade",
      },
    },
    {
      id: "e_user_tasks",
      kind: "relation",
      source: "ent_user",
      target: "ent_task",
      data: { cardinality: "one-to-many", foreignKey: "assigneeId", onDelete: "set-null" },
    },
  ],
};
```

### `src/lib/design/schema.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { checkIntegrity, parseDesign, safeParseDesign } from "@/lib/design/integrity";
import { designJsonSchema, DesignDocumentSchema, emptyDesign } from "@/lib/design/schema";

describe("design schema", () => {
  it("parses the example and fills defaults", () => {
    const doc = parseDesign(teamTasksDesign);
    expect(doc.nodes).toHaveLength(teamTasksDesign.nodes!.length);
    const web = doc.nodes.find((n) => n.id === "svc_web");
    expect(web?.kind).toBe("service");
    expect(web?.tags).toEqual([]);
    const note = doc.nodes.find((n) => n.id === "nte_scope");
    expect(note?.kind === "note" && note.data.color).toBe("yellow");
    const task = doc.nodes.find((n) => n.id === "ent_task");
    expect(task?.kind === "entity" && task.data.fields[0]).toMatchObject({
      name: "id",
      required: true,
      list: false,
      primary: true,
      default: null,
    });
  });

  it("does not share default arrays between parses", () => {
    const a = emptyDesign();
    const b = emptyDesign();
    a.nodes.push({ ...parseDesign(teamTasksDesign).nodes[0] });
    expect(b.nodes).toHaveLength(0);
    expect(a.overview).not.toBe(b.overview);
  });

  it("orders parents before children", () => {
    const shuffled = { ...teamTasksDesign, nodes: [...teamTasksDesign.nodes!].reverse() };
    const doc = parseDesign(shuffled);
    const index = new Map(doc.nodes.map((n, i) => [n.id, i]));
    for (const n of doc.nodes) {
      if (n.parentId) expect(index.get(n.parentId)!).toBeLessThan(index.get(n.id)!);
    }
  });

  it("has no integrity errors in the example", () => {
    expect(checkIntegrity(DesignDocumentSchema.parse(teamTasksDesign))).toEqual([]);
  });

  it("rejects bad parents, endpoints and dangling references", () => {
    const result = safeParseDesign({
      schemaVersion: 1,
      nodes: [
        { id: "svc_a", kind: "service", name: "A" },
        { id: "lyr_x", kind: "layer", name: "Orphan layer" },
        { id: "api_b", kind: "api", name: "B", parentId: "svc_a" },
        { id: "ent_c", kind: "entity", name: "C", data: { fields: [{ name: "s", type: "enum" }] } },
      ],
      edges: [
        { id: "e1", kind: "relation", source: "svc_a", target: "ent_c" },
        { id: "e2", kind: "calls", source: "svc_a", target: "missing" },
      ],
    });
    expect(result.ok).toBe(false);
    const codes = result.ok ? [] : result.issues.map((i) => i.code).sort();
    expect(codes).toEqual([
      "edge.bad_endpoints",
      "edge.unknown_endpoint",
      "field.enum_without_values",
      "node.bad_parent",
      "node.needs_parent",
    ]);
  });

  it("exports a JSON Schema agents can read", () => {
    const schema = designJsonSchema() as { $schema: string; required: string[] };
    expect(schema.$schema).toContain("2020-12");
    expect(schema.required).toEqual(["schemaVersion"]);
    expect(JSON.stringify(schema)).toContain('"depends_on"');
  });
});
```

### `src/lib/design/geometry.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { absolutePosition, findDropParent, reparentNode } from "@/lib/design/geometry";
import { parseDesign } from "@/lib/design/integrity";

const doc = () => parseDesign(teamTasksDesign);

describe("geometry", () => {
  it("sums positions up the parent chain", () => {
    // svc_api (420,0) → lyr_app (20,160) → mod_usecases (20,20)
    expect(absolutePosition(doc(), "mod_usecases")).toEqual({ x: 460, y: 180 });
  });

  it("picks the smallest allowed container under the point", () => {
    const d = doc();
    // Inside lyr_domain (abs 440,280 480×100) which is inside svc_api.
    expect(findDropParent(d, "mod_usecases", { x: 500, y: 320 })).toBe("lyr_domain");
    // Inside svc_api but between layers → the service itself.
    expect(findDropParent(d, "mod_usecases", { x: 430, y: 10 })).toBe("svc_api");
    // Entities dropped on a datastore become part of its schema.
    expect(findDropParent(d, "ent_task", { x: 1100, y: 100 })).toBe("dst_pg");
    // Nowhere special.
    expect(findDropParent(d, "mod_usecases", { x: -900, y: -900 })).toBeNull();
    // A layer can never be dropped into a datastore.
    expect(findDropParent(d, "lyr_app", { x: 1100, y: 100 })).toBeNull();
  });

  it("reparents without moving the node on screen", () => {
    const before = doc();
    const abs = absolutePosition(before, "mod_usecases");
    const after = reparentNode(before, "mod_usecases", "lyr_domain");
    expect(after.nodes.find((n) => n.id === "mod_usecases")?.parentId).toBe("lyr_domain");
    expect(absolutePosition(after, "mod_usecases")).toEqual(abs);
    const top = reparentNode(after, "mod_usecases", "svc_api");
    expect(absolutePosition(top, "mod_usecases")).toEqual(abs);
  });

  it("refuses illegal parents and cycles", () => {
    const d = doc();
    expect(() => reparentNode(d, "lyr_app", null)).toThrow(/cannot be placed/);
    expect(() => reparentNode(d, "svc_api", "lyr_app")).toThrow();
  });
});
```

### `src/stores/designer-store.ts`

```ts
/**
 * Client state for one open project: the draft document, undo/redo history
 * (zundo, document only) and save bookkeeping. Pure zustand/vanilla so it is
 * unit-testable in Node; components read it through DesignerStoreProvider.
 *
 * Every action produces a new `document` object, which is what makes undo,
 * autosave (`document !== savedDocument`) and React re-renders work.
 */
import { temporal } from "zundo";
import { createStore } from "zustand/vanilla";

import { allowedEdgeKinds, NODE_KIND_META } from "@/lib/design/catalog";
import { reparentNode, subtreeIds, type Point } from "@/lib/design/geometry";
import { newEdgeId, newNodeId } from "@/lib/design/ids";
import { sortNodesParentFirst } from "@/lib/design/integrity";
import {
  EdgeSchema,
  NodeSchema,
  type DesignDocument,
  type DesignEdge,
  type DesignNode,
  type EdgeKind,
  type NodeKind,
} from "@/lib/design/schema";

export type SaveStatus = "idle" | "saving" | "error" | "conflict";
type Sections = Pick<DesignDocument, "overview" | "stack" | "conventions" | "decisions">;

export interface DesignerState {
  slug: string;
  document: DesignDocument;
  /** The document object the server last accepted; dirty = document !== savedDocument. */
  savedDocument: DesignDocument;
  /** Server revision of savedDocument; sent with the next save. */
  revision: number;
  status: SaveStatus;
  statusMessage: string | null;

  addNode(kind: NodeKind, position: Point, parentId?: string | null): string;
  updateNode(id: string, update: (node: DesignNode) => DesignNode): void;
  /** Apply the result of a finished drag or resize (one undo step). */
  commitGeometry(
    changes: { id: string; position?: Point; size?: { width: number; height: number } }[],
  ): void;
  setParent(id: string, parentId: string | null): void;
  /** Returns the new edge id, or null if the connection is not allowed or exists. */
  connect(source: string, target: string, kind?: EdgeKind): string | null;
  updateEdge(id: string, update: (edge: DesignEdge) => DesignEdge): void;
  /** Removes nodes (with everything nested inside) and edges (plus edges of removed nodes). */
  removeElements(ids: { nodeIds?: string[]; edgeIds?: string[] }): void;
  updateSections(patch: Partial<Sections>): void;
  /** Replace the draft wholesale (restore a version, reload after a conflict). */
  replaceDocument(document: DesignDocument, revision?: number): void;

  markSaving(): void;
  markSaved(savedDocument: DesignDocument, revision: number): void;
  markSaveFailed(status: "error" | "conflict", message: string): void;
}

export type DesignerStore = ReturnType<typeof createDesignerStore>;

export function createDesignerStore(init: {
  slug: string;
  document: DesignDocument;
  revision: number;
}) {
  return createStore<DesignerState>()(
    temporal(
      (set, get) => {
        const mutate = (fn: (doc: DesignDocument) => DesignDocument) => {
          const next = fn(get().document);
          if (next !== get().document) set({ document: next });
        };
        const mapNode = (doc: DesignDocument, id: string, fn: (n: DesignNode) => DesignNode) => ({
          ...doc,
          nodes: doc.nodes.map((n) => (n.id === id ? fn(n) : n)),
        });

        return {
          slug: init.slug,
          document: init.document,
          savedDocument: init.document,
          revision: init.revision,
          status: "idle",
          statusMessage: null,

          addNode(kind, position, parentId = null) {
            const meta = NODE_KIND_META[kind];
            const node = NodeSchema.parse({
              id: newNodeId(kind),
              kind,
              name: `New ${meta.label.toLowerCase()}`,
              parentId,
              position,
              size: meta.container ? meta.defaultSize : null,
            });
            mutate((doc) => ({ ...doc, nodes: sortNodesParentFirst([...doc.nodes, node]) }));
            return node.id;
          },

          updateNode(id, update) {
            mutate((doc) => mapNode(doc, id, update));
          },

          commitGeometry(changes) {
            if (changes.length === 0) return;
            const byId = new Map(changes.map((c) => [c.id, c]));
            mutate((doc) => ({
              ...doc,
              nodes: doc.nodes.map((n) => {
                const c = byId.get(n.id);
                if (!c) return n;
                return { ...n, position: c.position ?? n.position, size: c.size ?? n.size };
              }),
            }));
          },

          setParent(id, parentId) {
            mutate((doc) => reparentNode(doc, id, parentId));
          },

          connect(source, target, kind) {
            const doc = get().document;
            const s = doc.nodes.find((n) => n.id === source);
            const t = doc.nodes.find((n) => n.id === target);
            if (!s || !t) return null;
            const allowed = allowedEdgeKinds(s.kind, t.kind);
            const chosen = kind ?? allowed[0];
            if (!chosen || !allowed.includes(chosen)) return null;
            if (source === target && chosen !== "relation") return null;
            const exists = doc.edges.some(
              (e) => e.kind === chosen && e.source === source && e.target === target,
            );
            if (exists) return null;
            const edge = EdgeSchema.parse({ id: newEdgeId(chosen), kind: chosen, source, target });
            mutate((d) => ({ ...d, edges: [...d.edges, edge] }));
            return edge.id;
          },

          updateEdge(id, update) {
            mutate((doc) => ({
              ...doc,
              edges: doc.edges.map((e) => (e.id === id ? update(e) : e)),
            }));
          },

          removeElements({ nodeIds = [], edgeIds = [] }) {
            mutate((doc) => {
              const doomed = new Set<string>();
              for (const id of nodeIds) for (const x of subtreeIds(doc, id)) doomed.add(x);
              const doomedEdges = new Set(edgeIds);
              if (doomed.size === 0 && doomedEdges.size === 0) return doc;
              const keepId = (id: string) => !doomed.has(id);
              return {
                ...doc,
                nodes: doc.nodes.filter((n) => keepId(n.id)),
                edges: doc.edges.filter(
                  (e) => !doomedEdges.has(e.id) && keepId(e.source) && keepId(e.target),
                ),
                // Scopes must not point at deleted nodes (integrity rule scope.unknown_node).
                stack: doc.stack.map((s) => ({ ...s, scope: s.scope.filter(keepId) })),
                conventions: doc.conventions.map((c) => ({ ...c, scope: c.scope.filter(keepId) })),
              };
            });
          },

          updateSections(patch) {
            mutate((doc) => ({ ...doc, ...patch }));
          },

          replaceDocument(document, revision) {
            set({
              document,
              savedDocument: document,
              revision: revision ?? get().revision,
              status: "idle",
              statusMessage: null,
            });
          },

          markSaving() {
            set({ status: "saving", statusMessage: null });
          },
          markSaved(savedDocument, revision) {
            set({ savedDocument, revision, status: "idle", statusMessage: null });
          },
          markSaveFailed(status, message) {
            set({ status, statusMessage: message });
          },
        };
      },
      {
        // History holds documents only; save bookkeeping is never undone.
        partialize: (s) => ({ document: s.document }),
        equality: (a, b) => a.document === b.document,
        limit: 200,
      },
    ),
  );
}

export const isDirty = (s: DesignerState) => s.document !== s.savedDocument;
```

### `src/stores/designer-store.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { checkIntegrity, parseDesign } from "@/lib/design/integrity";
import { createDesignerStore, isDirty } from "@/stores/designer-store";

const make = () =>
  createDesignerStore({ slug: "team-tasks", document: parseDesign(teamTasksDesign), revision: 3 });

describe("designer store", () => {
  it("adds nodes with defaults and marks the draft dirty", () => {
    const store = make();
    expect(isDirty(store.getState())).toBe(false);
    const id = store.getState().addNode("module", { x: 10, y: 10 }, "lyr_app");
    const node = store.getState().document.nodes.find((n) => n.id === id);
    expect(node).toMatchObject({ kind: "module", name: "New module", parentId: "lyr_app" });
    expect(isDirty(store.getState())).toBe(true);
    expect(checkIntegrity(store.getState().document)).toEqual([]);
  });

  it("connects with the most likely edge kind and refuses invalid ones", () => {
    const store = make();
    const s = store.getState();
    expect(s.connect("ent_user", "ent_project")).not.toBeNull();
    expect(store.getState().document.edges.at(-1)?.kind).toBe("relation");
    expect(store.getState().connect("ent_user", "svc_api")).toBeNull();
    expect(store.getState().connect("svc_api", "api_rest", "exposes")).toBeNull(); // exists
    expect(checkIntegrity(store.getState().document)).toEqual([]);
  });

  it("removes a container with its subtree, edges and scopes", () => {
    const store = make();
    store.getState().removeElements({ nodeIds: ["svc_api"] });
    const doc = store.getState().document;
    expect(doc.nodes.some((n) => n.id === "mod_repo")).toBe(false);
    expect(doc.edges.some((e) => e.source === "mod_repo")).toBe(false);
    expect(doc.stack.find((s) => s.id === "stk_api")?.scope).toEqual([]);
    expect(checkIntegrity(doc)).toEqual([]);
  });

  it("undoes and redoes document changes only", () => {
    const store = make();
    const original = store.getState().document;
    store.getState().commitGeometry([{ id: "svc_web", position: { x: 99, y: 99 } }]);
    store.getState().markSaving();
    const moved = store.getState().document;
    store.temporal.getState().undo();
    expect(store.getState().document).toBe(original);
    expect(store.getState().status).toBe("saving");
    store.temporal.getState().redo();
    expect(store.getState().document).toBe(moved);
  });

  it("tracks what the server has", () => {
    const store = make();
    store.getState().updateNode("svc_web", (n) => ({ ...n, name: "Website" }));
    const sent = store.getState().document;
    store.getState().markSaving();
    store.getState().updateNode("svc_web", (n) => ({ ...n, name: "Site" }));
    store.getState().markSaved(sent, 4);
    expect(store.getState().revision).toBe(4);
    expect(isDirty(store.getState())).toBe(true); // a newer edit is still pending
  });
});
```

### `src/server/env.ts`

```ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.url(),
  APP_URL: z.url().default("http://localhost:3000"),
  // "user:password"; empty disables Basic auth (see src/proxy.ts).
  APP_BASIC_AUTH: z
    .string()
    .regex(/^$|^[^:]+:.+$/, 'APP_BASIC_AUTH must be "user:password"')
    .default(""),
  MIGRATE_ON_START: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parsed process env. Throws a readable error naming every bad variable. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`);
  }
  cached = parsed.data;
  return cached;
}
```

### `src/server/db/schema.ts`

```ts
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { DesignDocument } from "@/lib/design/schema";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** One row per design. `document` is the editable draft; `revision` guards concurrent saves. */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    document: jsonb("document").$type<DesignDocument>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("projects_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)],
);

/** Immutable published snapshots of a project's draft. */
export const projectVersions = pgTable(
  "project_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    label: text("label").notNull().default(""),
    notes: text("notes").notNull().default(""),
    document: jsonb("document").$type<DesignDocument>().notNull(),
    sourceRevision: integer("source_revision").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("project_versions_project_version").on(t.projectId, t.version)],
);

/** MCP bearer tokens. Only the SHA-256 of the token is stored. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    // null = every project; otherwise the token only sees this project.
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_tokens_project_idx").on(t.projectId)],
);

export const COMPONENT_STATUSES = ["todo", "in_progress", "done", "blocked"] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

/** Implementation progress reported by agents, keyed by design node id. */
export const componentStatus = pgTable(
  "component_status",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    status: text("status").$type<ComponentStatus>().notNull(),
    note: text("note").notNull().default(""),
    updatedByTokenId: uuid("updated_by_token_id").references(() => apiTokens.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.nodeId] }),
    check(
      "component_status_status",
      sql`${t.status} in ('todo', 'in_progress', 'done', 'blocked')`,
    ),
  ],
);
```

### `src/server/db/client.ts`

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/server/env";
import * as schema from "@/server/db/schema";

export type Db = NodePgDatabase<typeof schema>;

// Reused across hot reloads in dev so `next dev` does not leak pools.
const globalForDb = globalThis as unknown as { pdPool?: Pool; pdDb?: Db };

export function getPool(): Pool {
  globalForDb.pdPool ??= new Pool({ connectionString: env().DATABASE_URL, max: 10 });
  return globalForDb.pdPool;
}

export function getDb(): Db {
  globalForDb.pdDb ??= drizzle(getPool(), { schema });
  return globalForDb.pdDb;
}

/** For tests and scripts: build a db bound to an explicit connection string. */
export function createDb(connectionString: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString, max: 5 });
  return { db: drizzle(pool, { schema }), pool };
}
```

### `src/server/db/migrate.ts`

```ts
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

// Every replica runs this on boot, so the work is serialised behind a
// session-level advisory lock. The key is arbitrary but must never change.
const MIGRATION_LOCK_KEY = 7_316_402_118;

/** Applies pending SQL migrations from ./drizzle. Safe to call concurrently. */
export async function runMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await migrate(drizzle(client), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}
```

### `src/server/db/migrate-cli.ts`

```ts
/** `npm run db:migrate`: apply migrations without starting the server. */
import { runMigrations } from "@/server/db/migrate";
import { env } from "@/server/env";

async function main() {
  await runMigrations(env().DATABASE_URL);
  console.log("[migrate] up to date");
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
```

### `src/server/services/tokens.ts`

```ts
import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import type { Db } from "@/server/db/client";
import { apiTokens } from "@/server/db/schema";

const TOKEN_PREFIX = "pd_";
// last_used_at is informational; don't write it on every MCP request.
const TOUCH_INTERVAL_MS = 60_000;

export interface Principal {
  tokenId: string;
  /** null = may see every project. */
  projectId: string | null;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a token and returns the plaintext once; only its hash is stored. */
export async function createToken(
  db: Db,
  input: { name: string; projectId?: string | null },
): Promise<{ token: string; id: string }> {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(apiTokens)
    .values({
      name: input.name,
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 6),
      projectId: input.projectId ?? null,
    })
    .returning({ id: apiTokens.id });
  return { token, id: row.id };
}

export async function verifyToken(db: Db, token: string): Promise<Principal | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ id: apiTokens.id, projectId: apiTokens.projectId })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, row.id),
        or(
          isNull(apiTokens.lastUsedAt),
          lt(apiTokens.lastUsedAt, new Date(Date.now() - TOUCH_INTERVAL_MS)),
        ),
      ),
    );
  return { tokenId: row.id, projectId: row.projectId };
}

export async function listTokens(db: Db) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      projectId: apiTokens.projectId,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeToken(db: Db, id: string): Promise<void> {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)));
}
```

### `src/server/services/projects.ts`

```ts
// PROTOTYPE SUBSET — Phase 2 replaces this file with the full service (§8.2).
import { asc, eq } from "drizzle-orm";

import { parseDesign } from "@/lib/design/integrity";
import type { DesignDocumentInput } from "@/lib/design/schema";
import type { Db } from "@/server/db/client";
import { projects } from "@/server/db/schema";
import type { Principal } from "@/server/services/tokens";

export async function createProject(
  db: Db,
  input: { name: string; slug: string; description?: string; document: DesignDocumentInput },
) {
  const [row] = await db
    .insert(projects)
    .values({
      name: input.name,
      slug: input.slug,
      description: input.description ?? "",
      document: parseDesign(input.document),
    })
    .returning();
  return row;
}

export async function listProjects(db: Db, principal?: Principal) {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      description: projects.description,
      revision: projects.revision,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(asc(projects.name));
  return principal?.projectId ? rows.filter((r) => r.id === principal.projectId) : rows;
}

export async function getProjectBySlug(db: Db, slug: string) {
  const [row] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  return row ?? null;
}
```

### `src/server/mcp/server.ts`

```ts
// PROTOTYPE SUBSET — Phase 3 grows this into the full tool set (§9).
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { EDGE_KIND_META, NODE_KIND_META } from "@/lib/design/catalog";
import { designJsonSchema } from "@/lib/design/schema";
import type { Db } from "@/server/db/client";
import { getProjectBySlug, listProjects } from "@/server/services/projects";
import type { Principal } from "@/server/services/tokens";

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export function createDesignMcpServer(deps: { db: Db; principal: Principal }): McpServer {
  const { db, principal } = deps;
  const server = new McpServer(
    { name: "project-design", version: "0.1.0" },
    {
      instructions:
        "Project designs (stack, architecture, layers, APIs, data, integrations) that you must " +
        "follow when generating code. Start with list_projects, then get_design_schema once.",
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Designs this token can read.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await listProjects(db, principal);
      return json(rows.map(({ id: _id, ...r }) => r));
    },
  );

  server.registerTool(
    "get_design_schema",
    {
      title: "Explain the design format",
      description: "Node kinds, edge kinds and the JSON Schema of a design document.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      json({
        nodeKinds: NODE_KIND_META,
        edgeKinds: EDGE_KIND_META,
        jsonSchema: designJsonSchema(),
      }),
  );

  server.registerTool(
    "get_project_design",
    {
      title: "Get a design document",
      description: "The full design document (JSON) of one project.",
      inputSchema: z.object({ project: z.string().describe("Project slug") }),
      annotations: { readOnlyHint: true },
    },
    async ({ project }) => {
      const row = await getProjectBySlug(db, project);
      if (!row || (principal.projectId && row.id !== principal.projectId)) {
        return { ...json({ error: `Unknown project "${project}"` }), isError: true };
      }
      return json({
        slug: row.slug,
        name: row.name,
        revision: row.revision,
        document: row.document,
      });
    },
  );

  return server;
}
```

### `tests/setup/global-setup.ts`

```ts
import { runMigrations } from "@/server/db/migrate";

/** Migrates the test database once per `vitest run`. */
export default async function setup() {
  const url =
    process.env.DATABASE_URL_TEST ?? "postgres://design:design@localhost:5434/project_design_test";
  try {
    await runMigrations(url);
  } catch (error) {
    throw new Error(
      `Cannot migrate the test database at ${url}. Is it running? Try \`npm run db:up\`.\n${String(error)}`,
    );
  }
}
```

### `tests/helpers/db.ts`

```ts
import { sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";

/** Empties every table. Call in beforeEach of each integration test file. */
export async function resetDb(): Promise<void> {
  await getDb().execute(
    sql`truncate table component_status, api_tokens, project_versions, projects restart identity cascade`,
  );
}
```

### `tests/mcp.integration.test.ts`

```ts
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";

import { DELETE, GET, POST } from "@/app/api/mcp/route";
import { TEAM_TASKS_EXAMPLE, teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { getDb } from "@/server/db/client";
import { createProject } from "@/server/services/projects";
import { createToken, revokeToken } from "@/server/services/tokens";
import { resetDb } from "./helpers/db";

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
    await createProject(db, { ...TEAM_TASKS_EXAMPLE, document: teamTasksDesign });
    const { token } = await createToken(db, { name: "test" });
    const client = await connect(token);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      "get_design_schema",
      "get_project_design",
      "list_projects",
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
    const a = await createProject(db, { ...TEAM_TASKS_EXAMPLE, document: teamTasksDesign });
    await createProject(db, { name: "Other", slug: "other", document: { schemaVersion: 1 } });
    const scoped = await createToken(db, { name: "scoped", projectId: a.id });

    const client = await connect(scoped.token);
    const projects = text(await client.callTool({ name: "list_projects", arguments: {} }));
    expect(projects.map((p: { slug: string }) => p.slug)).toEqual(["team-tasks"]);
    const other = await client.callTool({
      name: "get_project_design",
      arguments: { project: "other" },
    });
    expect(other.isError).toBe(true);
    await client.close();

    await revokeToken(db, scoped.id);
    await expect(connect(scoped.token)).rejects.toThrow();
  });
});
```

### `e2e/smoke.spec.ts`

```ts
import { expect, test } from "@playwright/test";

import { TEAM_TASKS_EXAMPLE, teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { createDb } from "@/server/db/client";
import { createProject, getProjectBySlug } from "@/server/services/projects";

const DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://design:design@localhost:5434/project_design_test";

test.beforeAll(async () => {
  const { db, pool } = createDb(DATABASE_URL);
  if (!(await getProjectBySlug(db, TEAM_TASKS_EXAMPLE.slug))) {
    await createProject(db, { ...TEAM_TASKS_EXAMPLE, document: teamTasksDesign });
  }
  await pool.end();
});

test("renders the example design on the canvas without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Team Tasks" })).toBeVisible();
  await page.getByRole("link", { name: "Team Tasks" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(teamTasksDesign.nodes!.length);
  expect(errors).toEqual([]);
});
```
