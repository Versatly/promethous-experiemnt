import { describe, expect, it } from "vitest";
import type { PrometheusState } from "../state.js";
import { computeGoalTrajectorySnapshot, detectTrajectoryDivergence } from "./trajectory.js";

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

describe("computeGoalTrajectorySnapshot", () => {
  it("scores goal tree completion and blocked ratios", () => {
    const state = buildState({
      goals: {
        root: {
          id: "root",
          title: "Root",
          objective: "Ship",
          status: "active",
          priority: 100,
          createdAt: 1,
          updatedAt: 1,
          childGoalIds: ["child-a", "child-b"],
        },
        "child-a": {
          id: "child-a",
          title: "A",
          objective: "A",
          parentGoalId: "root",
          status: "completed",
          priority: 80,
          createdAt: 1,
          updatedAt: 1,
          childGoalIds: [],
        },
        "child-b": {
          id: "child-b",
          title: "B",
          objective: "B",
          parentGoalId: "root",
          status: "blocked",
          priority: 70,
          createdAt: 1,
          updatedAt: 1,
          childGoalIds: [],
        },
      },
    });

    const snapshot = computeGoalTrajectorySnapshot({
      state,
      rootGoalId: "root",
      at: 1000,
    });

    expect(snapshot.completionRatio).toBeCloseTo(1 / 3);
    expect(snapshot.blockedRatio).toBeCloseTo(1 / 3);
    expect(snapshot.score).toBeGreaterThan(0);
    expect(snapshot.score).toBeLessThan(1);
  });
});

describe("detectTrajectoryDivergence", () => {
  it("detects floor threshold violations", () => {
    const signal = detectTrajectoryDivergence({
      snapshots: [
        { at: 1, completionRatio: 0.4, blockedRatio: 0.2, score: 0.55 },
        { at: 2, completionRatio: 0.42, blockedRatio: 0.4, score: 0.25 },
      ],
    });

    expect(signal).not.toBeNull();
    expect(signal?.reason).toContain("minimum floor");
  });

  it("returns null when trajectory remains stable", () => {
    const signal = detectTrajectoryDivergence({
      snapshots: [
        { at: 1, completionRatio: 0.3, blockedRatio: 0.1, score: 0.5 },
        { at: 2, completionRatio: 0.4, blockedRatio: 0.1, score: 0.58 },
      ],
    });
    expect(signal).toBeNull();
  });
});
