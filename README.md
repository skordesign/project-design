# Project Designer

> **Tells the developer what the fuck is going on.**

You open a repo. There are 40 folders, three of them are called `utils`, a service named
`legacy-v2-new` and a queue nobody admits to owning. The AI agent you hired to help has, with
total confidence, just invented a fourth architecture. Nobody knows what is going on.

**Project Designer fixes that.** You draw the project once — stack, architecture, services,
layers, modules, databases, APIs, queues, third-party integrations — on a canvas. That drawing
becomes the single source of truth, and coding agents (Claude Code, Cursor, Codex, …) read it
over [MCP](https://modelcontextprotocol.io) before they write a single line. They build what you
designed, not what they hallucinated, and they tick off each box on the canvas as they go.

![The designer showing the Team Tasks example](docs/screenshot.png)

## Why bother

- **For you:** one picture of the whole system. Which service talks to which, what lives in
  which layer, which table belongs where. No archaeology required.
- **For the new hire:** open the canvas, read the brief, understand the project before lunch
  instead of before the next reorg.
- **For the agent:** a typed, validated design with a dependency-ordered build plan, an OpenAPI
  contract and a data model. Fewer "creative interpretations". Zero vibes-based architecture.
- **For future you:** published versions with diffs, so "who changed the auth flow and why"
  has an answer that isn't `git blame` and a sigh.

## How it works (the 60-second tour)

1. **Draw it.** Create a project (or start from **Example: Team Tasks** if a blank canvas
   scares you). Drop services, nest layers and modules inside them, add datastores with
   entities, APIs with operations, queues with channels, integrations and actors. Connect them
   with typed edges — `calls`, `depends_on`, `publishes`, `subscribes` and friends.
   Already have the code? Connect an agent and let it
   [describe the existing project](#describe-an-existing-project) for you.
2. **Write down the boring-but-important stuff.** Tech stack, conventions, architecture
   decisions (ADRs) and a markdown brief. The things everyone "just knows" until they quit.
3. **Check it.** The validation panel yells about unused components, layer violations and
   things that don't add up — before an agent cheerfully builds them.
4. **Publish a version.** Freeze a snapshot so an agent can build against it while you keep
   fiddling with the draft.
5. **Point an agent at it.** Create an MCP token, connect your agent (see below) and run the
   `implement_design` prompt. It reads the brief, follows the build plan component by component
   and reports `in_progress` / `done` / `blocked` back to the canvas.
6. **Watch the boxes turn green.** Or red. At least now you know _which_ box is on fire.

## What's inside

- **Canvas designer** (React Flow): services contain layers contain modules; datastores contain
  entities; typed connections (`depends_on`, `calls`, `exposes`, `accesses`, `publishes`,
  `subscribes`, `uses`, `relation`, `interacts`); inspector forms for every kind; undo/redo,
  autosave, validation panel.
- **Project sections**: overview, tech stack, conventions, architecture decisions, a markdown
  **brief**, and published **versions** with diff and restore.
- **MCP server** at `/api/mcp`: 23 tools, 3 prompts, 3 resources. Agents get the brief, the raw
  JSON, per-component context, an OpenAPI 3.1 contract, the data model (JSON or Mermaid), a
  dependency-ordered build plan and the changes between versions — and can edit the design too.
- **Cloud or self-hosted**: use the hosted version at
  [pd.polarizelab.com](https://pd.polarizelab.com), or run it yourself with Next.js 16,
  PostgreSQL 18 and one Docker Compose file — then your architecture stays on your machine,
  where it can't embarrass you in public.

## Two ways to run it

|                  | Cloud                                                    | Local                                   |
| ---------------- | -------------------------------------------------------- | --------------------------------------- |
| URL              | <https://pd.polarizelab.com>                             | <http://localhost:3000>                 |
| Setup            | None                                                     | Docker                                  |
| Login            | GitHub sign-in; your projects are private to your account | None (local mode, one built-in user)   |
| MCP endpoint     | `https://pd.polarizelab.com/api/mcp`                     | `http://localhost:3000/api/mcp`         |
| Your data lives  | On the hosted server                                     | In a Docker volume on your machine      |

### Cloud

1. Open <https://pd.polarizelab.com> and **sign in with GitHub**.
2. Create a project (try **Example: Team Tasks**).
3. Create a token under **Settings → MCP tokens** and [connect an agent](#connect-an-agent)
   using `https://pd.polarizelab.com/api/mcp`.

### Local (Docker)

```bash
docker compose up -d --build --wait
open http://localhost:3000        # or xdg-open on Linux
```

Create a project (try **Example: Team Tasks**), then [connect an agent](#connect-an-agent)
using `http://localhost:3000/api/mcp`. Out of the box
the app runs in **local mode**: no login, one built-in user. To give each person their own
designs, turn on GitHub sign-in: create a GitHub OAuth app (**GitHub → Settings → Developer
settings → OAuth Apps**) with the callback URL `<APP_URL>/api/auth/github/callback` and pass its
credentials as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (for example in a `.env` file next
to `compose.yaml`). The first GitHub account to sign in takes over the local user's projects
and tokens. Data lives in the
`pgdata` Docker volume; `docker compose down` keeps it, `docker compose down -v` deletes it.
The app and the database bind to `127.0.0.1` only. Change the ports with `APP_PORT` and
`DB_PORT`.

## Connect an agent

Create a token under **Settings → MCP tokens**. A token can be scoped to one project, which lets
the agent leave out the `project` argument — create one per generated repository. The examples
use the cloud URL; for a local install use `http://localhost:3000/api/mcp` instead (the
**Settings** page shows the right snippet for the instance you're on).

Most config files below read the token from an environment variable, so it never lands in a
committed file. Export it in the shell (or profile) your agent starts from:

```bash
export PROJECT_DESIGNER_TOKEN=pd_…
```

### Claude Code

```bash
claude mcp add --transport http project-designer https://pd.polarizelab.com/api/mcp \
  --header "Authorization: Bearer pd_…"
```

Or commit a `.mcp.json` at the repository root:

```json
{
  "mcpServers": {
    "project-designer": {
      "type": "http",
      "url": "https://pd.polarizelab.com/api/mcp",
      "headers": { "Authorization": "Bearer ${PROJECT_DESIGNER_TOKEN}" }
    }
  }
}
```

### Codex (CLI and IDE extension)

```bash
codex mcp add project-designer --url https://pd.polarizelab.com/api/mcp \
  --bearer-token-env-var PROJECT_DESIGNER_TOKEN
```

Or add it to `~/.codex/config.toml` by hand:

```toml
[mcp_servers.project-designer]
url = "https://pd.polarizelab.com/api/mcp"
bearer_token_env_var = "PROJECT_DESIGNER_TOKEN"
```

### Cursor

`.cursor/mcp.json` in the repository (or `~/.cursor/mcp.json` for every project):

```json
{
  "mcpServers": {
    "project-designer": {
      "url": "https://pd.polarizelab.com/api/mcp",
      "headers": { "Authorization": "Bearer ${env:PROJECT_DESIGNER_TOKEN}" }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json` (Cascade → MCP servers → Configure), then press
**Refresh**:

```json
{
  "mcpServers": {
    "project-designer": {
      "serverUrl": "https://pd.polarizelab.com/api/mcp",
      "headers": { "Authorization": "Bearer ${env:PROJECT_DESIGNER_TOKEN}" }
    }
  }
}
```

### VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json` in the repository. VS Code asks for the token once and stores it securely:

```json
{
  "servers": {
    "project-designer": {
      "type": "http",
      "url": "https://pd.polarizelab.com/api/mcp",
      "headers": { "Authorization": "Bearer ${input:project-designer-token}" }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "project-designer-token",
      "description": "Project Designer MCP token",
      "password": true
    }
  ]
}
```

### Gemini CLI

`~/.gemini/settings.json` (or `.gemini/settings.json` in the repository):

```json
{
  "mcpServers": {
    "project-designer": {
      "httpUrl": "https://pd.polarizelab.com/api/mcp",
      "headers": { "Authorization": "Bearer $PROJECT_DESIGNER_TOKEN" }
    }
  }
}
```

### Anything else

Any client that speaks remote MCP: a **Streamable HTTP** server at `<APP_URL>/api/mcp` with
the header `Authorization: Bearer <token>`. Clients that only run local (stdio) servers, such as
Claude Desktop, can use the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge:

```json
{
  "mcpServers": {
    "project-designer": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://pd.polarizelab.com/api/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer pd_…" }
    }
  }
}
```

Check the connection with the client's MCP list (`/mcp` in Claude Code and Codex, the MCP
settings page in Cursor, Windsurf and VS Code): `project-designer` should show its tools.

## Use it from your agent

### Describe an existing project

Already have a codebase and no design? Let the agent draw it for you:

1. Create an empty project in the app (**New project → Blank**).
2. Create a token scoped to that project and connect the agent from the repository's folder.
3. Ask the agent:

   > Describe this repository in the project-designer MCP server.
   > 1. Call get_design_schema, then list_projects to find the (empty) project to fill.
   > 2. Explore the code. Add what really exists with add_component and connect_components:
   >    services and apps, the layers and modules inside them, datastores with their entities,
   >    APIs with their operations, queues and channels, third-party integrations and actors.
   > 3. Fill in the overview with update_overview, and the tech stack (versions from the
   >    lockfiles), conventions and notable architecture decisions with upsert_section_items.
   > 4. Only add what you can point to in the code. Mark each component that is already
   >    implemented as done with set_component_status.
   > 5. Finish with validate_design and summarise what you mapped and what you were unsure about.

   The same prompt is on the **Settings** page with a copy button.

4. Open the canvas. Every edit is saved to the draft at once, so you can watch it fill up,
   then tidy the layout, fix what the agent got wrong and **publish** a first version.

From then on the design is the map of the project: the next developer (or agent) reads the brief
instead of 40 folders.

### Build from a design

Ask the agent to run the **`implement_design`** prompt, or just: _"Read the design with
get_project_brief and implement it step by step."_ Then go get a coffee and check the canvas
when you're back. When the design changes later, `sync_design_changes` updates the code from
the diff, and `review_against_design` lists where the code has drifted.

### Enforce it in CI

Status write-back is mandatory, and a gate verifies it. `get_compliance_report` totals
every build step per status, lists blocked and stale steps, and returns a pass/fail gate.
Run it from any pipeline with the zero-dependency `scripts/design-gate.mjs`:

```bash
export PROJECT_DESIGNER_TOKEN=pd_…
node scripts/design-gate.mjs --url https://pd.polarizelab.com/api/mcp \
  --project team-tasks --min-done 100 --fail-on-blocked
```

Exit `0` means pass, `1` means the gate failed, `2` means a usage or transport error.
Example GitHub Actions step (run after your agent job):

```yaml
- name: Design compliance gate
  env:
    PROJECT_DESIGNER_TOKEN: ${{ secrets.PROJECT_DESIGNER_TOKEN }}
  run: node scripts/design-gate.mjs --url https://pd.polarizelab.com/api/mcp --project team-tasks --fail-on-blocked
```

Agents can also read the machine-friendly instructions at `<APP_URL>/llms.txt`, and
repos can commit the `skills/design-loop/SKILL.md` skill so every agent session follows
the design-first loop without being told.

### Tools, prompts and resources

| Tool                                                    | What it returns                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `list_projects`                                         | Projects this token can read                                    |
| `get_design_schema`                                     | What every node/edge kind means, plus the JSON Schema           |
| `get_project_brief`                                     | The whole design as markdown (start here)                       |
| `get_project_design`                                    | The raw design document (JSON)                                  |
| `list_components`, `get_component`                      | The component tree; one component with its context and status   |
| `get_api_contract`                                      | OpenAPI 3.1 for REST APIs, JSON otherwise                       |
| `get_data_model`                                        | Entities, fields, indexes, relations (JSON or Mermaid ER)       |
| `get_build_plan`                                        | Dependency-ordered implementation steps with current statuses   |
| `get_compliance_report`                                 | Progress totals, blocked/stale steps and a pass/fail CI gate    |
| `validate_design`                                       | Warnings about unused, unimplemented or inconsistent parts      |
| `get_design_changes`                                    | What changed between two versions (or a version and the draft)  |
| `set_component_status`                                  | Write-back: `todo` / `in_progress` / `done` / `blocked` + note  |
| `add_component`, `update_component`, `remove_components` | Edit components in the draft (validated, saved at once)         |
| `connect_components`, `update_connection`, `remove_connections` | Edit typed connections between components               |
| `update_overview`, `upsert_section_items`, `remove_section_items` | Edit the overview, stack, conventions and decisions   |
| `apply_service_template`                                | Fill a service with a starter stack, conventions and layers     |
| `add_game_system`                                       | Add a built-in game system (elementals, combat, loot…)          |
| `save_project_design`                                   | Replace the whole draft (checks the revision)                   |

Prompts: `implement_design`, `sync_design_changes`, `review_against_design`. Resources:
`design://schema`, `design://projects/{slug}/brief`, `design://projects/{slug}/document`.
Every read tool accepts `version`: `"draft"` (default), `"latest"` or a version number, so an
agent can build against a published snapshot while you keep editing.

## Develop

Requires Node ≥ 24 and Docker.

```bash
cp .env.example .env
npm install
npx playwright install chromium     # for the e2e tests
npm run db:up                       # Postgres 18 on 127.0.0.1:5434 (dev + test databases)
npm run dev                         # http://localhost:3000
```

| Command                              | What it does                                                          |
| ------------------------------------ | --------------------------------------------------------------------- |
| `npm run verify`                     | Prettier, ESLint, typecheck, unit + integration tests, production build |
| `npm test` / `npm run test:integration` | Vitest unit tests / integration tests against the test database    |
| `npm run test:e2e`                   | Playwright against the standalone build (run `npm run build` first)    |
| `npm run db:generate -- --name x`    | New SQL migration from `src/server/db/schema.ts`                       |
| `npm run docs:screenshot`            | Regenerate `docs/screenshot.png`                                       |

The app migrates its own database on boot (`MIGRATE_ON_START`). Everything the UI saves and
every document an agent reads goes through one contract, `src/lib/design/schema.ts`. See
[AGENTS.md](AGENTS.md) for the rules this codebase follows.

## Backup and restore

```bash
docker compose exec -T db pg_dump -U design project_design > backup.sql        # back up
docker compose exec -T db psql -U design project_design < backup.sql           # restore (into an empty database)
```

A single design can also be exported from the UI (**Export** opens a dialog with the
diagram as PNG / SVG / PDF / MMD diagram-as-code plus Design JSON, the Markdown brief and
SQL DDL) and imported again from the projects page.

## Deploy (GitHub Actions → Coolify)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main`
(or manually from the Actions tab): it builds the `Dockerfile`, pushes
`<REGISTRY>/<IMAGE_NAME>:latest` and `:sha-<short sha>` to your private registry, then sends a
`POST` to the Coolify deploy webhook so Coolify pulls the new image.

Set these under **Settings → Secrets and variables → Actions**:

| Name                | Kind     | Value                                                                       |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| `REGISTRY`          | variable | Registry host, e.g. `registry.example.com`                                  |
| `IMAGE_NAME`        | variable | Image path in the registry, e.g. `team/project-design`                      |
| `REGISTRY_USERNAME` | secret   | Registry user allowed to push                                               |
| `REGISTRY_PASSWORD` | secret   | Its password or access token                                                |
| `COOLIFY_WEBHOOK`   | secret   | The resource's **Deploy Webhook** URL (`…/api/v1/deploy?uuid=…&force=false`) |
| `COOLIFY_TOKEN`     | secret   | A Coolify API token with the `deploy` permission                            |

In Coolify, create the app as a **Docker Image** resource pointing at
`<REGISTRY>/<IMAGE_NAME>:latest`, add the registry credentials to the server
(`docker login` on the host), expose port 3000 with `/api/health` as the health check, and set
the variables from [Configuration](#configuration) — at least `DATABASE_URL` and an `https://`
`APP_URL`. The app migrates its database on start.

## Configuration

| Variable          | Default                                                           | Purpose                                                              |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`    | `postgres://design:design@localhost:5434/project_design` (dev)    | Postgres connection string (Compose sets it for the app)             |
| `DATABASE_URL_TEST` | `…/project_design_test`                                         | Database for integration and e2e tests                               |
| `APP_URL`         | `http://localhost:3000`                                           | Base URL shown in the connection snippets                            |
| `APP_BASIC_AUTH`  | _(empty)_                                                         | `user:password`; when set, the UI and REST API also require HTTP Basic auth |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | _(empty)_                                | GitHub OAuth app for sign-in (callback `<APP_URL>/api/auth/github/callback`); empty means local mode, no login |
| `GITHUB_ALLOWED_USERS` | _(empty)_                                                    | Comma-separated GitHub logins allowed to sign in; empty allows any account |
| `MIGRATE_ON_START` | `true`                                                           | Run migrations when the server starts                                |
| `APP_PORT`, `DB_PORT` | `3000`, `5434`                                                | Host ports used by `compose.yaml`                             |

## Security

- **Local mode** (no GitHub credentials) has no login: anyone who can reach the app can use it.
  Compose binds every port to `127.0.0.1`. **Don't expose a local-mode install beyond localhost
  without `APP_BASIC_AUTH` and TLS.**
- With GitHub credentials set, the UI and the REST API need a **GitHub sign-in**. Each account
  sees only its own projects and MCP tokens. Sessions are HTTP-only cookies; only their SHA-256
  is stored. If you expose the app, serve it over TLS (set an `https://` `APP_URL` so cookies
  are `Secure`) and set `GITHUB_ALLOWED_USERS` unless anyone with a GitHub account may sign up.
- MCP requests need a bearer token. A token acts for the account that created it. Only the
  SHA-256 of a token is stored, the plaintext is shown once, and revoking a token takes effect
  immediately. A project-scoped token cannot see other projects.
- Every inbound document is validated (schema plus integrity rules) and JSON bodies are
  size-limited; all SQL goes through Drizzle (parameterised); user text is rendered as text,
  never as HTML.

## License

Copyright 2026 Project Designer contributors. Licensed under the
[Apache License, Version 2.0](LICENSE).
