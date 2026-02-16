import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";
import { ErrorCodes } from "../protocol/index.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
} from "./prometheus.control-preview.js";
import { createPrometheusHandlers, prometheusHandlers } from "./prometheus.js";

const cleanupDirs = new Set<string>();

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  cleanupDirs.add(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  cleanupDirs.clear();
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
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-1", method: "prometheus.control.preview" },
      params: {
        stateDir,
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-2", method: "prometheus.control.preview" },
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
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-3", method: "prometheus.control.preview" },
      params: {
        stateDir,
        action: "helios.trajectory-evaluation",
        goalId: "goal-helios",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-4", method: "prometheus.control.preview" },
      params: {
        action: "prometheus.unknown-action",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-5", method: "prometheus.control.preview" },
      params: {
        action: "autarch.gap-detection.commit",
        goalId: "goal-root",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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

  it("returns UNAVAILABLE when injected control preview runner throws", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () => {
        throw new Error("control preview dependency exploded");
      },
    });
    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-dependency-error",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("control preview dependency exploded"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview result shape is invalid", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () => ({ ok: true }) as never,
    });
    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-invalid-shape",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview error code is invalid", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () =>
        ({
          ok: false,
          error: {
            code: "BOOM",
            message: "unexpected",
          },
        }) as never,
    });
    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-invalid-error-code",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview success payload mutability diverges", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () =>
        ({
          ok: true,
          payload: {
            ts: Date.now(),
            action: "autarch.gap-detection",
            mutatesState: true,
            preview: {
              suggestedGapCount: 1,
              suggestedGaps: [],
            },
          },
        }) as never,
    });
    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-invalid-success-mutability",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview success payload preview shape diverges", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () =>
        ({
          ok: true,
          payload: {
            ts: Date.now(),
            action: "autarch.gap-detection",
            mutatesState: false,
            preview: {
              suggestedGapCount: "1",
              suggestions: [],
            },
          },
        }) as never,
    });
    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-invalid-success-preview-shape",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview AUTARCH payload count diverges from suggestions", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () =>
        ({
          ok: true,
          payload: {
            ts: Date.now(),
            action: "autarch.gap-detection",
            mutatesState: false,
            preview: {
              suggestedGapCount: 2,
              suggestions: [
                {
                  suggestionId: "gap-1",
                  goalId: "goal-1",
                  severity: "high",
                  description: "First",
                },
              ],
            },
          },
        }) as never,
    });
    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-invalid-autarch-count",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview HELIOS payload ratios exceed bounds", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () =>
        ({
          ok: true,
          payload: {
            ts: Date.now(),
            action: "helios.trajectory-evaluation",
            mutatesState: false,
            preview: {
              goalId: "goal-1",
              goalStatus: "active",
              computedSnapshot: {
                at: Date.now(),
                completionRatio: 0.8,
                blockedRatio: 0.5,
                score: 0.6,
              },
              priorWindowSize: 1,
              divergence: null,
            },
          },
        }) as never,
    });
    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-invalid-helios-ratio-bounds",
        method: "prometheus.control.preview",
      },
      params: {
        action: "helios.trajectory-evaluation",
        goalId: "goal-1",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

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
