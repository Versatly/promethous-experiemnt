import { describe, expect, it } from "vitest";
import type { PrometheusState } from "../state.js";
import { planCapitalAllocations } from "./allocation.js";

function buildState(overrides: Partial<PrometheusState>): PrometheusState {
  return {
    version: 1,
    goals: {},
    agents: {},
    capabilityGaps: {},
    synthesizedCapabilities: {},
    institutions: {},
    capitalLedger: {},
    recursionCycles: [],
    ...overrides,
  };
}

describe("planCapitalAllocations", () => {
  it("allocates highest-priority demands first and reports unmet amounts", () => {
    const state = buildState({
      institutions: {
        "inst-a": {
          id: "inst-a",
          name: "A",
          mandate: "compute",
          authorityModel: "council",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
        "inst-b": {
          id: "inst-b",
          name: "B",
          mandate: "compute",
          authorityModel: "council",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
      },
      capitalLedger: {
        "cap-a": {
          id: "cap-a",
          institutionId: "inst-a",
          form: "compute",
          amount: 60,
          unit: "gpu-hours",
          updatedAt: 1,
        },
        "cap-b": {
          id: "cap-b",
          institutionId: "inst-b",
          form: "compute",
          amount: 20,
          unit: "gpu-hours",
          updatedAt: 1,
        },
      },
    });

    const plan = planCapitalAllocations({
      state,
      demands: [
        {
          goalId: "goal-low",
          form: "compute",
          requiredAmount: 40,
          priority: 10,
        },
        {
          goalId: "goal-high",
          form: "compute",
          requiredAmount: 70,
          priority: 90,
        },
      ],
    });

    const highGoalAllocated = plan.allocations
      .filter((allocation) => allocation.goalId === "goal-high")
      .reduce((total, allocation) => total + allocation.amount, 0);
    expect(highGoalAllocated).toBe(70);
    expect(plan.unmetDemands).toHaveLength(1);
    expect(plan.unmetDemands[0]?.goalId).toBe("goal-low");
    expect(plan.unmetDemands[0]?.unmetAmount).toBe(30);
  });
});
