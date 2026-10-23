import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { parseDesign } from "@/lib/design/integrity";
import { toAgentsMd, toCursorRules, toMcpConfig } from "@/lib/design/agent-rules";

const doc = parseDesign(teamTasksDesign);
const meta = {
  name: "Team Tasks",
  slug: "team-tasks",
  appUrl: "https://design.example.com",
};

describe("toAgentsMd", () => {
  it("generates markdown with clear agent constraints and system overview", () => {
    const md = toAgentsMd(doc, meta);

    // Header & metadata
    expect(md).toContain("# Team Tasks — Coding Agent Guidelines & Architecture Rules");
    expect(md).toContain("CRITICAL FOR ALL AI CODING AGENTS");
    expect(md).toContain("DO NOT hallucinate or invent new architectures");

    // Overview
    expect(md).toContain("`clean`");
    expect(md).toContain("A web app where small teams create projects");

    // MCP details
    expect(md).toContain("https://design.example.com/api/mcp");
    expect(md).toContain('get_project_brief(project: "team-tasks")');
    expect(md).toContain("PROJECT_DESIGNER_TOKEN");

    // Strict Layer Boundaries
    expect(md).toContain("Strict Layer Boundaries (Dependency Matrix)");
    expect(md).toContain("Service: `API` (`svc_api`)");
    expect(md).toContain("Layer `HTTP`");

    // Conventions
    expect(md).toContain("Coding Conventions & Standards");
    expect(md).toContain("MUST Conventions (Zero-tolerance rules)");

    // Tech Stack
    expect(md).toContain("Approved Technology Stack");
    expect(md).toContain("Fastify");
    expect(md).toContain("PostgreSQL");

    // Operating protocol
    expect(md).toContain("Step-by-Step Implementation Workflow");
    expect(md).toContain('set_component_status(id: "...", status: "in_progress")');
    expect(md).toContain('set_component_status(id: "...", status: "done")');
  });

  it("handles fallback defaults when metadata is omitted", () => {
    const md = toAgentsMd(doc);
    expect(md).toContain("# Software Project — Coding Agent Guidelines & Architecture Rules");
    expect(md).toContain("http://localhost:3000/api/mcp");
    expect(md).toContain('get_project_brief(project: "project")');
  });
});

describe("toCursorRules", () => {
  it("generates concise rules for Cursor AI", () => {
    const rules = toCursorRules(doc, meta);

    expect(rules).toContain("# Cursor Rules for Team Tasks");
    expect(rules).toContain("https://design.example.com/api/mcp");
    expect(rules).toContain("Core Principles");
    expect(rules).toContain("Mandatory Conventions");
    expect(rules).toContain("Layer & Boundary Guardrails");
    expect(rules).toContain("Progress Tracking");
  });
});

describe("toMcpConfig", () => {
  it("generates valid .mcp.json configuration", () => {
    const jsonStr = toMcpConfig(meta);
    const parsed = JSON.parse(jsonStr);

    expect(parsed).toHaveProperty("mcpServers");
    expect(parsed.mcpServers).toHaveProperty("project-designer");
    expect(parsed.mcpServers["project-designer"].url).toBe("https://design.example.com/api/mcp");
    expect(parsed.mcpServers["project-designer"].headers.Authorization).toBe(
      "Bearer ${PROJECT_DESIGNER_TOKEN}",
    );
  });
});
