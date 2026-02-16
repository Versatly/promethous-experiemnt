import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  getPrometheusPlannedMutatingPreviewActionPreflight,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prometheus control preview runtime flows (planned actions)", () => {
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

  it("invokes planned-action resolvers only for the requested planned action", async () => {
    const action = "autarch.gap-detection.commit";
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(action);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const resolvePlannedActionMetadata = vi.fn((requestedAction: string) =>
      getPrometheusPlannedMutatingPreviewActionMetadata(requestedAction),
    );
    const resolvePlannedActionPreflight = vi.fn((requestedAction: string) =>
      getPrometheusPlannedMutatingPreviewActionPreflight(requestedAction),
    );

    const result = await runPrometheusControlPreview(
      {
        action,
        goalId: "goal-1",
      },
      {
        resolvePlannedActionMetadata,
        resolvePlannedActionPreflight,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining(`"${action}" is disabled`),
      },
    });
    expect(resolvePlannedActionMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePlannedActionPreflight).toHaveBeenCalledTimes(1);
    expect(resolvePlannedActionMetadata).toHaveBeenCalledWith(action);
    expect(resolvePlannedActionPreflight).toHaveBeenCalledWith(action);
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
