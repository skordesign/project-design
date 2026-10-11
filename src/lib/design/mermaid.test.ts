import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { parseDesign } from "@/lib/design/integrity";
import { toDiagramCode, toMermaidArchitecture, toMermaidSequence } from "@/lib/design/mermaid";

const doc = parseDesign(teamTasksDesign);

describe("toMermaidArchitecture", () => {
  it("generates valid Mermaid flowchart syntax", () => {
    const mmd = toMermaidArchitecture(doc);
    expect(mmd).toContain("flowchart LR");
    expect(mmd).toContain("subgraph svc_api");
    expect(mmd).toContain("subgraph lyr_http");
    expect(mmd).toContain("mod_routes");
    expect(mmd).toContain("subgraph dst_pg");
    expect(mmd).toContain("act_member([");
    expect(mmd).toContain("que_events{{");
    expect(mmd).toContain("--|calls · http|--> api_rest");
  });

  it("supports TD direction option", () => {
    const mmd = toMermaidArchitecture(doc, { direction: "TD" });
    expect(mmd.startsWith("flowchart TD")).toBe(true);
  });
});

describe("toMermaidSequence", () => {
  it("generates valid Mermaid sequenceDiagram with participants and call arrows", () => {
    const seq = toMermaidSequence(doc);
    expect(seq.startsWith("sequenceDiagram")).toBe(true);
    expect(seq).toContain("autonumber");
    expect(seq).toContain("participant");
    expect(seq).toContain("->>");
  });
});

describe("toDiagramCode", () => {
  const project = { name: "Team Tasks", slug: "team-tasks" };

  it("prepends an AI regeneration header without changing the diagram body", () => {
    const code = toDiagramCode(project, doc);
    expect(code).toContain("%% Team Tasks — architecture diagram as code");
    expect(code).toContain("`team-tasks`");
    expect(code).toContain("get_design_schema");
    expect(code.slice(code.indexOf("flowchart"))).toBe(toMermaidArchitecture(doc));
  });

  it("is deterministic and supports sequence and er types", () => {
    expect(toDiagramCode(project, doc)).toBe(toDiagramCode(project, doc));
    const seq = toDiagramCode(project, doc, { type: "sequence" });
    expect(seq).toContain("sequenceDiagram");
    const er = toDiagramCode(project, doc, { type: "er" });
    expect(er).toContain("erDiagram");
  });
});
