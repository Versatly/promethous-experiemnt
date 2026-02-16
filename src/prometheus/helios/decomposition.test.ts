import { describe, expect, it } from "vitest";
import { buildGoalDecompositionEvents, decomposeGoalObjective } from "./decomposition.js";

describe("decomposeGoalObjective", () => {
  it("splits objective into deterministic sub-goals", () => {
    const decomposition = decomposeGoalObjective({
      rootGoalId: "goal-root",
      objective:
        "Design primitive schemas and implement append-only events and validate invariants.",
      maxSubGoals: 4,
    });

    expect(decomposition.rootGoalId).toBe("goal-root");
    expect(decomposition.subGoals).toHaveLength(3);
    expect(decomposition.subGoals[0]?.goalId).toBe("goal-root:sg:1");
    expect(decomposition.subGoals[1]?.priority).toBeLessThan(
      decomposition.subGoals[0]?.priority ?? 100,
    );
  });
});

describe("buildGoalDecompositionEvents", () => {
  it("maps decomposition plan to goal.created event stream", () => {
    const decomposition = decomposeGoalObjective({
      rootGoalId: "goal-root",
      objective: "Stabilize trajectory. Integrate synthesis.",
      maxSubGoals: 3,
    });

    const events = buildGoalDecompositionEvents({
      occurredAt: 100,
      rootGoalId: "goal-root",
      actorAgentId: "agent-main",
      decomposition,
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe("goal.created");
    expect(events[0]?.payload.parentGoalId).toBe("goal-root");
    expect(events[0]?.actorAgentId).toBe("agent-main");
    expect(events[1]?.occurredAt).toBeGreaterThan(events[0]?.occurredAt ?? 0);
  });
});
