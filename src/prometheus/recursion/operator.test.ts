import { describe, expect, it } from "vitest";
import {
  buildRecursionCycleEvent,
  buildRollbackCycleEvent,
  evaluateMutationProposal,
} from "./operator.js";

describe("evaluateMutationProposal", () => {
  it("accepts mutations that improve score above threshold", () => {
    const evaluation = evaluateMutationProposal({
      proposal: {
        mutationId: "mut-1",
        title: "Increase planning horizon",
        hypothesis: "Longer horizon improves objective fit",
        risk: "low",
        expectedGain: 0.15,
      },
      baseline: {
        objectiveFit: 0.55,
        stability: 0.7,
        throughput: 0.5,
      },
      candidate: {
        objectiveFit: 0.72,
        stability: 0.71,
        throughput: 0.5,
      },
    });
    expect(evaluation.accepted).toBe(true);
    expect(evaluation.scoreDelta).toBeGreaterThan(0.05);
  });

  it("rejects mutations that violate stability floor", () => {
    const evaluation = evaluateMutationProposal({
      proposal: {
        mutationId: "mut-2",
        title: "Aggressive parallelism",
        hypothesis: "More throughput improves outcomes",
        risk: "high",
        expectedGain: 0.25,
      },
      baseline: {
        objectiveFit: 0.65,
        stability: 0.7,
        throughput: 0.5,
      },
      candidate: {
        objectiveFit: 0.8,
        stability: 0.32,
        throughput: 0.9,
      },
    });
    expect(evaluation.accepted).toBe(false);
    expect(evaluation.rationale).toContain("stability");
  });
});

describe("recursion cycle events", () => {
  it("builds recursion cycle event payload with evaluation metadata", () => {
    const event = buildRecursionCycleEvent({
      cycleId: "cycle-1",
      occurredAt: 100,
      summary: "Evaluated mutation",
      actorAgentId: "agent-main",
      evaluation: {
        mutationId: "mut-1",
        accepted: true,
        scoreDelta: 0.11,
        baselineScore: 0.55,
        candidateScore: 0.66,
        rationale: "improved objective fit",
      },
    });
    expect(event.type).toBe("recursion.cycle-recorded");
    expect(event.payload.mutationId).toBe("mut-1");
    expect(event.payload.accepted).toBe(true);
  });

  it("builds rollback event anchored to previous stable cycle", () => {
    const event = buildRollbackCycleEvent({
      cycleId: "cycle-rollback-1",
      rollbackOfCycleId: "cycle-stable-8",
      occurredAt: 200,
      reason: "post-deploy regression detected",
    });
    expect(event.payload.rollbackOfCycleId).toBe("cycle-stable-8");
    expect(event.payload.rationale).toContain("regression");
  });
});
