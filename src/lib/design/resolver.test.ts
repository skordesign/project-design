import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { indexDesign } from "@/lib/design/graph";
import { parseDesign } from "@/lib/design/integrity";
import { resolveFileToComponent } from "@/lib/design/resolver";

const doc = parseDesign(teamTasksDesign);
const index = indexDesign(doc);

describe("resolveFileToComponent", () => {
  it("resolves exact layer path", () => {
    const res = resolveFileToComponent(index, "apps/api/src/domain/task.ts");
    expect(res.matched).toBe(true);
    if (!res.matched) return;
    expect(res.component.id).toBe("lyr_domain");
    expect(res.component.name).toBe("Domain");
    expect(res.service?.id).toBe("svc_api");
    expect(res.layerRules).toContain("No framework or database imports");
    expect(res.stack.map((s) => s.id)).toContain("stk_lang");
  });

  it("resolves specific module path within web service", () => {
    const res = resolveFileToComponent(index, "apps/web/src/features/tasks/TaskList.tsx");
    expect(res.matched).toBe(true);
    if (!res.matched) return;
    expect(res.component.id).toBe("mod_web_tasks");
    expect(res.component.kind).toBe("module");
    expect(res.service?.id).toBe("svc_web");
  });

  it("handles relative path with leading ./ and backslashes", () => {
    const res = resolveFileToComponent(index, ".\\apps\\api\\src\\http\\routes.ts");
    expect(res.matched).toBe(true);
    if (!res.matched) return;
    expect(res.component.id).toBe("lyr_http");
  });

  it("returns matched: false with available components for unrecognized path", () => {
    const res = resolveFileToComponent(index, "unknown/directory/foo.ts");
    expect(res.matched).toBe(false);
    if (res.matched) return;
    expect(res.availableComponents.length).toBeGreaterThan(0);
    expect(res.message).toContain("No architectural component matched");
  });
});
