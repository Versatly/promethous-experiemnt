import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
import {
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
});
