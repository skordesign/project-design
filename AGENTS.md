<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Designer

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
- Projects belong to users. Pages, server actions and REST routes get the signed-in principal
  from `src/server/auth/current.ts` and pass it to every service call that takes a slug.
- Never edit `drizzle/` by hand; generate migrations.
- UI is shadcn/ui (`src/components/ui`, generated — don't hand-edit), Tailwind 4, lucide icons.
