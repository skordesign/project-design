import { describe, expect, it } from "vitest";

import { allowedEdgeKinds } from "@/lib/design/catalog";
import { addGameSystem } from "@/lib/design/edits";
import { GAME_SYSTEM_TEMPLATES, getGameSystemTemplate } from "@/lib/design/game-systems";
import { safeParseDesign } from "@/lib/design/integrity";
import { levelView } from "@/lib/design/levels";
import { emptyDesign } from "@/lib/design/schema";
import { validateDesign } from "@/lib/design/validate";

describe("built-in game systems", () => {
  it("has unique ids", () => {
    const ids = GAME_SYSTEM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(GAME_SYSTEM_TEMPLATES.map((t) => [t.id]))("%s links only its own parts", (id) => {
    const t = getGameSystemTemplate(id)!;
    const kinds = new Map(t.parts.map((p) => [p.key, p.kind]));
    expect(kinds.size).toBe(t.parts.length);
    for (const key of t.ring ?? []) expect(kinds.has(key)).toBe(true);
    for (const link of t.links) {
      const from = kinds.get(link.from);
      const to = kinds.get(link.to);
      expect(from && to, `${link.from} → ${link.to}`).toBeTruthy();
      expect(allowedEdgeKinds(from!, to!)).toContain(link.kind);
    }
  });

  it.each(GAME_SYSTEM_TEMPLATES.map((t) => [t.id]))("%s adds a valid system", (id) => {
    const doc = {
      ...emptyDesign(),
      overview: { ...emptyDesign().overview, mode: "game" as const },
    };
    const { document, systemId, added } = addGameSystem(doc, id);
    const check = safeParseDesign(document);
    expect(check.ok ? [] : check.issues).toEqual([]);
    const system = document.nodes.find((n) => n.id === systemId)!;
    expect(system.kind).toBe("system");
    const children = document.nodes.filter((n) => n.parentId === systemId);
    expect(children.length).toBe(added.mechanics + added.resources + added.content);
    expect(document.edges.length).toBe(added.links);
    // Every part fits inside the system's frame.
    for (const c of children) {
      expect(c.position.x + 208).toBeLessThanOrEqual(system.size!.width);
      expect(c.position.y + 54).toBeLessThanOrEqual(system.size!.height);
    }
    expect(validateDesign(document).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("places a second system beside the first and ignores unknown templates", () => {
    const once = addGameSystem(emptyDesign(), "combat").document;
    const twice = addGameSystem(once, "loot");
    const [a, b] = twice.document.nodes.filter((n) => n.kind === "system");
    expect(b!.position.x).toBeGreaterThan(a!.position.x);
    expect(addGameSystem(once, "nope")).toMatchObject({ document: once, systemId: null });
  });

  it("standalone shows one system without the systems linked to it", () => {
    const first = addGameSystem(emptyDesign(), "elementals");
    const second = addGameSystem(first.document, "status-effects");
    const fire = second.document.nodes.find(
      (n) => n.parentId === first.systemId && n.name === "Fire",
    )!;
    const tick = second.document.nodes.find(
      (n) => n.parentId === second.systemId && n.name === "Tick & Expire",
    )!;
    const doc = {
      ...second.document,
      edges: [
        ...second.document.edges,
        {
          id: "e_burn",
          kind: "triggers" as const,
          source: fire.id,
          target: tick.id,
          label: "",
          description: "",
          data: { event: "Burning applied" },
        },
      ],
    };

    const linked = levelView(doc, first.systemId);
    expect(linked.context.map((c) => c.node.id)).toEqual([second.systemId]);
    expect(linked.edges.some((e) => e.target === second.systemId)).toBe(true);

    const alone = levelView(doc, first.systemId, { standalone: true });
    expect(alone.context).toEqual([]);
    expect(alone.inside.map((i) => i.node.id)).toEqual(linked.inside.map((i) => i.node.id));
    expect(alone.edges.map((e) => e.id).sort()).toEqual(
      first.document.edges.map((e) => e.id).sort(),
    );
  });
});
