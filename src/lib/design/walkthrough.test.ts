import { describe, expect, it } from "vitest";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { parseDesign } from "@/lib/design/integrity";
import { computeFlowWalkthrough } from "@/lib/design/walkthrough";

const doc = parseDesign(teamTasksDesign);

describe("computeFlowWalkthrough", () => {
  it("computes ordered progression starting with root actors or services", () => {
    const steps = computeFlowWalkthrough(doc);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]!.nodeKind).toBe("actor");
    expect(steps[0]!.nodeName).toBe("Team member");
  });

  it("includes transition edge descriptions and next targets", () => {
    const steps = computeFlowWalkthrough(doc);
    const stepWithEdge = steps.find((s) => s.edgeLabel !== undefined);
    expect(stepWithEdge).toBeDefined();
    expect(stepWithEdge?.nextTargetName).toBeDefined();
  });

  it("includes rich explanations, descriptions, and transition metadata", () => {
    const steps = computeFlowWalkthrough(doc);
    expect(steps.length).toBeGreaterThan(0);
    // Every step must have a non-empty human-readable explanation
    for (const step of steps) {
      expect(step.description).toBeTruthy();
      expect(typeof step.description).toBe("string");
      expect(step.description.length).toBeGreaterThan(0);
      expect(Array.isArray(step.tags)).toBe(true);
      expect(Array.isArray(step.incomingTransitions)).toBe(true);
      expect(Array.isArray(step.outgoingTransitions)).toBe(true);
    }
  });

  it("filters by tag when specified", () => {
    // Add tag to two nodes
    const taggedDoc = structuredClone(doc);
    taggedDoc.nodes[0]!.tags = ["auth"];
    taggedDoc.nodes[1]!.tags = ["auth"];

    const steps = computeFlowWalkthrough(taggedDoc, "auth");
    expect(steps.length).toBe(2);
    expect(steps.map((s) => s.nodeId)).toContain(taggedDoc.nodes[0]!.id);
    expect(steps.map((s) => s.nodeId)).toContain(taggedDoc.nodes[1]!.id);
  });
});
