import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";
import { ErrorCodes } from "../protocol/index.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
} from "./prometheus.control-preview.js";
import { runPrometheusControlPreviewHandler } from "./prometheus.handler-test-helpers.js";
import { createPrometheusTempDirHarness } from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheusHandlers.prometheus.control.preview", () => {
  it("returns AUTARCH gap-detection preview without mutating state", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
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
        id: "evt-goal-status",
        type: "goal.status-updated",
        occurredAt: 2,
        payload: {
          goalId: "goal-root",
          status: "blocked",
        },
      },
    ]);

    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      requestId: "control-1",
      params: {
        stateDir,
        action: "autarch.gap-detection",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "autarch.gap-detection",
        mutatesState: false,
        preview: expect.objectContaining({
          suggestedGapCount: 1,
        }),
      }),
      undefined,
    );
  });

  it("returns recursion mutation evaluation preview", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
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

    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      requestId: "control-2",
      params: {
        stateDir,
        action: "recursion.mutation-evaluation",
        proposal: {
          mutationId: "mut-1",
          title: "Increase horizon",
          hypothesis: "better long-range trajectory",
          risk: "low",
          expectedGain: 0.1,
        },
        baseline: {
          objectiveFit: 0.55,
          stability: 0.7,
          throughput: 0.5,
        },
        candidate: {
          objectiveFit: 0.7,
          stability: 0.72,
          throughput: 0.52,
        },
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "recursion.mutation-evaluation",
        mutatesState: false,
        preview: expect.objectContaining({
          evaluation: expect.objectContaining({
            mutationId: "mut-1",
          }),
        }),
      }),
      undefined,
    );
  });

  it("returns HELIOS trajectory evaluation preview for known goal", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-helios",
        title: "Helios goal",
        objective: "Track trajectory",
        priority: 80,
      },
    });
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
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

    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      requestId: "control-3",
      params: {
        stateDir,
        action: "helios.trajectory-evaluation",
        goalId: "goal-helios",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "helios.trajectory-evaluation",
        mutatesState: false,
        preview: expect.objectContaining({
          goalId: "goal-helios",
          computedSnapshot: expect.objectContaining({
            at: expect.any(Number),
            completionRatio: expect.any(Number),
          }),
        }),
      }),
      undefined,
    );
  });

  it("rejects unsupported control preview action with INVALID_REQUEST", async () => {
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      requestId: "control-4",
      params: {
        action: "prometheus.unknown-action",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "prometheus.unknown-action"',
      }),
    );
  });

  it("rejects planned mutating control preview action with UNAVAILABLE", async () => {
    const plannedActionMetadata = getPrometheusPlannedMutatingPreviewActionMetadata(
      "autarch.gap-detection.commit",
    );
    expect(plannedActionMetadata).toBeDefined();
    if (!plannedActionMetadata) {
      return;
    }
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      requestId: "control-5",
      params: {
        action: "autarch.gap-detection.commit",
        goalId: "goal-root",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: buildPrometheusPlannedMutatingPreviewActionPreflight({
          action: "autarch.gap-detection.commit",
          metadata: plannedActionMetadata,
        }).disabledMessage,
      }),
    );
  });
});
