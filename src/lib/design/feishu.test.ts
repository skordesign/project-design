import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { toFeishuCard } from "@/lib/design/feishu";
import { parseDesign } from "@/lib/design/integrity";

const doc = parseDesign(teamTasksDesign);

describe("toFeishuCard", () => {
  it("generates valid Feishu interactive card payload", () => {
    const card = toFeishuCard(doc, {
      projectUrl: "https://example.com/project",
      releaseTag: "v1.0",
    });
    expect(card.msg_type).toBe("interactive");
    expect(card.card.header.title.content).toContain("[v1.0]");
    expect(card.card.header.template).toBe("blue");
    expect(card.card.elements.length).toBeGreaterThan(0);
  });
});
