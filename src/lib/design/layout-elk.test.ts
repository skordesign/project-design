import { describe, expect, it } from "vitest";

import { NODE_KIND_META } from "@/lib/design/catalog";
import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { nodeSize, summarySize, type Rect } from "@/lib/design/geometry";
import { parseDesign } from "@/lib/design/integrity";
import { arrangeLayoutElk, elkPositions, needsAutoLayout } from "@/lib/design/layout-elk";
import type { DesignDocument } from "@/lib/design/schema";

const doc = () => parseDesign(teamTasksDesign);

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Sibling rects (relative to their parent) that overlap, as "a/b" pairs. */
function collisions(d: DesignDocument, collapsed = false): string[] {
  const out: string[] = [];
  const rect = (id: string): Rect => {
    const n = d.nodes.find((x) => x.id === id)!;
    const size = collapsed && NODE_KIND_META[n.kind].container ? summarySize() : nodeSize(n);
    return { ...n.position, ...size };
  };
  for (const a of d.nodes)
    for (const b of d.nodes)
      if (a.id < b.id && a.parentId === b.parentId && (!collapsed || a.parentId === null))
        if (overlaps(rect(a.id), rect(b.id))) out.push(`${a.id}/${b.id}`);
  return out;
}

describe("elkPositions", () => {
  const box = (id: string) => ({ id, width: 200, height: 50 });

  it("puts sources left of targets along the flow", async () => {
    const p = await elkPositions(
      [box("a"), box("b"), box("c")],
      [
        ["a", "b"],
        ["a", "c"],
      ],
    );
    expect(p.get("a")!.x).toBeLessThan(p.get("b")!.x);
    expect(p.get("c")!.x).toBe(p.get("b")!.x);
    expect(p.get("c")!.y).toBeGreaterThan(p.get("b")!.y);
  });

  it("survives cycles and duplicate links without overlap", async () => {
    const p = await elkPositions(
      [box("a"), box("b"), box("c")],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "a"],
        ["a", "b"],
      ],
    );
    const rects = ["a", "b", "c"].map((id) => ({ ...p.get(id)!, width: 200, height: 50 }));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
  });

  it("is deterministic for the same input", async () => {
    const boxes = [box("a"), box("b"), box("c")];
    const links: [string, string][] = [
      ["a", "b"],
      ["b", "c"],
    ];
    const first = await elkPositions(boxes, links);
    const second = await elkPositions(boxes, links);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });
});

describe("arrangeLayoutElk", () => {
  it("lays out the whole design with no overlapping siblings", async () => {
    const before = doc();
    const after = await arrangeLayoutElk(before, null);
    expect(collisions(after)).toEqual([]);
    expect(parseDesign(after)).toEqual(after);
    for (const c of after.nodes.filter((n) => NODE_KIND_META[n.kind].container)) {
      for (const k of after.nodes.filter((n) => n.parentId === c.id)) {
        expect(k.position.x + nodeSize(k).width).toBeLessThanOrEqual(nodeSize(c).width);
        expect(k.position.y + nodeSize(k).height).toBeLessThanOrEqual(nodeSize(c).height);
      }
    }
  });

  it("orders the top level along the flow (sources left of targets)", async () => {
    const after = await arrangeLayoutElk(doc(), null);
    const x = (id: string) => after.nodes.find((n) => n.id === id)!.position.x;
    // Actor calls the web UI, the web UI and the API service hit the REST API.
    expect(x("act_member")).toBeLessThan(x("svc_web"));
    expect(x("svc_web")).toBeLessThan(x("api_rest"));
    expect(x("svc_api")).toBeLessThan(x("api_rest"));
    // The API service reaches its datastore and its queue.
    expect(x("svc_api")).toBeLessThan(x("dst_pg"));
    expect(x("svc_api")).toBeLessThan(x("que_events"));
    // Events flow queue -> notifier -> email integration.
    expect(x("que_events")).toBeLessThan(x("svc_notifier"));
    expect(x("svc_notifier")).toBeLessThan(x("int_email"));
  });

  it("unrolls a single row of top-level components into several rows", async () => {
    const base = doc();
    let x = 0;
    const row = {
      ...base,
      nodes: base.nodes.map((n) => {
        if (n.parentId !== null) return n;
        const moved = { ...n, position: { x, y: 0 } };
        x += nodeSize(n).width + 40;
        return moved;
      }),
    };
    const after = await arrangeLayoutElk(row, null, { collapsed: true });
    expect(collisions(after, true)).toEqual([]);
    const top = after.nodes.filter((n) => n.parentId === null);
    expect(new Set(top.map((n) => n.position.y)).size).toBeGreaterThan(1);
  });

  it("arranges with DOWN direction placing sources above targets", async () => {
    const after = await arrangeLayoutElk(doc(), null, { direction: "DOWN" });
    expect(collisions(after)).toEqual([]);
    const y = (id: string) => after.nodes.find((n) => n.id === id)!.position.y;
    // Actor calls web UI, web UI calls API
    expect(y("act_member")).toBeLessThan(y("svc_web"));
    expect(y("svc_web")).toBeLessThan(y("api_rest"));
    // API service reaches queue and notifier
    expect(y("que_events")).toBeLessThan(y("svc_notifier"));
    expect(y("svc_notifier")).toBeLessThan(y("int_email"));
  });

  it("pins actor nodes to the first layer constraint", async () => {
    const after = await arrangeLayoutElk(doc(), null);
    const actorX = after.nodes.find((n) => n.kind === "actor")!.position.x;
    // Actor is at the leftmost column
    for (const n of after.nodes.filter((x) => x.parentId === null && x.kind !== "note")) {
      expect(actorX).toBeLessThanOrEqual(n.position.x);
    }
  });
});

describe("needsAutoLayout", () => {
  it("is false for the arranged example and for empty designs", async () => {
    expect(needsAutoLayout(doc())).toBe(false);
    expect(needsAutoLayout({ ...doc(), nodes: [] })).toBe(false);
  });

  it("is true when siblings overlap", async () => {
    const base = doc();
    const first = base.nodes.find((n) => n.parentId === null)!;
    const second = base.nodes.filter((n) => n.parentId === null)[1]!;
    const messy = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === second.id ? { ...n, position: first.position } : n)),
    };
    expect(needsAutoLayout(messy)).toBe(true);
  });

  it("is true for a single-row agent-built top level", async () => {
    const base = doc();
    let x = 0;
    const row = {
      ...base,
      nodes: base.nodes.map((n) => {
        if (n.parentId !== null) return n;
        const moved = { ...n, position: { x, y: 0 } };
        x += nodeSize(n).width + 40;
        return moved;
      }),
    };
    expect(needsAutoLayout(row)).toBe(true);
  });
});
