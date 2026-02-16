import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";
import { ErrorCodes } from "../protocol/index.js";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  getPrometheusPlannedMutatingPreviewActionPreflight,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";
import { formatPrometheusMissingRequiredParamsMessage } from "./prometheus.preflight-guards.js";

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
  vi.unstubAllEnvs();
});

describe("prometheus control preview runtime flows", () => {
  it("returns INVALID_REQUEST for missing or unsupported actions", async () => {
    const missingAction = await runPrometheusControlPreview({});
    expect(missingAction).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: "action is required for prometheus.control.preview",
      },
    });

    const unsupportedAction = await runPrometheusControlPreview({
      action: "unknown.action",
    });
    expect(unsupportedAction).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "unknown.action"',
      },
    });
  });

  it("does not invoke planned-action resolvers for unsupported actions", async () => {
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("metadata resolver should not be called");
    });
    const resolvePlannedActionPreflight = vi.fn(() => {
      throw new Error("preflight resolver should not be called");
    });
    const result = await runPrometheusControlPreview(
      {
        action: "unknown.action",
      },
      {
        resolvePlannedActionMetadata,
        resolvePlannedActionPreflight,
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "unknown.action"',
      },
    });
    expect(resolvePlannedActionMetadata).not.toHaveBeenCalled();
    expect(resolvePlannedActionPreflight).not.toHaveBeenCalled();
  });

  it("does not invoke planned-action resolvers for active non-planned actions", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("metadata resolver should not be called");
    });
    const resolvePlannedActionPreflight = vi.fn(() => {
      throw new Error("preflight resolver should not be called");
    });
    const result = await runPrometheusControlPreview(
      {
        stateDir,
        action: "autarch.gap-detection",
      },
      {
        resolvePlannedActionMetadata,
        resolvePlannedActionPreflight,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("autarch.gap-detection");
    expect(resolvePlannedActionMetadata).not.toHaveBeenCalled();
    expect(resolvePlannedActionPreflight).not.toHaveBeenCalled();
  });

  it("returns AUTARCH gap-detection preview for blocked goals", async () => {
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
          goalId: "goal-autarch",
          title: "AUTARCH goal",
          objective: "Find missing capabilities",
          priority: 90,
        },
      },
      {
        id: "evt-goal-status",
        type: "goal.status-updated",
        occurredAt: 2,
        payload: {
          goalId: "goal-autarch",
          status: "blocked",
        },
      },
    ]);

    const result = await runPrometheusControlPreview({
      stateDir,
      action: "autarch.gap-detection",
      maxItems: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("autarch.gap-detection");
    expect(result.payload.mutatesState).toBe(false);
    expect(result.payload.preview).toEqual(
      expect.objectContaining({
        suggestedGapCount: expect.any(Number),
        suggestions: expect.arrayContaining([
          expect.objectContaining({
            goalId: "goal-autarch",
          }),
        ]),
      }),
    );
  });

  it("returns HELIOS trajectory-evaluation preview with computed snapshot", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-helios",
        title: "HELIOS goal",
        objective: "Evaluate trajectory",
        priority: 88,
      },
    });
    await trajectoryStore.append({
      goalId: "goal-helios",
      snapshot: {
        at: 2,
        completionRatio: 0.3,
        blockedRatio: 0.1,
        score: 0.5,
      },
    });

    const result = await runPrometheusControlPreview({
      stateDir,
      action: "helios.trajectory-evaluation",
      goalId: "goal-helios",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("helios.trajectory-evaluation");
    expect(result.payload.preview).toEqual(
      expect.objectContaining({
        goalId: "goal-helios",
        goalStatus: "active",
        priorWindowSize: 1,
        computedSnapshot: expect.objectContaining({
          completionRatio: expect.any(Number),
          score: expect.any(Number),
        }),
      }),
    );
  });

  it("returns recursion mutation-evaluation preview with accepted decision", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-recursion",
        title: "Recursion goal",
        objective: "Evaluate mutation",
        priority: 91,
      },
    });

    const result = await runPrometheusControlPreview({
      stateDir,
      action: "recursion.mutation-evaluation",
      proposal: {
        mutationId: "mut-1",
        title: "Increase planning horizon",
        hypothesis: "improves objective fit",
        risk: "low",
        expectedGain: 0.09,
      },
      baseline: {
        objectiveFit: 0.5,
        stability: 0.75,
        throughput: 0.55,
      },
      candidate: {
        objectiveFit: 0.66,
        stability: 0.76,
        throughput: 0.57,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("recursion.mutation-evaluation");
    expect(result.payload.preview).toEqual(
      expect.objectContaining({
        evaluation: expect.objectContaining({
          mutationId: "mut-1",
          accepted: expect.any(Boolean),
          scoreDelta: expect.any(Number),
        }),
      }),
    );
  });

  it("returns INVALID_REQUEST when recursion preview is missing required snapshots", async () => {
    const result = await runPrometheusControlPreview({
      action: "recursion.mutation-evaluation",
      proposal: {
        mutationId: "mut-1",
        title: "Incomplete proposal",
        hypothesis: "missing snapshots",
      },
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: formatPrometheusMissingRequiredParamsMessage({
          kind: "action",
          name: "recursion.mutation-evaluation",
          missingParams: ["baseline", "candidate"],
        }),
      },
    });
  });

  it("returns INVALID_REQUEST when HELIOS preview is missing required params", async () => {
    const result = await runPrometheusControlPreview({
      action: "helios.trajectory-evaluation",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: formatPrometheusMissingRequiredParamsMessage({
          kind: "action",
          name: "helios.trajectory-evaluation",
          missingParams: ["goalId"],
        }),
      },
    });
  });

  it("returns UNAVAILABLE when planned mutating action is disabled", async () => {
    const preflight = getPrometheusPlannedMutatingPreviewActionPreflight(
      "autarch.gap-detection.commit",
    );
    expect(preflight).toBeDefined();
    if (!preflight) {
      return;
    }
    const result = await runPrometheusControlPreview({
      action: "autarch.gap-detection.commit",
      goalId: "goal-1",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.disabledMessage,
      },
    });
  });

  it("returns UNAVAILABLE for planned mutating actions even when env guard is enabled", async () => {
    const preflight = getPrometheusPlannedMutatingPreviewActionPreflight(
      "autarch.gap-detection.commit",
    );
    expect(preflight).toBeDefined();
    if (!preflight) {
      return;
    }
    vi.stubEnv(PROMETHEUS_MUTATING_CONTROLS_ENV, "1");
    const result = await runPrometheusControlPreview({
      action: "autarch.gap-detection.commit",
      goalId: "goal-1",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.notImplementedMessage,
      },
    });
  });

  it("falls back to metadata when planned-action preflight resolver misses", async () => {
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(
      "autarch.gap-detection.commit",
    );
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const fallbackPreflight = buildPrometheusPlannedMutatingPreviewActionPreflight({
      action: "autarch.gap-detection.commit",
      metadata,
    });
    const result = await runPrometheusControlPreview(
      {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      {
        resolvePlannedActionPreflight: () => undefined,
        resolvePlannedActionMetadata: () => metadata,
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.UNAVAILABLE,
        message: fallbackPreflight.disabledMessage,
      },
    });
  });

  it("falls back to metadata when planned-action preflight resolver returns malformed object", async () => {
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(
      "autarch.gap-detection.commit",
    );
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const fallbackPreflight = buildPrometheusPlannedMutatingPreviewActionPreflight({
      action: "autarch.gap-detection.commit",
      metadata,
    });
    const result = await runPrometheusControlPreview(
      {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      {
        resolvePlannedActionPreflight: () =>
          ({
            disabledMessage: 123,
          }) as never,
        resolvePlannedActionMetadata: () => metadata,
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.UNAVAILABLE,
        message: fallbackPreflight.disabledMessage,
      },
    });
  });

  it("falls back to canonical preflight when planned-action resolver returns divergent valid preflight", async () => {
    const canonicalPreflight = getPrometheusPlannedMutatingPreviewActionPreflight(
      "autarch.gap-detection.commit",
    );
    expect(canonicalPreflight).toBeDefined();
    if (!canonicalPreflight) {
      return;
    }
    const result = await runPrometheusControlPreview(
      {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      {
        resolvePlannedActionPreflight: () => ({
          disabledMessage: "DIVERGENT disabled message",
          notImplementedMessage: "DIVERGENT not implemented message",
          requiredParamsMessage: "DIVERGENT required params message",
        }),
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.UNAVAILABLE,
        message: canonicalPreflight.disabledMessage,
      },
    });
  });

  it("returns UNAVAILABLE when planned-action metadata resolver returns malformed object", async () => {
    const preflight = getPrometheusPlannedMutatingPreviewActionPreflight(
      "autarch.gap-detection.commit",
    );
    expect(preflight).toBeDefined();
    if (!preflight) {
      return;
    }
    const result = await runPrometheusControlPreview(
      {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      {
        resolvePlannedActionMetadata: () =>
          ({
            mutatesState: true,
            enabled: false,
            enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
            requiredParams: ["goalId", "goalId"],
            reason: "invalid required params",
          }) as never,
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.disabledMessage,
      },
    });
  });

  it("returns UNAVAILABLE when planned-action metadata reason is blank", async () => {
    const preflight = getPrometheusPlannedMutatingPreviewActionPreflight(
      "autarch.gap-detection.commit",
    );
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(
      "autarch.gap-detection.commit",
    );
    expect(preflight).toBeDefined();
    expect(metadata).toBeDefined();
    if (!preflight || !metadata) {
      return;
    }
    const result = await runPrometheusControlPreview(
      {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      {
        resolvePlannedActionMetadata: () =>
          ({
            mutatesState: true,
            enabled: false,
            enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
            requiredParams: [...metadata.requiredParams],
            reason: " ",
          }) as never,
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.disabledMessage,
      },
    });
  });
});
