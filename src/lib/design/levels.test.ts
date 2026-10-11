import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { parseDesign } from "@/lib/design/integrity";
import { breadcrumb, endpointsOf, levelOf, levelView } from "@/lib/design/levels";

const doc = parseDesign(teamTasksDesign);
const ids = (xs: { node: { id: string } }[]) => xs.map((x) => x.node.id).sort();
const edgeKeys = (view: ReturnType<typeof levelView>) =>
  view.edges
    .map((e) => `${e.kind}:${e.source}>${e.target}${e.lifted ? `×${e.lifted}` : ""}`)
    .sort();

describe("levelView at project level", () => {
  const view = levelView(doc, null);

  it("shows top-level nodes only, with containers collapsed", () => {
    expect(ids(view.inside)).toEqual(
      doc.nodes
        .filter((n) => n.parentId === null)
        .map((n) => n.id)
        .sort(),
    );
    expect(view.inside.find((i) => i.node.id === "svc_api")?.collapsed).toBe(4);
    expect(view.inside.find((i) => i.node.id === "dst_pg")?.collapsed).toBe(3);
    expect(view.inside.find((i) => i.node.id === "api_rest")?.collapsed).toBeNull();
    expect(view.context).toEqual([]);
  });

  it("lifts edges from nested nodes to their top-level ancestor", () => {
    const keys = edgeKeys(view);
    expect(keys).toContain("accesses:svc_api>dst_pg×1");
    expect(keys).toContain("publishes:svc_api>que_events×1");
    expect(keys).toContain("calls:svc_web>api_rest×1");
    // Real edges between top-level nodes stay real.
    expect(keys).toContain("exposes:svc_api>api_rest");
    // Edges inside one container collapse away.
    expect(keys.some((k) => k.startsWith("depends_on"))).toBe(false);
    expect(keys.some((k) => k.startsWith("relation"))).toBe(false);
    expect(view.edges.find((e) => e.kind === "accesses")?.id).toBe("lift:accesses:svc_api:dst_pg");
  });
});

describe("levelView inside a container", () => {
  it("re-roots a service's subtree and shows what it talks to as context", () => {
    const view = levelView(doc, "svc_api");
    expect(view.inside).toHaveLength(8);
    const http = view.inside.find((i) => i.node.id === "lyr_http")!;
    expect(http.parentId).toBeNull();
    expect(view.inside.find((i) => i.node.id === "mod_routes")?.parentId).toBe("lyr_http");
    expect(view.origin).toEqual(doc.nodes.find((n) => n.id === "svc_api")!.position);
    expect(ids(view.context)).toEqual(["dst_pg", "que_events"]);
    expect(view.context.every((c) => c.position.x === 520 + 160)).toBe(true);
    // The service's own exposes edge has no endpoint in this view.
    expect(view.edges.some((e) => e.id === "e_api_exposes")).toBe(false);
    expect(edgeKeys(view)).toContain("accesses:mod_repo>dst_pg");
  });

  it("lifts sibling layers' nodes to the sibling layer", () => {
    const view = levelView(doc, "lyr_http");
    expect(ids(view.inside)).toEqual(["mod_routes"]);
    expect(ids(view.context)).toEqual(["lyr_app"]);
    expect(edgeKeys(view)).toEqual(["depends_on:mod_routes>lyr_app×1"]);
    expect(view.context[0]!.path).toBe("API › Application");
  });

  it("falls back to the project for an unknown or leaf focus", () => {
    expect(levelView(doc, "nope").focus).toBeNull();
    expect(levelView(doc, "api_rest").focus).toBeNull();
  });
});

describe("levelView on a module", () => {
  it("shows the module and its direct neighbours", () => {
    const view = levelView(doc, "mod_repo");
    expect(ids(view.inside)).toEqual(["mod_repo"]);
    expect(ids(view.context)).toEqual(["dst_pg", "mod_domain", "que_events"].sort());
    expect(view.edges.every((e) => e.lifted === 0)).toBe(true);
  });

  it("includes notes nested inside the module", () => {
    const docWithNote = parseDesign({
      ...doc,
      nodes: [
        ...doc.nodes,
        {
          id: "not_repo",
          kind: "note",
          name: "Repo Notes",
          parentId: "mod_repo",
          position: { x: 20, y: 80 },
          description: "Implementation details",
          data: { text: "Use connection pool" },
        },
      ],
    });
    const view = levelView(docWithNote, "mod_repo");
    expect(ids(view.inside)).toEqual(["mod_repo", "not_repo"].sort());
    // Centred against 3 neighbours: module and note move down together.
    const byId = new Map(view.inside.map((i) => [i.node.id, i.position]));
    expect(byId.get("mod_repo")).toEqual({ x: 0, y: 120 });
    expect(byId.get("not_repo")).toEqual({ x: 20, y: 200 });
  });
});

describe("helpers", () => {
  it("levelOf finds the top-level container that shows a node", () => {
    expect(levelOf(doc, "mod_routes")).toBe("svc_api");
    expect(levelOf(doc, "ent_task")).toBe("dst_pg");
    expect(levelOf(doc, "api_rest")).toBeNull();
  });

  it("breadcrumb runs from the top down to the focus", () => {
    expect(breadcrumb(doc, "mod_routes").map((n) => n.id)).toEqual([
      "svc_api",
      "lyr_http",
      "mod_routes",
    ]);
    expect(breadcrumb(doc, null)).toEqual([]);
  });

  it("endpointsOf lists exposed operations, honouring a subset", () => {
    expect(endpointsOf(doc, "svc_api").implements[0]).toMatchObject({ whole: true });
    expect(endpointsOf(doc, "svc_api").implements[0]!.operations).toHaveLength(3);

    const subset = parseDesign({
      ...teamTasksDesign,
      edges: [
        ...teamTasksDesign.edges!,
        {
          id: "e_routes_exposes",
          kind: "exposes",
          source: "mod_routes",
          target: "api_rest",
          data: { operations: ["op_list"] },
        },
      ],
    });
    const routes = endpointsOf(subset, "mod_routes");
    expect(routes.implements).toHaveLength(1);
    expect(routes.implements[0]!.whole).toBe(false);
    expect(routes.implements[0]!.operations.map((o) => o.id)).toEqual(["op_list"]);
    expect(endpointsOf(doc, "mod_web_tasks").calls[0]!.operations).toHaveLength(3);
  });
});
