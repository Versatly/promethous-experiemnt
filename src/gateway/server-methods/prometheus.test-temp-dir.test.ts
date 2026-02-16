import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGoalCreatedEvent } from "./prometheus.test-events.js";
import {
  createPrometheusEventStoreForStateDir,
  createPrometheusTempDirHarness,
  createPrometheusTrajectoryStoreForStateDir,
  resolvePrometheusEventLogPath,
  resolvePrometheusTrajectoryLogPath,
} from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheus test temp-dir helpers", () => {
  it("builds canonical observer log paths from state directories", () => {
    const stateDir = "/tmp/prometheus-state-dir";
    expect(resolvePrometheusEventLogPath(stateDir)).toBe(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    expect(resolvePrometheusTrajectoryLogPath(stateDir)).toBe(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
  });

  it("creates scoped event stores for a state directory", async () => {
    const stateDir = await makeTempDir("prometheus-temp-dir-event-store-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.append(
      createGoalCreatedEvent({
        id: "evt-goal",
        occurredAt: 1,
        goalId: "goal-root",
        title: "Root Goal",
        objective: "Ship system",
      }),
    );

    const events = await eventStore.readAll();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: "goal.created",
        payload: expect.objectContaining({
          goalId: "goal-root",
        }),
      }),
    );
  });

  it("creates scoped trajectory stores for a state directory", async () => {
    const stateDir = await makeTempDir("prometheus-temp-dir-trajectory-store-");
    const trajectoryStore = createPrometheusTrajectoryStoreForStateDir(stateDir);
    await trajectoryStore.append({
      goalId: "goal-root",
      snapshot: {
        at: 1,
        completionRatio: 0.4,
        blockedRatio: 0.1,
        score: 0.6,
      },
    });

    const snapshots = await trajectoryStore.readWindow({
      goalId: "goal-root",
      maxSnapshots: 10,
    });
    expect(snapshots).toEqual([
      expect.objectContaining({
        at: 1,
        score: 0.6,
      }),
    ]);
  });

  it("cleans up all created temp directories", async () => {
    const dirOne = await makeTempDir("prometheus-temp-dir-cleanup-one-");
    const dirTwo = await makeTempDir("prometheus-temp-dir-cleanup-two-");

    await cleanupTempDirs();

    await expect(fs.access(dirOne)).rejects.toThrow();
    await expect(fs.access(dirTwo)).rejects.toThrow();
  });
});
