import { describe, expect, it } from "vitest";
import {
  advanceSynthesisWorkflow,
  buildSynthesisWorkflowEvents,
  createSynthesisWorkflow,
} from "./workflow.js";

describe("AUTARCH synthesis workflow", () => {
  it("enforces proposal->design->validation->integration transitions", () => {
    const created = createSynthesisWorkflow({
      workflowId: "wf-1",
      gapId: "gap-1",
      createdAt: 1,
    });

    const proposed = advanceSynthesisWorkflow(created, {
      type: "proposal.accepted",
      at: 2,
      capabilityId: "cap-1",
      capabilityName: "planner",
      summary: "propose planner capability",
    });
    const designed = advanceSynthesisWorkflow(proposed, {
      type: "design.committed",
      at: 3,
      designSpec: "planner design v1",
    });
    const validated = advanceSynthesisWorkflow(designed, {
      type: "validation.recorded",
      at: 4,
      passed: true,
      report: "validation passed",
    });
    const integrated = advanceSynthesisWorkflow(validated, {
      type: "integration.decided",
      at: 5,
      decision: "integrate",
      reason: "ship capability",
    });

    expect(integrated.stage).toBe("completed");
    expect(integrated.status).toBe("integrated");
    expect(integrated.history).toHaveLength(5);
  });

  it("rejects integration before validation succeeds", () => {
    const created = createSynthesisWorkflow({
      workflowId: "wf-2",
      gapId: "gap-2",
      createdAt: 1,
    });
    const proposed = advanceSynthesisWorkflow(created, {
      type: "proposal.accepted",
      at: 2,
      capabilityId: "cap-2",
      capabilityName: "simulator",
      summary: "proposal",
    });
    const designed = advanceSynthesisWorkflow(proposed, {
      type: "design.committed",
      at: 3,
      designSpec: "simulator design",
    });
    const validationFailed = advanceSynthesisWorkflow(designed, {
      type: "validation.recorded",
      at: 4,
      passed: false,
      report: "failed baseline safety checks",
    });

    expect(() =>
      advanceSynthesisWorkflow(validationFailed, {
        type: "integration.decided",
        at: 5,
        decision: "integrate",
        reason: "should fail",
      }),
    ).toThrow("before successful validation");
  });

  it("emits Prometheus events for synthesis lifecycle milestones", () => {
    const created = createSynthesisWorkflow({
      workflowId: "wf-3",
      gapId: "gap-3",
      createdAt: 10,
    });
    const proposed = advanceSynthesisWorkflow(created, {
      type: "proposal.accepted",
      at: 11,
      capabilityId: "cap-3",
      capabilityName: "optimizer",
      summary: "proposal accepted",
    });
    const proposalEvents = buildSynthesisWorkflowEvents({
      previous: created,
      next: proposed,
      actorAgentId: "agent-main",
    });
    expect(proposalEvents[0]?.type).toBe("capability-synthesized.recorded");

    const designed = advanceSynthesisWorkflow(proposed, {
      type: "design.committed",
      at: 12,
      designSpec: "optimizer spec",
    });
    const validated = advanceSynthesisWorkflow(designed, {
      type: "validation.recorded",
      at: 13,
      passed: true,
      report: "pass",
    });
    const validationEvents = buildSynthesisWorkflowEvents({
      previous: designed,
      next: validated,
    });
    expect(validationEvents[0]?.type).toBe("capability-synthesized.status-updated");
    expect(validationEvents[0]?.payload.status).toBe("validated");

    const integrated = advanceSynthesisWorkflow(validated, {
      type: "integration.decided",
      at: 14,
      decision: "integrate",
      reason: "approved",
    });
    const completionEvents = buildSynthesisWorkflowEvents({
      previous: validated,
      next: integrated,
    });
    expect(completionEvents[0]?.payload.status).toBe("integrated");
  });
});
