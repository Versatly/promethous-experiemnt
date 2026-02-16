import { afterEach, describe, expect, it, vi } from "vitest";
import { runPrometheusHandler } from "./prometheus.handler-test-helpers.js";
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

describe("prometheusHandlers.prometheus.trajectory", () => {
  it("returns trajectory window and divergence for requested goal", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-trajectory-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-root",
        title: "Root objective",
        objective: "ship system",
        priority: 100,
      },
    });
    const trajectoryStore = createPrometheusTrajectoryStoreForStateDir(stateDir);
    await trajectoryStore.appendBatch([
      {
        goalId: "goal-root",
        snapshot: { at: 10, completionRatio: 0.4, blockedRatio: 0.1, score: 0.65 },
      },
      {
        goalId: "goal-root",
        snapshot: { at: 20, completionRatio: 0.35, blockedRatio: 0.4, score: 0.2 },
      },
    ]);

    const respond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.trajectory",
      requestId: "traj-1",
      params: {
        stateDir,
        goalId: "goal-root",
        trajectoryWindowSize: 10,
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        goal: expect.objectContaining({
          goalId: "goal-root",
        }),
        snapshotCount: 2,
        divergence: expect.objectContaining({
          severity: "high",
        }),
      }),
      undefined,
    );
  });
});
