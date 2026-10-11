import { describe, expect, it } from "vitest";

import { fullstackDesign, microservicesDesign } from "@/lib/design/examples/archetypes";
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

  it("parses fullstack and microservices archetypes without integrity issues", () => {
    const fs = parseDesign(fullstackDesign);
    expect(checkIntegrity(fs)).toEqual([]);
    expect(fs.nodes).toHaveLength(4);

    const ms = parseDesign(microservicesDesign);
    expect(checkIntegrity(ms)).toEqual([]);
    expect(ms.nodes).toHaveLength(6);
  });
});
