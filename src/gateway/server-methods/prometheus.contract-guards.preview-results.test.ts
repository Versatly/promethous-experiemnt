import { afterEach, describe, expect, it } from "vitest";
import { isPrometheusControlPreviewResult } from "./prometheus.contract-guards.js";
import { runPrometheusControlPreview } from "./prometheus.control-preview.js";
import {
  createGoalCreatedEvent,
  createRecursionFitnessSnapshot,
  createRecursionMutationProposal,
} from "./prometheus.test-events.js";
import {
  createPrometheusEventStoreForStateDir,
  createPrometheusTempDirHarness,
  createPrometheusTrajectoryStoreForStateDir,
} from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheus contract guards (control preview results)", () => {
  it("accepts valid control preview success results", async () => {
    const stateDir = await makeTempDir("prometheus-contract-guards-preview-valid-");
    const result = await runPrometheusControlPreview({
      stateDir,
      action: "autarch.gap-detection",
    });
    expect(result.ok).toBe(true);
    expect(isPrometheusControlPreviewResult(result)).toBe(true);
  });

  it("accepts valid HELIOS preview success results", async () => {
    const stateDir = await makeTempDir("prometheus-contract-guards-preview-helios-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.append(
      createGoalCreatedEvent({
        id: "evt-goal-helios",
        occurredAt: 1,
        goalId: "goal-helios",
        title: "Helios goal",
        objective: "Track trajectory",
        priority: 80,
      }),
    );
    const trajectoryStore = createPrometheusTrajectoryStoreForStateDir(stateDir);
    await trajectoryStore.append({
      goalId: "goal-helios",
      snapshot: {
        at: 2,
        completionRatio: 0.3,
        blockedRatio: 0.1,
        score: 0.5,
      },
    });

    const result = await runPrometheusControlPreview({
      stateDir,
      action: "helios.trajectory-evaluation",
      goalId: "goal-helios",
    });
    expect(result.ok).toBe(true);
    expect(isPrometheusControlPreviewResult(result)).toBe(true);
  });

  it("accepts valid recursion preview success results", async () => {
    const stateDir = await makeTempDir("prometheus-contract-guards-preview-recursion-");
    const result = await runPrometheusControlPreview({
      stateDir,
      action: "recursion.mutation-evaluation",
      proposal: createRecursionMutationProposal({
        mutationId: "mut-1",
        title: "Scale horizon",
        hypothesis: "improve fitness",
        risk: "medium",
      }),
      baseline: createRecursionFitnessSnapshot({
        objectiveFit: 0.5,
        stability: 0.7,
        throughput: 0.45,
      }),
      candidate: createRecursionFitnessSnapshot({
        objectiveFit: 0.7,
        stability: 0.72,
        throughput: 0.51,
      }),
    });
    expect(result.ok).toBe(true);
    expect(isPrometheusControlPreviewResult(result)).toBe(true);
  });

  it("rejects control preview success results with AUTARCH count drift", () => {
    const malformedResult = {
      ok: true,
      payload: {
        ts: Date.now(),
        action: "autarch.gap-detection",
        mutatesState: false,
        preview: {
          suggestedGapCount: 2,
          suggestions: [
            {
              suggestionId: "gap-1",
              goalId: "goal-1",
              severity: "high",
              description: "Gap",
            },
          ],
        },
      },
    };
    expect(isPrometheusControlPreviewResult(malformedResult)).toBe(false);
  });

  it("rejects control preview success results with HELIOS divergence severity drift", () => {
    const malformedResult = {
      ok: true,
      payload: {
        ts: Date.now(),
        action: "helios.trajectory-evaluation",
        mutatesState: false,
        preview: {
          goalId: "goal-1",
          goalStatus: "active",
          computedSnapshot: {
            at: Date.now(),
            completionRatio: 0.4,
            blockedRatio: 0.2,
            score: 0.5,
          },
          priorWindowSize: 1,
          divergence: {
            severity: "critical",
            reason: "invalid severity",
            scoreDrop: 0.2,
            latestScore: 0.5,
          },
        },
      },
    };
    expect(isPrometheusControlPreviewResult(malformedResult)).toBe(false);
  });

  it("rejects control preview success results with recursion fitness bounds drift", () => {
    const malformedResult = {
      ok: true,
      payload: {
        ts: Date.now(),
        action: "recursion.mutation-evaluation",
        mutatesState: false,
        preview: {
          evaluation: {
            mutationId: "mut-1",
            accepted: true,
            scoreDelta: 1.2,
            baselineScore: 0.4,
            candidateScore: 1.1,
            rationale: "invalid bounds",
          },
        },
      },
    };
    expect(isPrometheusControlPreviewResult(malformedResult)).toBe(false);
  });

  it("accepts control preview failure results with valid protocol error codes", () => {
    const validFailureResult = {
      ok: false,
      error: {
        code: "UNAVAILABLE",
        message: "canonical error shape",
      },
    };
    expect(isPrometheusControlPreviewResult(validFailureResult)).toBe(true);
  });

  it("rejects control preview failure results with invalid protocol error codes", () => {
    const malformedResult = {
      ok: false,
      error: {
        code: "BOOM",
        message: "invalid code",
      },
    };
    expect(isPrometheusControlPreviewResult(malformedResult)).toBe(false);
  });
});
