import { describe, expect, it } from "vitest";
import type { PrometheusState } from "../state.js";
import {
  buildCapabilityGapDetectedEvents,
  detectCapabilityGapsFromFailedPaths,
} from "./gap-detection.js";

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

describe("detectCapabilityGapsFromFailedPaths", () => {
  it("suggests high-severity gap for blocked path with no integrated capability", () => {
    const state = buildState({
      goals: {
        root: {
          id: "root",
          title: "Recursive planner",
          objective: "deploy planner",
          status: "blocked",
          priority: 100,
          createdAt: 1,
          updatedAt: 1,
          childGoalIds: [],
        },
      },
      synthesizedCapabilities: {
        "cap-proposed": {
          id: "cap-proposed",
          gapId: "gap-previous",
          name: "proto capability",
          designSpec: "spec",
          status: "proposed",
          createdAt: 2,
          updatedAt: 2,
        },
      },
      capabilityGaps: {
        "gap-previous": {
          id: "gap-previous",
          goalId: "other-goal",
          description: "other",
          severity: "medium",
          createdAt: 2,
        },
      },
    });

    const suggestions = detectCapabilityGapsFromFailedPaths({
      state,
      failedGoalIds: ["root"],
      now: 10,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.goalId).toBe("root");
    expect(suggestions[0]?.severity).toBe("critical");
  });

  it("converts suggestions to capability-gap.detected events", () => {
    const events = buildCapabilityGapDetectedEvents({
      suggestions: [
        {
          suggestionId: "gap-suggested:root:10:1",
          goalId: "root",
          severity: "high",
          description: "Gap description",
          rationale: "Need additional synthesis",
        },
      ],
      occurredAt: 100,
      actorAgentId: "agent-main",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("capability-gap.detected");
    expect(events[0]?.payload.goalId).toBe("root");
    expect(events[0]?.actorAgentId).toBe("agent-main");
  });
});
