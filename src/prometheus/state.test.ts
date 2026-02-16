import { describe, expect, it } from "vitest";
import type { PrometheusEvent } from "./events.js";
import { replayPrometheusEvents } from "./state.js";

function event<T extends PrometheusEvent>(value: T): T {
  return value;
}

describe("PROMETHEUS state replay", () => {
  it("replays primitive lifecycle events into deterministic state", () => {
    const events: PrometheusEvent[] = [
      event({
        id: "evt-1",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-root",
          title: "Build PROMETHEUS",
          objective: "Ship recursive organizational intelligence",
          priority: 100,
        },
      }),
      event({
        id: "evt-2",
        type: "goal.created",
        occurredAt: 2,
        payload: {
          goalId: "goal-phase-1",
          parentGoalId: "goal-root",
          title: "Primitive Kernel",
          objective: "Build primitive state and event model",
          priority: 90,
        },
      }),
      event({
        id: "evt-3",
        type: "goal.status-updated",
        occurredAt: 3,
        payload: {
          goalId: "goal-phase-1",
          status: "completed",
        },
      }),
      event({
        id: "evt-4",
        type: "agent.registered",
        occurredAt: 4,
        payload: {
          agentId: "agent-main",
          name: "Main Orchestrator",
          kind: "ai",
          constraints: ["must-not-drift"],
        },
      }),
      event({
        id: "evt-5",
        type: "capability-gap.detected",
        occurredAt: 5,
        payload: {
          gapId: "gap-1",
          goalId: "goal-root",
          description: "Missing synthesis operator",
          severity: "critical",
        },
      }),
      event({
        id: "evt-6",
        type: "capability-synthesized.recorded",
        occurredAt: 6,
        payload: {
          capabilityId: "cap-1",
          gapId: "gap-1",
          name: "Synthesis operator v1",
          designSpec: "Detect -> design -> validate -> integrate",
          status: "validated",
        },
      }),
      event({
        id: "evt-7",
        type: "institution.created",
        occurredAt: 7,
        payload: {
          institutionId: "inst-1",
          name: "Prometheus Lab",
          mandate: "Scale recursive intelligence",
          authorityModel: "council",
        },
      }),
      event({
        id: "evt-8",
        type: "capital.allocated",
        occurredAt: 8,
        payload: {
          capitalId: "cap-money-1",
          institutionId: "inst-1",
          form: "money",
          amount: 1_000_000,
          unit: "USD",
        },
      }),
      event({
        id: "evt-9",
        type: "recursion.cycle-recorded",
        occurredAt: 9,
        payload: {
          cycleId: "cycle-1",
          summary: "Updated synthesis strategy",
          occurredAt: 9,
        },
      }),
    ];

    const state = replayPrometheusEvents(events);
    expect(state.goals["goal-root"]?.childGoalIds).toEqual(["goal-phase-1"]);
    expect(state.goals["goal-phase-1"]?.status).toBe("completed");
    expect(state.agents["agent-main"]?.constraints).toEqual(["must-not-drift"]);
    expect(state.capabilityGaps["gap-1"]?.severity).toBe("critical");
    expect(state.synthesizedCapabilities["cap-1"]?.status).toBe("validated");
    expect(state.institutions["inst-1"]?.status).toBe("active");
    expect(state.capitalLedger["cap-money-1"]?.amount).toBe(1_000_000);
    expect(state.recursionCycles).toHaveLength(1);
  });

  it("fails when events violate invariants", () => {
    const invalidEvents: PrometheusEvent[] = [
      event({
        id: "evt-1",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-1",
          title: "Goal 1",
          objective: "Test",
        },
      }),
      event({
        id: "evt-2",
        type: "goal.created",
        occurredAt: 2,
        payload: {
          goalId: "goal-2",
          title: "Goal 2",
          objective: "Test",
          parentGoalId: "missing-goal",
        },
      }),
    ];

    expect(() => replayPrometheusEvents(invalidEvents)).toThrow("Parent goal");
  });
});
