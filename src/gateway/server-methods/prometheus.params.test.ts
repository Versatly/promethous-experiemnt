import { describe, expect, it } from "vitest";
import {
  isGapSeverity,
  resolveCapitalDemands,
  resolveMaxItems,
  resolveRecursionWindowSize,
  resolveRootGoalIds,
  resolveSinceAt,
  resolveTrajectoryWindowSize,
} from "./prometheus.params.js";

describe("prometheus params helpers", () => {
  it("normalizes trajectory and recursion window sizes", () => {
    expect(resolveTrajectoryWindowSize({ trajectoryWindowSize: 12 })).toBe(12);
    expect(resolveTrajectoryWindowSize({ trajectoryWindowSize: 0 })).toBe(2);
    expect(resolveTrajectoryWindowSize({})).toBe(10);

    expect(resolveRecursionWindowSize({ recursionWindowSize: 7 })).toBe(7);
    expect(resolveRecursionWindowSize({ recursionWindowSize: 0 })).toBe(1);
    expect(resolveRecursionWindowSize({})).toBe(10);
  });

  it("parses sinceAt and maxItems bounds safely", () => {
    expect(resolveSinceAt({ sinceAt: 1_234 })).toBe(1_234);
    expect(resolveSinceAt({ sinceAt: "bad" })).toBeUndefined();

    expect(resolveMaxItems({ maxItems: 5 }, 10)).toBe(5);
    expect(resolveMaxItems({ maxItems: -1 }, 10)).toBe(1);
    expect(resolveMaxItems({ maxItems: 10_000 }, 10)).toBe(500);
    expect(resolveMaxItems({}, 10)).toBe(10);
  });

  it("resolves root goal ids from params and fallback", () => {
    expect(resolveRootGoalIds({ rootGoalIds: [" a ", "b"] }, ["fallback"])).toEqual(["a", "b"]);
    expect(resolveRootGoalIds({ rootGoalIds: [] }, ["fallback"])).toEqual(["fallback"]);
    expect(resolveRootGoalIds({}, ["fallback"])).toEqual(["fallback"]);
  });

  it("validates gap severities and capital demand parsing", () => {
    expect(isGapSeverity("critical")).toBe(true);
    expect(isGapSeverity("other")).toBe(false);

    const demands = resolveCapitalDemands({
      demands: [
        {
          goalId: "goal-1",
          form: "compute",
          requiredAmount: 10,
          priority: 80,
        },
        {
          goalId: "goal-2",
          form: "bad-form",
          requiredAmount: 10,
        },
      ],
    });

    expect(demands).toEqual([
      {
        goalId: "goal-1",
        form: "compute",
        requiredAmount: 10,
        priority: 80,
      },
    ]);
  });
});
