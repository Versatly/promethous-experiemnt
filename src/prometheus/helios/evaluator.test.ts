import { describe, expect, it } from "vitest";
import type { PrometheusState } from "../state.js";
import type { GoalTrajectoryRecord, HeliosTrajectoryStore } from "./trajectory-store.js";
import { createHeliosTrajectoryEvaluator } from "./evaluator.js";

function buildState(status: "active" | "completed" | "blocked"): PrometheusState {
  return {
    version: 1,
    goals: {
      root: {
        id: "root",
        title: "Root",
        objective: "Ship objective",
        status,
        priority: 100,
        createdAt: 1,
        updatedAt: 1,
        childGoalIds: [],
      },
    },
    agents: {},
    capabilityGaps: {},
    synthesizedCapabilities: {},
    institutions: {},
    capitalLedger: {},
    recursionCycles: [],
  };
}

function createInMemoryStore(): HeliosTrajectoryStore {
  const records: GoalTrajectoryRecord[] = [];
  return {
    append: async (record) => {
      records.push(record);
    },
    appendBatch: async (batch) => {
      records.push(...batch);
    },
    readWindow: async ({ goalId, maxSnapshots }) => {
      const list = records
        .filter((record) => record.goalId === goalId)
        .map((record) => record.snapshot);
      const cap = typeof maxSnapshots === "number" ? maxSnapshots : list.length;
      return cap >= list.length ? list : list.slice(list.length - cap);
    },
  };
}

describe("createHeliosTrajectoryEvaluator", () => {
  it("persists snapshots and enforces windowing", async () => {
    const evaluator = createHeliosTrajectoryEvaluator({
      trajectoryStore: createInMemoryStore(),
      trajectoryWindowSize: 2,
    });

    await evaluator.evaluateGoal({
      state: buildState("active"),
      rootGoalId: "root",
      at: 10,
    });
    await evaluator.evaluateGoal({
      state: buildState("completed"),
      rootGoalId: "root",
      at: 20,
    });
    const result = await evaluator.evaluateGoal({
      state: buildState("blocked"),
      rootGoalId: "root",
      at: 30,
    });

    expect(result.trajectoryWindow).toHaveLength(2);
    expect(result.trajectoryWindow[0]?.at).toBe(20);
    expect(result.trajectoryWindow[1]?.at).toBe(30);
    expect(result.signal).not.toBeNull();
    expect(result.escalation).not.toBeNull();
  });
});
