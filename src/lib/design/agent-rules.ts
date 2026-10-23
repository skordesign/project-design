/**
 * Pure isomorphic generator for coding agent guidelines and IDE rules.
 * Generates AGENTS.md, .cursorrules, CLAUDE.md, and .mcp.json configurations
 * tailored to a specific project design document.
 *
 * Governs AI coding agents (Claude Code, Cursor, Windsurf, Cline, Codex, Devin)
 * so they adhere strictly to the architecture, layer boundaries, and conventions.
 */
import type { DesignDocument } from "@/lib/design/schema";

export interface AgentRulesMeta {
  name?: string;
  slug?: string;
  appUrl?: string;
}

/**
 * Generates standard AGENTS.md / CLAUDE.md guidelines for coding agents.
 */
export function toAgentsMd(doc: DesignDocument, meta: AgentRulesMeta = {}): string {
  const name = meta.name || "Software Project";
  const slug = meta.slug || "project";
  const appUrl = (meta.appUrl || "http://localhost:3000").replace(/\/$/, "");
  const mcpUrl = `${appUrl}/api/mcp`;

  const lines: string[] = [];

  // 1. Header & Vision
  lines.push(`# ${name} — Coding Agent Guidelines & Architecture Rules`);
  lines.push("");
  lines.push(
    "> **CRITICAL FOR ALL AI CODING AGENTS (Claude Code, Cursor, Codex, Cline, Devin, Antigravity)**:",
  );
  lines.push(
    "> This repository is governed by an architecture design in the Project Designer MCP server.",
  );
  lines.push(
    "> You must implement what was designed — **DO NOT hallucinate or invent new architectures**.",
  );
  lines.push("");

  // 2. Overview
  lines.push("## 1. System Overview");
  lines.push("");
  lines.push(`- **Architecture Style**: \`${doc.overview.architectureStyle}\``);
  if (doc.overview.summary) {
    lines.push(`- **Summary**: ${doc.overview.summary.trim()}`);
  }
  if (doc.overview.repository) {
    lines.push(
      `- **Repository Layout**: \`${doc.overview.repository.layout}\` (Package manager: \`${doc.overview.repository.packageManager}\`)`,
    );
  }
  if (doc.overview.architectureNotes) {
    lines.push(`- **Architecture Notes**: ${doc.overview.architectureNotes.trim()}`);
  }
  if (doc.overview.goals.length > 0) {
    lines.push("");
    lines.push("### Goals");
    for (const g of doc.overview.goals) lines.push(`- ${g}`);
  }
  if (doc.overview.nonGoals.length > 0) {
    lines.push("");
    lines.push("### Non-Goals (Out of Scope)");
    for (const ng of doc.overview.nonGoals) lines.push(`- 🚫 ${ng}`);
  }
  lines.push("");

  // 3. MCP Server Connectivity
  lines.push("## 2. Architecture Single Source of Truth (MCP)");
  lines.push("");
  lines.push(`- **MCP Server Endpoint**: \`${mcpUrl}\``);
  lines.push(`- **Project Slug**: \`${slug}\``);
  lines.push(
    "- **Required Environment Variable**: `PROJECT_DESIGNER_TOKEN` (Bearer token for MCP auth)",
  );
  lines.push("");
  lines.push("### Essential MCP Tools to Call:");
  lines.push(
    '- `get_project_brief(project: "' +
      slug +
      '")`: The complete architecture markdown brief. Read before touching code.',
  );
  lines.push(
    '- `get_build_plan(project: "' + slug + '")`: Dependency-ordered list of components to build.',
  );
  lines.push(
    '- `resolve_file_to_component(project: "' +
      slug +
      '", filePath: "...")`: Maps any source file to its owning component, allowed layer dependencies, and conventions.',
  );
  lines.push(
    '- `get_api_contract(project: "' +
      slug +
      '", api: "...")`: OpenAPI 3.1 schema for API endpoints.',
  );
  lines.push(
    '- `get_data_model(project: "' +
      slug +
      '", format: "sql")`: Exact PostgreSQL DDL and entity relationships.',
  );
  lines.push(
    '- `set_component_status(project: "' +
      slug +
      '", id: "...", status: "in_progress" | "done" | "blocked")`: Reports implementation progress back to the visual canvas.',
  );
  lines.push("");

  // 4. Layer Boundary Rules (Clean Architecture / Layer Dependency Matrix)
  const services = doc.nodes.filter((n) => n.kind === "service");
  const layers = doc.nodes.filter((n) => n.kind === "layer");
  const layerDependsEdges = doc.edges.filter((e) => e.kind === "depends_on");
  const layerMap = new Map(layers.map((l) => [l.id, l]));

  lines.push("## 3. Strict Layer Boundaries (Dependency Matrix)");
  lines.push("");
  lines.push("Layer violations break maintainability. **You must adhere to allowed directions**:");
  lines.push("");

  if (layers.length === 0) {
    lines.push("_No explicit layers defined; follow standard package boundaries._");
  } else {
    for (const service of services) {
      const serviceLayers = layers.filter((l) => l.parentId === service.id);
      if (serviceLayers.length === 0) continue;

      lines.push(`### Service: \`${service.name}\` (\`${service.id}\`)`);
      lines.push("");
      for (const layer of serviceLayers) {
        const allowedTargets = layerDependsEdges
          .filter((e) => e.source === layer.id)
          .map((e) => layerMap.get(e.target)?.name || e.target);

        const targetDesc =
          allowedTargets.length > 0
            ? allowedTargets.map((t) => `\`${t}\``).join(", ")
            : "_None (Leaf Core layer - no external dependencies allowed)_";

        lines.push(`- **Layer \`${layer.name}\`** (\`${layer.data.path}\`):`);
        lines.push(`  - Allowed to depend on: ${targetDesc}`);
        lines.push(
          `  - ❌ **Prohibited**: Importing from any layer not explicitly listed above. Direct database imports from presentation/controller layers are strictly prohibited.`,
        );
      }
      lines.push("");
    }
  }

  // 5. Hard Conventions (MUST rules)
  const mustConventions = doc.conventions.filter((c) => c.level === "must");
  const shouldConventions = doc.conventions.filter((c) => c.level === "should");

  lines.push("## 4. Coding Conventions & Standards");
  lines.push("");
  if (mustConventions.length > 0) {
    lines.push("### MUST Conventions (Zero-tolerance rules):");
    for (const c of mustConventions) {
      const scope =
        c.scope && c.scope.length > 0
          ? ` _(Scope: ${c.scope.map((s) => `\`${s}\``).join(", ")})_`
          : "";
      lines.push(`- **[${c.category.toUpperCase()}]** ${c.rule}${scope}`);
    }
    lines.push("");
  }

  if (shouldConventions.length > 0) {
    lines.push("### SHOULD Conventions (Standard practices):");
    for (const c of shouldConventions) {
      const scope =
        c.scope && c.scope.length > 0
          ? ` _(Scope: ${c.scope.map((s) => `\`${s}\``).join(", ")})_`
          : "";
      lines.push(`- **[${c.category.toUpperCase()}]** ${c.rule}${scope}`);
    }
    lines.push("");
  }

  // 6. Architecture Decision Records (ADRs)
  if (doc.decisions.length > 0) {
    lines.push("## 5. Architecture Decision Records (ADRs)");
    lines.push("");
    for (const d of doc.decisions) {
      lines.push(`### ADR: ${d.title} (${d.date})`);
      lines.push(`- **Context**: ${d.context}`);
      lines.push(`- **Decision**: ${d.decision}`);
      lines.push(`- **Consequences**: ${d.consequences}`);
      lines.push("");
    }
  }

  // 7. Approved Tech Stack
  if (doc.stack.length > 0) {
    lines.push("## 6. Approved Technology Stack");
    lines.push("");
    lines.push("| Category | Name | Version | Scope / Notes |");
    lines.push("|---|---|---|---|");
    for (const s of doc.stack) {
      const scope = s.scope && s.scope.length > 0 ? s.scope.join(", ") : "Global";
      lines.push(`| ${s.category} | **${s.name}** | \`${s.version}\` | ${s.notes || scope} |`);
    }
    lines.push("");
    lines.push(
      "> ⚠️ **Rule**: Do not introduce additional npm packages, ORMs, or external frameworks without explicit approval.",
    );
    lines.push("");
  }

  // 8. Agent Operating Protocol
  lines.push("## 7. Step-by-Step Implementation Workflow");
  lines.push("");
  lines.push("Follow this loop for every component you implement:");
  lines.push("");
  lines.push(
    "1. **Read Build Plan**: Query `get_build_plan` to pick the next uncompleted component.",
  );
  lines.push('2. **Start Work**: Call `set_component_status(id: "...", status: "in_progress")`.');
  lines.push(
    "3. **Inspect Specifications**: Call `get_component` to inspect required exports, responsibilities, env vars, and contracts.",
  );
  lines.push(
    "4. **Write Code & Tests**: Code within the allocated folder path. Write corresponding unit tests as mandated by conventions.",
  );
  lines.push(
    "5. **Validate Boundaries**: Check that imports do not violate the Layer Matrix above.",
  );
  lines.push(
    '6. **Complete Step**: Call `set_component_status(id: "...", status: "done")`. If blocked, report `blocked` with an explicit reason.',
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Generates a concise .cursorrules file for Cursor AI IDE.
 */
export function toCursorRules(doc: DesignDocument, meta: AgentRulesMeta = {}): string {
  const name = meta.name || "Project";
  const slug = meta.slug || "project";
  const appUrl = (meta.appUrl || "http://localhost:3000").replace(/\/$/, "");
  const mcpUrl = `${appUrl}/api/mcp`;

  const mustRules = doc.conventions.filter((c) => c.level === "must");

  const lines: string[] = [];
  lines.push(`# Cursor Rules for ${name}`);
  lines.push("");
  lines.push("## Core Principles");
  lines.push(
    `- This project is strictly governed by the Project Designer MCP server at \`${mcpUrl}\` (project: \`${slug}\`).`,
  );
  lines.push(
    "- Architecture style is `" +
      doc.overview.architectureStyle +
      "`. Never invent unauthorized layers, services, or phantom endpoints.",
  );
  lines.push(
    "- Before creating or editing any file, call `resolve_file_to_component(filePath)` over MCP to verify layer rules.",
  );
  lines.push("");

  if (mustRules.length > 0) {
    lines.push("## Mandatory Conventions");
    for (const r of mustRules) {
      lines.push(`- ${r.rule}`);
    }
    lines.push("");
  }

  lines.push("## Layer & Boundary Guardrails");
  const layers = doc.nodes.filter((n) => n.kind === "layer");
  const layerDependsEdges = doc.edges.filter((e) => e.kind === "depends_on");
  const layerMap = new Map(layers.map((l) => [l.id, l]));

  for (const l of layers) {
    const targets = layerDependsEdges
      .filter((e) => e.source === l.id)
      .map((e) => layerMap.get(e.target)?.name || e.target);
    if (targets.length > 0) {
      lines.push(
        `- Layer \`${l.name}\` (${l.data.path}) may ONLY depend on: ${targets.join(", ")}.`,
      );
    } else {
      lines.push(`- Layer \`${l.name}\` (${l.data.path}) is CORE: may NOT import other layers.`);
    }
  }
  lines.push("");

  lines.push("## Progress Tracking");
  lines.push(
    `- Update canvas status via \`set_component_status\` (in_progress / done / blocked) as you implement components.`,
  );

  return lines.join("\n");
}

/**
 * Generates standard .mcp.json configuration for Claude Code and Cursor.
 */
export function toMcpConfig(meta: AgentRulesMeta = {}): string {
  const appUrl = (meta.appUrl || "http://localhost:3000").replace(/\/$/, "");
  const config = {
    mcpServers: {
      "project-designer": {
        type: "http",
        url: `${appUrl}/api/mcp`,
        headers: {
          Authorization: "Bearer ${PROJECT_DESIGNER_TOKEN}",
        },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}
