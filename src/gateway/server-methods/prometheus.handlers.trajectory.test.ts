import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";
import { prometheusHandlers } from "./prometheus.js";
import { createPrometheusTempDirHarness } from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
  vi.unstubAllEnvs();
});

describe("prometheusHandlers.prometheus.trajectory", () => {
  it("returns trajectory window and divergence for requested goal", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-trajectory-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
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
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
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
    await prometheusHandlers["prometheus.trajectory"]({
      req: { type: "req", id: "traj-1", method: "prometheus.trajectory" },
      params: {
        stateDir,
        goalId: "goal-root",
        trajectoryWindowSize: 10,
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
