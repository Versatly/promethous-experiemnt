import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { runPrometheusControlPreview } from "./prometheus.control-preview.js";
import { formatPrometheusMissingRequiredParamsMessage } from "./prometheus.preflight-guards.js";
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
  vi.unstubAllEnvs();
});

describe("prometheus control preview runtime flows", () => {
  it("returns INVALID_REQUEST for missing or unsupported actions", async () => {
    const missingAction = await runPrometheusControlPreview({});
    expect(missingAction).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: "action is required for prometheus.control.preview",
      },
    });

    const unsupportedAction = await runPrometheusControlPreview({
      action: "unknown.action",
    });
    expect(unsupportedAction).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "unknown.action"',
      },
    });
  });

  it("returns AUTARCH gap-detection preview for blocked goals", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.appendBatch([
      createGoalCreatedEvent({
        id: "evt-goal",
        occurredAt: 1,
        goalId: "goal-autarch",
        title: "AUTARCH goal",
        objective: "Find missing capabilities",
        priority: 90,
      }),
      {
        id: "evt-goal-status",
        type: "goal.status-updated",
        occurredAt: 2,
        payload: {
          goalId: "goal-autarch",
          status: "blocked",
        },
      },
    ]);

    const result = await runPrometheusControlPreview({
      stateDir,
      action: "autarch.gap-detection",
      maxItems: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("autarch.gap-detection");
    expect(result.payload.mutatesState).toBe(false);
    expect(result.payload.preview).toEqual(
      expect.objectContaining({
        suggestedGapCount: expect.any(Number),
        suggestions: expect.arrayContaining([
          expect.objectContaining({
            goalId: "goal-autarch",
          }),
        ]),
      }),
    );
  });

  it("returns HELIOS trajectory-evaluation preview with computed snapshot", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    const trajectoryStore = createPrometheusTrajectoryStoreForStateDir(stateDir);
    await eventStore.append(
      createGoalCreatedEvent({
        id: "evt-goal",
        occurredAt: 1,
        goalId: "goal-helios",
        title: "HELIOS goal",
        objective: "Evaluate trajectory",
        priority: 88,
      }),
    );
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
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("helios.trajectory-evaluation");
    expect(result.payload.preview).toEqual(
      expect.objectContaining({
        goalId: "goal-helios",
        goalStatus: "active",
        priorWindowSize: 1,
        computedSnapshot: expect.objectContaining({
          completionRatio: expect.any(Number),
          score: expect.any(Number),
        }),
      }),
    );
  });

  it("returns recursion mutation-evaluation preview with accepted decision", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.append(
      createGoalCreatedEvent({
        id: "evt-goal",
        occurredAt: 1,
        goalId: "goal-recursion",
        title: "Recursion goal",
        objective: "Evaluate mutation",
        priority: 91,
      }),
    );

    const result = await runPrometheusControlPreview({
      stateDir,
      action: "recursion.mutation-evaluation",
      proposal: createRecursionMutationProposal({
        mutationId: "mut-1",
        title: "Increase planning horizon",
        hypothesis: "improves objective fit",
        expectedGain: 0.09,
      }),
      baseline: createRecursionFitnessSnapshot({
        objectiveFit: 0.5,
        stability: 0.75,
        throughput: 0.55,
      }),
      candidate: createRecursionFitnessSnapshot({
        objectiveFit: 0.66,
        stability: 0.76,
        throughput: 0.57,
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("recursion.mutation-evaluation");
    expect(result.payload.preview).toEqual(
      expect.objectContaining({
        evaluation: expect.objectContaining({
          mutationId: "mut-1",
          accepted: expect.any(Boolean),
          scoreDelta: expect.any(Number),
        }),
      }),
    );
  });

  it("returns INVALID_REQUEST when recursion preview is missing required snapshots", async () => {
    const result = await runPrometheusControlPreview({
      action: "recursion.mutation-evaluation",
      proposal: {
        mutationId: "mut-1",
        title: "Incomplete proposal",
        hypothesis: "missing snapshots",
      },
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: formatPrometheusMissingRequiredParamsMessage({
          kind: "action",
          name: "recursion.mutation-evaluation",
          missingParams: ["baseline", "candidate"],
        }),
      },
    });
  });

  it("returns INVALID_REQUEST when HELIOS preview is missing required params", async () => {
    const result = await runPrometheusControlPreview({
      action: "helios.trajectory-evaluation",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: formatPrometheusMissingRequiredParamsMessage({
          kind: "action",
          name: "helios.trajectory-evaluation",
          missingParams: ["goalId"],
        }),
      },
    });
  });
});
