import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";
import { runPrometheusHandler } from "./prometheus.handler-test-helpers.js";
import { createPrometheusTempDirHarness } from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
  vi.unstubAllEnvs();
});

describe("prometheusHandlers.prometheus.status", () => {
  it("returns PROMETHEUS summary and root-goal trajectory status", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-status-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-1",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "root",
          title: "Root objective",
          objective: "ship system",
          priority: 100,
        },
      },
      {
        id: "evt-2",
        type: "goal.status-updated",
        occurredAt: 2,
        payload: {
          goalId: "root",
          status: "blocked",
        },
      },
    ]);
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
    await trajectoryStore.appendBatch([
      {
        goalId: "root",
        snapshot: { at: 1, completionRatio: 0.3, blockedRatio: 0.1, score: 0.6 },
      },
      {
        goalId: "root",
        snapshot: { at: 2, completionRatio: 0.25, blockedRatio: 0.4, score: 0.22 },
      },
    ]);

    const respond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.status",
      requestId: "1",
      params: {
        stateDir,
        rootGoalIds: ["root"],
        trajectoryWindowSize: 5,
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        eventCount: 2,
        summary: expect.objectContaining({
          goals: 1,
          blockedGoals: 1,
        }),
        rootGoals: [
          expect.objectContaining({
            goalId: "root",
            snapshotCount: 2,
            divergence: expect.objectContaining({
              severity: "high",
            }),
          }),
        ],
      }),
      undefined,
    );
  });
});
