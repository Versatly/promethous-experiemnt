import { afterEach, describe, expect, it, vi } from "vitest";
import { runPrometheusControlPreviewHandler } from "./prometheus.handler-test-helpers.js";
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

describe("prometheusHandlers.prometheus.control.preview non-mutating guarantees", () => {
  it("does not mutate event log across preview actions", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.append(
      createGoalCreatedEvent({
        id: "evt-goal",
        occurredAt: 1,
        goalId: "goal-non-mutating",
        title: "Non-mutating goal",
        objective: "Verify preview does not write",
        priority: 75,
      }),
    );
    const trajectoryStore = createPrometheusTrajectoryStoreForStateDir(stateDir);
    await trajectoryStore.append({
      goalId: "goal-non-mutating",
      snapshot: {
        at: 2,
        completionRatio: 0.2,
        blockedRatio: 0.1,
        score: 0.4,
      },
    });

    const beforeCount = (await eventStore.readAll()).length;

    const callControlPreview = async (params: Record<string, unknown>) => {
      const respond = vi.fn();
      await runPrometheusControlPreviewHandler({
        requestId: "control-non-mutating",
        params: {
          stateDir,
          ...params,
        },
        respond,
      });
      expect(respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          mutatesState: false,
        }),
        undefined,
      );
    };

    await callControlPreview({
      action: "autarch.gap-detection",
    });
    await callControlPreview({
      action: "helios.trajectory-evaluation",
      goalId: "goal-non-mutating",
    });
    await callControlPreview({
      action: "recursion.mutation-evaluation",
      proposal: createRecursionMutationProposal({
        mutationId: "mut-non-mutating",
        title: "Safe mutation",
        hypothesis: "should remain read-only",
        expectedGain: 0.05,
      }),
      baseline: createRecursionFitnessSnapshot({
        objectiveFit: 0.51,
        stability: 0.7,
        throughput: 0.49,
      }),
      candidate: createRecursionFitnessSnapshot({
        objectiveFit: 0.6,
        stability: 0.71,
        throughput: 0.5,
      }),
    });

    const afterCount = (await eventStore.readAll()).length;
    expect(afterCount).toBe(beforeCount);
  });
});
