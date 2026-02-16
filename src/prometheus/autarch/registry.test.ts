import { describe, expect, it } from "vitest";
import type { PrometheusState } from "../state.js";
import { buildCapabilityGraph } from "./registry.js";

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

describe("buildCapabilityGraph", () => {
  it("builds capability coverage across gaps and synthesized capabilities", () => {
    const state = buildState({
      goals: {
        root: {
          id: "root",
          title: "Root objective",
          objective: "Ship target",
          status: "blocked",
          priority: 90,
          createdAt: 1,
          updatedAt: 1,
          childGoalIds: [],
        },
      },
      capabilityGaps: {
        "gap-1": {
          id: "gap-1",
          goalId: "root",
          description: "missing distributed planner",
          severity: "high",
          createdAt: 2,
        },
      },
      synthesizedCapabilities: {
        "cap-1": {
          id: "cap-1",
          gapId: "gap-1",
          name: "distributed planner",
          designSpec: "planner v1",
          status: "validated",
          createdAt: 3,
          updatedAt: 3,
        },
      },
    });

    const graph = buildCapabilityGraph({
      state,
      existingCapabilities: [
        {
          id: "native-1",
          name: "legacy planner",
          coversGoalIds: ["root"],
        },
      ],
    });

    expect(graph.capabilities["cap-1"]?.goalIds).toEqual(["root"]);
    expect(graph.capabilities["cap-1"]?.status).toBe("validated");
    expect(graph.coverageByGoal.root?.integratedCount).toBe(1);
    expect(graph.coverageByGoal.root?.provisionalCount).toBe(1);
    expect(graph.coverageByGoal.root?.unresolvedGapIds).toEqual(["gap-1"]);
    expect(
      graph.edges.some(
        (edge) =>
          edge.type === "capability-addresses-gap" &&
          edge.fromId === "cap-1" &&
          edge.toId === "gap-1",
      ),
    ).toBe(true);
  });
});
