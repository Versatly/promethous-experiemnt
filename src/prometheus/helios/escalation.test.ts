import { describe, expect, it } from "vitest";
import { nextDriftEscalation } from "./escalation.js";

describe("nextDriftEscalation", () => {
  it("returns a warning for medium-severity divergence", () => {
    const result = nextDriftEscalation({
      signal: {
        severity: "medium",
        reason: "trajectory score dropped too quickly between snapshots",
        scoreDrop: 0.28,
        latestScore: 0.42,
      },
      trajectoryWindow: [
        { at: 1, completionRatio: 0.3, blockedRatio: 0.1, score: 0.7 },
        { at: 2, completionRatio: 0.25, blockedRatio: 0.15, score: 0.42 },
      ],
      now: 2,
    });

    expect(result.decision?.level).toBe("warning");
    expect(result.state.consecutiveSignals).toBe(1);
  });

  it("escalates repeated low-severity divergence to intervention", () => {
    const first = nextDriftEscalation({
      signal: {
        severity: "low",
        reason: "trajectory score dropped too quickly between snapshots",
        scoreDrop: 0.21,
        latestScore: 0.51,
      },
      trajectoryWindow: [
        { at: 1, completionRatio: 0.3, blockedRatio: 0.1, score: 0.72 },
        { at: 2, completionRatio: 0.28, blockedRatio: 0.12, score: 0.51 },
      ],
      now: 2,
    });

    const second = nextDriftEscalation({
      signal: {
        severity: "low",
        reason: "trajectory score dropped too quickly between snapshots",
        scoreDrop: 0.24,
        latestScore: 0.45,
      },
      trajectoryWindow: [
        { at: 2, completionRatio: 0.28, blockedRatio: 0.12, score: 0.51 },
        { at: 3, completionRatio: 0.27, blockedRatio: 0.15, score: 0.45 },
      ],
      previousState: first.state,
      now: 3,
      policy: {
        consecutiveSignalsForIntervention: 2,
      },
    });

    expect(second.decision?.level).toBe("intervention");
    expect(second.state.consecutiveSignals).toBe(2);
  });

  it("resets signal streak when divergence clears", () => {
    const previous = nextDriftEscalation({
      signal: {
        severity: "medium",
        reason: "trajectory score fell below minimum floor",
        scoreDrop: 0.11,
        latestScore: 0.31,
      },
      trajectoryWindow: [
        { at: 1, completionRatio: 0.4, blockedRatio: 0.2, score: 0.5 },
        { at: 2, completionRatio: 0.39, blockedRatio: 0.25, score: 0.31 },
      ],
      now: 2,
    });

    const recovered = nextDriftEscalation({
      signal: null,
      trajectoryWindow: [{ at: 3, completionRatio: 0.45, blockedRatio: 0.18, score: 0.56 }],
      previousState: previous.state,
      now: 3,
    });

    expect(recovered.decision).toBeNull();
    expect(recovered.state.consecutiveSignals).toBe(0);
  });
});
