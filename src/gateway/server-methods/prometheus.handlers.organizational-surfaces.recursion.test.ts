import { afterEach, describe, expect, it, vi } from "vitest";
import { runPrometheusHandler } from "./prometheus.handler-test-helpers.js";
import {
  createPrometheusEventStoreForStateDir,
  createPrometheusTempDirHarness,
} from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheusHandlers.prometheus.recursion", () => {
  it("returns recursion cycle telemetry window and acceptance ratios", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-recursion-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.appendBatch([
      {
        id: "evt-goal",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-root",
          title: "Root objective",
          objective: "ship system",
          priority: 100,
        },
      },
      {
        id: "evt-cycle-1",
        type: "recursion.cycle-recorded",
        occurredAt: 5,
        payload: {
          cycleId: "cycle-1",
          summary: "accepted mutation",
          mutationId: "mut-1",
          accepted: true,
          evaluationScore: 0.12,
          occurredAt: 5,
        },
      },
      {
        id: "evt-cycle-2",
        type: "recursion.cycle-recorded",
        occurredAt: 6,
        payload: {
          cycleId: "cycle-2",
          summary: "rejected mutation",
          mutationId: "mut-2",
          accepted: false,
          evaluationScore: -0.05,
          occurredAt: 6,
        },
      },
      {
        id: "evt-cycle-3",
        type: "recursion.cycle-recorded",
        occurredAt: 7,
        payload: {
          cycleId: "cycle-3",
          summary: "rollback",
          rollbackOfCycleId: "cycle-1",
          accepted: true,
          evaluationScore: 0,
          occurredAt: 7,
        },
      },
    ]);

    const respond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.recursion",
      requestId: "3",
      params: {
        stateDir,
        recursionWindowSize: 2,
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        windowSize: 2,
        totals: expect.objectContaining({
          totalCycles: 3,
          accepted: 1,
          rejected: 1,
          rollbackCount: 1,
          acceptanceRatio: 0.5,
        }),
        cycles: [
          expect.objectContaining({
            cycleId: "cycle-3",
            rollbackOfCycleId: "cycle-1",
          }),
          expect.objectContaining({
            cycleId: "cycle-2",
            accepted: false,
          }),
        ],
      }),
      undefined,
    );
  });
});
