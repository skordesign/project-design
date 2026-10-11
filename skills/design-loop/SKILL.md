---
name: design-loop
description: Build and review code against a Project Design architecture over MCP. Use when the repo is wired to a project-design server (there is a project-design entry in .mcp.json, .cursor/mcp.json, or similar), when asked to implement/sync/review a design, or when starting work in an unfamiliar codebase that has one.
---

# Design loop

The architecture lives in the `project-design` MCP server, not in this repo's
docs. Read it first, build what it says, report progress per component.

## Implement from a design

1. `list_projects` if you don't know the slug, then `get_design_schema` once.
2. `get_project_brief` — read all of it. MUST conventions and layer rules are
   hard constraints.
3. `get_build_plan` — work the steps in order. Before coding a step, call
   `get_component` for it (plus `get_api_contract` / `get_data_model` where
   relevant).
4. `set_component_status` for every step: `in_progress` on start, `done` only
   when it builds and its tests pass, `blocked` with a note when the design
   stops you. A CI gate checks this — unreported work counts as not done.
5. Never invent components, endpoints, fields or dependencies. Missing
   something? Mark `blocked` and say exactly what.
6. Finish with `validate_design` and `get_compliance_report`.

Prefer the `implement_design` prompt: it runs this whole loop.

## Keep code and design in sync

- Design changed under you? Run `sync_design_changes` (needs the version the
  code was generated from).
- Asked to review without changing code? Run `review_against_design` and list
  deviations with file paths: missing components, forbidden dependencies,
  API/data-model mismatches, stack or convention violations.
- Pin your work to a published snapshot: pass `version` (`"latest"` or a
  number) to every read tool so human edits to the draft don't move you.
