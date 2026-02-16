import { describe, expect, it } from "vitest";
import type { PrometheusEvent } from "../events.js";
import { replayPrometheusEvents } from "../state.js";
import { runDeterministicSynthesisWorkflow } from "./pipeline.js";

describe("runDeterministicSynthesisWorkflow", () => {
  it("generates event batches that replay into integrated capability state", () => {
    const gapEvent: PrometheusEvent = {
      id: "evt-gap",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-root",
        title: "Root objective",
        objective: "ship capability",
      },
    };
    const detectedGap: PrometheusEvent = {
      id: "evt-gap-detected",
      type: "capability-gap.detected",
      occurredAt: 2,
      payload: {
        gapId: "gap-1",
        goalId: "goal-root",
        description: "missing planner",
        severity: "high",
      },
    };
    const synthesis = runDeterministicSynthesisWorkflow({
      workflowId: "wf-1",
      gapId: "gap-1",
      capabilityId: "cap-1",
      capabilityName: "planner",
      proposalSummary: "propose planner capability",
      designSpec: "planner design",
      validationPassed: true,
      validationReport: "validated",
      integrationDecision: "integrate",
      integrationReason: "approved",
      startAt: 10,
      actorAgentId: "agent-main",
    });

    expect(synthesis.events.map((event) => event.type)).toEqual([
      "capability-synthesized.recorded",
      "capability-synthesized.status-updated",
      "capability-synthesized.status-updated",
    ]);

    const state = replayPrometheusEvents([gapEvent, detectedGap, ...synthesis.events]);
    expect(state.synthesizedCapabilities["cap-1"]?.status).toBe("integrated");
    expect(state.synthesizedCapabilities["cap-1"]?.gapId).toBe("gap-1");
  });
});
