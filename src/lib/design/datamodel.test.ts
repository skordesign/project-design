import { describe, expect, it } from "vitest";

import { dataModel, toMermaidEr, toSqlDdl } from "@/lib/design/datamodel";
import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { indexDesign } from "@/lib/design/graph";
import { parseDesign } from "@/lib/design/integrity";

const index = () => indexDesign(parseDesign(teamTasksDesign));

describe("dataModel", () => {
  it("lists datastores with their entities and the relations between them", () => {
    const model = dataModel(index());
    expect(model.datastores).toHaveLength(1);
    expect(model.datastores[0]!.entities.map((e) => e.name)).toEqual(["User", "Project", "Task"]);
    expect(model.domainModels).toEqual([]);
    expect(model.relations.map((r) => [r.from.name, r.to.name, r.foreignKey])).toEqual([
      ["Project", "Task", "projectId"],
      ["User", "Task", "assigneeId"],
    ]);
  });

  it("filters by datastore", () => {
    expect(dataModel(index(), "dst_pg").datastores).toHaveLength(1);
    expect(dataModel(index(), "other").datastores).toHaveLength(0);
  });

  it("separates domain entities from stored ones", () => {
    const doc = parseDesign(teamTasksDesign);
    doc.nodes.push({
      id: "ent_dto",
      kind: "entity",
      name: "Dto",
      description: "",
      parentId: "lyr_domain",
      position: { x: 0, y: 0 },
      size: null,
      tags: [],
      patterns: [],
      data: { fields: [], indexes: [] },
    });
    expect(dataModel(indexDesign(doc)).domainModels.map((e) => e.name)).toEqual(["Dto"]);
  });

  it("renders a Mermaid ER diagram", async () => {
    const text = toMermaidEr(dataModel(index()));
    await expect(text).toMatchFileSnapshot("./__fixtures__/team-tasks.er.mmd");
  });

  it("renders standard SQL DDL with tables, columns and foreign keys", () => {
    const ddl = toSqlDdl(dataModel(index()));
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS "user"');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS "project"');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS "task"');
    expect(ddl).toContain("FOREIGN KEY");
    expect(ddl).toContain("REFERENCES");
  });
});
