import { afterEach, describe, expect, it, vi } from "vitest";
import { runPrometheusHandler } from "./prometheus.handler-test-helpers.js";
import {
  createPrometheusEventStoreForStateDir,
  createPrometheusTempDirHarness,
} from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
  vi.unstubAllEnvs();
});

describe("prometheusHandlers.prometheus.goals", () => {
  it("returns goal tree with capability coverage summaries", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-goals-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.appendBatch([
      {
        id: "evt-goal-root",
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
        id: "evt-goal-child",
        type: "goal.created",
        occurredAt: 2,
        payload: {
          goalId: "goal-child",
          parentGoalId: "goal-root",
          title: "Child objective",
          objective: "ship child",
          priority: 90,
        },
      },
      {
        id: "evt-gap",
        type: "capability-gap.detected",
        occurredAt: 3,
        payload: {
          gapId: "gap-1",
          goalId: "goal-child",
          description: "missing capability",
          severity: "high",
        },
      },
      {
        id: "evt-capability",
        type: "capability-synthesized.recorded",
        occurredAt: 4,
        payload: {
          capabilityId: "cap-1",
          gapId: "gap-1",
          name: "Planner capability",
          designSpec: "design",
          status: "validated",
        },
      },
    ]);

    const respond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.goals",
      requestId: "2",
      params: {
        stateDir,
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        total: 2,
        goals: expect.arrayContaining([
          expect.objectContaining({
            goalId: "goal-child",
            capabilityCoverage: expect.objectContaining({
              capabilityIds: ["cap-1"],
              provisionalCount: 1,
              unresolvedGapIds: ["gap-1"],
            }),
          }),
        ]),
      }),
      undefined,
    );
  });
});
