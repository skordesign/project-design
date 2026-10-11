import { describe, expect, it } from "vitest";

import type { BuildStep } from "@/lib/design/build-plan";
import {
  evaluateCompliance,
  renderComplianceMarkdown,
  type StatusDetail,
} from "@/lib/design/compliance";

const NOW = new Date("2026-10-11T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const step = (id: string, status: BuildStep["status"]): BuildStep => ({
  order: 1,
  id,
  kind: "module",
  title: `Implement ${id}`,
  path: `Service › ${id}`,
  dependsOn: ["setup"],
  status,
  instruction: `Implement ${id}. Details: get_component("${id}").`,
});

const detail = (status: StatusDetail["status"], updatedAt: Date, note = ""): StatusDetail => ({
  status,
  note,
  updatedAt,
});

describe("evaluateCompliance", () => {
  it("counts totals and percent done, excluding the setup step", () => {
    const report = evaluateCompliance(
      {
        steps: [
          { ...step("setup", null), id: "setup", kind: "setup" },
          step("a", "done"),
          step("b", "in_progress"),
          step("c", "todo"),
          step("d", null),
        ],
        details: new Map([
          ["a", detail("done", hoursAgo(1))],
          ["b", detail("in_progress", hoursAgo(1))],
          ["c", detail("todo", hoursAgo(1))],
        ]),
        now: NOW,
      },
      {},
    );
    expect(report.totalSteps).toBe(4);
    expect(report.totals).toMatchObject({ done: 1, in_progress: 1, todo: 1, unreported: 1 });
    expect(report.percentDone).toBe(25);
    expect(report.gate.pass).toBe(true);
    expect(report.blocked).toEqual([]);
    expect(report.stale).toEqual([]);
  });

  it("an empty design is 100% done", () => {
    const report = evaluateCompliance({ steps: [], now: NOW }, { minDonePercent: 100 });
    expect(report.percentDone).toBe(100);
    expect(report.gate.pass).toBe(true);
  });

  it("fails the gate on blocked steps only when asked", () => {
    const input = {
      steps: [step("a", "blocked")],
      details: new Map([["a", detail("blocked", hoursAgo(1), "waiting on API")]]),
      now: NOW,
    };
    expect(evaluateCompliance(input, {}).gate.pass).toBe(true);
    const gated = evaluateCompliance(input, { failOnBlocked: true });
    expect(gated.gate.pass).toBe(false);
    expect(gated.gate.reasons.join(" ")).toContain('1 blocked step(s): "Implement a" [a]');
    expect(gated.blocked).toHaveLength(1);
    expect(gated.blocked[0]).toMatchObject({ id: "a", note: "waiting on API", stale: false });
  });

  it("flags in_progress steps untouched beyond the stale window", () => {
    const input = {
      steps: [step("a", "in_progress"), step("b", "in_progress")],
      details: new Map([
        ["a", detail("in_progress", hoursAgo(30))],
        ["b", detail("in_progress", hoursAgo(1))],
      ]),
      now: NOW,
    };
    const report = evaluateCompliance(input, { staleHours: 24 });
    expect(report.stale.map((s) => s.id)).toEqual(["a"]);
    expect(report.gate.pass).toBe(true);
    expect(evaluateCompliance(input, { staleHours: 24, failOnStale: true }).gate.pass).toBe(false);
  });

  it("fails the gate below minDonePercent and on integrity errors", () => {
    const steps = [step("a", "done"), step("b", "todo"), step("c", "todo"), step("d", "todo")];
    const low = evaluateCompliance({ steps, now: NOW }, { minDonePercent: 100 });
    expect(low.percentDone).toBe(25);
    expect(low.gate.pass).toBe(false);
    expect(low.gate.reasons.join(" ")).toContain("25% done is below the required 100%");

    const broken = evaluateCompliance(
      { steps, issues: [{ severity: "error", code: "x", message: "bad" }], now: NOW },
      {},
    );
    expect(broken.gate.pass).toBe(false);
    expect(broken.validation).toMatchObject({ errors: 1, warnings: 0 });
  });

  it("renders a one-screen markdown summary", () => {
    const report = evaluateCompliance(
      {
        steps: [step("a", "done"), step("b", "blocked")],
        details: new Map([
          ["a", detail("done", hoursAgo(1))],
          ["b", detail("blocked", hoursAgo(2), "needs decision")],
        ]),
        now: NOW,
      },
      { failOnBlocked: true },
    );
    const md = renderComplianceMarkdown({ name: "Demo", slug: "demo" }, "draft", report);
    expect(md).toContain("**50%** done");
    expect(md).toContain("**FAIL**");
    expect(md).toContain("BLOCKED [b]");
    expect(md).toContain("needs decision");
  });
});
