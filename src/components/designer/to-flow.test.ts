import { describe, expect, it } from "vitest";

import { keepMeasured, toFlowEdges, toFlowNodes, Z } from "@/components/designer/to-flow";
import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { parseDesign } from "@/lib/design/integrity";
import { levelView } from "@/lib/design/levels";

const doc = parseDesign(teamTasksDesign);

describe("toFlowNodes", () => {
  const nodes = toFlowNodes(doc, { svc_api: { status: "done", note: "" } }, new Set(["mod_repo"]));

  it("keeps parents before children and uses the kind as node type", () => {
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    for (const n of nodes) {
      if (n.parentId) expect(index.get(n.parentId)!).toBeLessThan(index.get(n.id)!);
    }
    expect(nodes.find((n) => n.id === "svc_api")?.type).toBe("service");
  });

  it("sizes containers only, with positions relative to the parent", () => {
    const api = nodes.find((n) => n.id === "svc_api")!;
    expect([api.width, api.height, api.zIndex]).toEqual([520, 520, 0]);
    const routes = nodes.find((n) => n.id === "mod_routes")!;
    expect(routes.width).toBeUndefined();
    expect(routes.parentId).toBe("lyr_http");
    expect(routes.position).toEqual({ x: 20, y: 20 });
    expect(routes.zIndex).toBe(Z.card);
  });

  it("stacks containers by depth, then edges, then cards", () => {
    const z = (id: string) => nodes.find((n) => n.id === id)!.zIndex!;
    expect([z("svc_api"), z("lyr_http")]).toEqual([0, 1]);
    expect(z("lyr_http")).toBeLessThan(Z.edge);
    expect(toFlowEdges(doc, new Set()).every((e) => e.zIndex === Z.edge)).toBe(true);
    expect(Z.edge).toBeLessThan(Z.label);
    expect(Z.label).toBeLessThan(z("mod_routes"));
    expect(z("mod_repo")).toBe(Z.selectedCard);
  });

  it("marks the selection and attaches statuses", () => {
    expect(nodes.filter((n) => n.selected).map((n) => n.id)).toEqual(["mod_repo"]);
    expect(nodes.find((n) => n.id === "svc_api")?.data.status?.status).toBe("done");
    expect(nodes.find((n) => n.id === "svc_web")?.data.status).toBeNull();
  });

  it("never constrains dragging to the parent", () => {
    expect(nodes.every((n) => n.extent === undefined)).toBe(true);
  });

  it("keepMeasured carries measured sizes over", () => {
    const previous = nodes.map((n) => ({ ...n, measured: { width: 10, height: 20 } }));
    const rebuilt = keepMeasured(toFlowNodes(doc, {}, new Set()), previous);
    expect(rebuilt.every((n) => n.measured?.width === 10)).toBe(true);
    expect(keepMeasured(toFlowNodes(doc, {}, new Set()), []).every((n) => !n.measured)).toBe(true);
  });
});

describe("toFlowEdges", () => {
  it("maps every edge to the design edge type", () => {
    const edges = toFlowEdges(doc, new Set(["e_web_api"]));
    expect(edges).toHaveLength(doc.edges.length);
    expect(edges.every((e) => e.type === "design")).toBe(true);
    expect(edges.find((e) => e.id === "e_web_api")?.selected).toBe(true);
    expect(edges.find((e) => e.id === "e_web_api")?.data?.edge.kind).toBe("calls");
  });

  it("captions edges with the detail of their kind", () => {
    const caption = (id: string) =>
      toFlowEdges(doc, new Set()).find((e) => e.id === id)?.data?.caption;
    expect(caption("e_web_api")).toBe("calls · http");
    expect(caption("e_repo_db")).toBe("accesses · read-write");
    expect(caption("e_project_tasks")).toBe("1—N");
    expect(caption("e_repo_pub")).toBe("publishes · task.assigned");
    expect(caption("e_http_app")).toBe("depends on");
  });

  it("animates messaging edges only", () => {
    const animated = toFlowEdges(doc, new Set())
      .filter((e) => e.animated)
      .map((e) => e.id);
    expect(animated.sort()).toEqual(["e_notifier_sub", "e_repo_pub"]);
  });
});

describe("levels view", () => {
  it("maps collapsed containers and context nodes to summary cards", () => {
    const project = toFlowNodes(doc, {}, new Set(), levelView(doc, null));
    const api = project.find((n) => n.id === "svc_api")!;
    expect([api.type, api.data.collapsed, api.width]).toEqual(["summary", 4, undefined]);
    expect(project.some((n) => n.id === "lyr_http")).toBe(false);

    const service = toFlowNodes(doc, {}, new Set(), levelView(doc, "svc_api"));
    const http = service.find((n) => n.id === "lyr_http")!;
    expect([http.type, http.parentId]).toEqual(["layer", undefined]);
    const db = service.find((n) => n.id === "dst_pg")!;
    expect([db.type, db.draggable, db.deletable, db.data.context]).toEqual([
      "summary",
      false,
      false,
      "Main database",
    ]);
  });

  it("marks lifted edges read-only and leaves real ones alone", () => {
    const edges = toFlowEdges(doc, new Set(), levelView(doc, null));
    const lifted = edges.find((e) => e.id === "lift:accesses:svc_api:dst_pg")!;
    expect([lifted.selectable, lifted.deletable, lifted.data?.lifted]).toEqual([false, false, 1]);
    const real = edges.find((e) => e.id === "e_api_exposes")!;
    expect([real.selectable, real.data?.lifted]).toEqual([undefined, undefined]);
  });

  it("without a view the output is unchanged", () => {
    expect(toFlowNodes(doc, {}, new Set(), undefined)).toEqual(toFlowNodes(doc, {}, new Set()));
  });
});

describe("collapseDatastores option", () => {
  it("collapses datastores with entities into summary nodes and hides internal entities", () => {
    const uncollapsed = toFlowNodes(doc, {}, new Set());
    const collapsed = toFlowNodes(doc, {}, new Set(), undefined, { collapseDatastores: true });

    // In teamTasksDesign, dst_pg contains entities (e.g., ent_tasks, ent_projects)
    const pg = collapsed.find((n) => n.id === "dst_pg")!;
    expect(pg.type).toBe("summary");
    expect(pg.data.collapsed).toBeGreaterThan(0);

    // Entity nodes inside the collapsed datastore should be omitted
    const entitiesInPg = collapsed.filter((n) => n.parentId === "dst_pg");
    expect(entitiesInPg).toHaveLength(0);

    // Uncollapsed version keeps dst_pg as datastore with child entities
    const uncollapsedPg = uncollapsed.find((n) => n.id === "dst_pg")!;
    expect(uncollapsedPg.type).toBe("datastore");
    expect(uncollapsed.filter((n) => n.parentId === "dst_pg").length).toBeGreaterThan(0);
  });

  it("lifts edges targeting entities to the datastore itself", () => {
    const edges = toFlowEdges(doc, new Set(), undefined, { collapseDatastores: true });
    // An edge accessing an entity inside dst_pg should be lifted to dst_pg
    const dbEdge = edges.find((e) => e.target === "dst_pg");
    expect(dbEdge).toBeDefined();
  });
});
