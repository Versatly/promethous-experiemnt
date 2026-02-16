import { describe, expect, it } from "vitest";
import {
  createGoalCreatedEvent,
  createRecursionFitnessSnapshot,
  createRecursionMutationProposal,
} from "./prometheus.test-events.js";

describe("prometheus test event fixtures", () => {
  it("creates goal-created events with canonical defaults", () => {
    const event = createGoalCreatedEvent({
      id: "evt-goal-defaults",
      occurredAt: 10,
      goalId: "goal-default",
      title: "Default Goal",
      objective: "Ship objective",
    });

    expect(event).toEqual({
      id: "evt-goal-defaults",
      type: "goal.created",
      occurredAt: 10,
      payload: {
        goalId: "goal-default",
        title: "Default Goal",
        objective: "Ship objective",
        priority: 100,
      },
    });
  });

  it("creates goal-created events with explicit priority and parent goal", () => {
    const event = createGoalCreatedEvent({
      id: "evt-goal-overrides",
      occurredAt: 20,
      goalId: "goal-child",
      parentGoalId: "goal-root",
      title: "Child Goal",
      objective: "Ship dependency",
      priority: 85,
    });

    expect(event).toEqual({
      id: "evt-goal-overrides",
      type: "goal.created",
      occurredAt: 20,
      payload: {
        goalId: "goal-child",
        parentGoalId: "goal-root",
        title: "Child Goal",
        objective: "Ship dependency",
        priority: 85,
      },
    });
  });

  it("creates recursion mutation proposals with defaults and overrides", () => {
    expect(
      createRecursionMutationProposal({
        mutationId: "mut-defaults",
        title: "Default mutation",
        hypothesis: "Improve fit",
      }),
    ).toEqual({
      mutationId: "mut-defaults",
      title: "Default mutation",
      hypothesis: "Improve fit",
      risk: "low",
      expectedGain: 0.1,
    });

    expect(
      createRecursionMutationProposal({
        mutationId: "mut-overrides",
        title: "Override mutation",
        hypothesis: "Improve stability",
        risk: "high",
        expectedGain: 0.25,
      }),
    ).toEqual({
      mutationId: "mut-overrides",
      title: "Override mutation",
      hypothesis: "Improve stability",
      risk: "high",
      expectedGain: 0.25,
    });
  });

  it("creates recursion fitness snapshots without mutating values", () => {
    const snapshot = createRecursionFitnessSnapshot({
      objectiveFit: 0.61,
      stability: 0.73,
      throughput: 0.58,
    });

    expect(snapshot).toEqual({
      objectiveFit: 0.61,
      stability: 0.73,
      throughput: 0.58,
    });
  });
});
