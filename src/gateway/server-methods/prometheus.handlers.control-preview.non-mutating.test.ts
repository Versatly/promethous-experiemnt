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
});

describe("prometheusHandlers.prometheus.control.preview non-mutating guarantees", () => {
  it("does not mutate event log across preview actions", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-non-mutating",
        title: "Non-mutating goal",
        objective: "Verify preview does not write",
        priority: 75,
      },
    });
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
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
      await prometheusHandlers["prometheus.control.preview"]({
        req: { type: "req", id: "control-non-mutating", method: "prometheus.control.preview" },
        params: {
          stateDir,
          ...params,
        },
        client: null,
        isWebchatConnect: () => false,
        respond,
        context: {} as GatewayRequestContext,
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
      proposal: {
        mutationId: "mut-non-mutating",
        title: "Safe mutation",
        hypothesis: "should remain read-only",
        risk: "low",
        expectedGain: 0.05,
      },
      baseline: {
        objectiveFit: 0.51,
        stability: 0.7,
        throughput: 0.49,
      },
      candidate: {
        objectiveFit: 0.6,
        stability: 0.71,
        throughput: 0.5,
      },
    });

    const afterCount = (await eventStore.readAll()).length;
    expect(afterCount).toBe(beforeCount);
  });
});
