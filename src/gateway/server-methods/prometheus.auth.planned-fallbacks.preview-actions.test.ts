import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";
import { createPrometheusHandlers } from "./prometheus.js";
import { runPrometheusWriteRequest } from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization planned preview-action fallback regressions", () => {
  it("keeps planned-action UNAVAILABLE fallback at request handling when preflight resolver misses", async () => {
    const action = "autarch.gap-detection.commit";
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(action);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingPreviewActionPreflight({
      action,
      metadata,
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-action-fallback-request-level",
        method: "prometheus.control.preview",
        params: {
          action,
          goalId: "goal-1",
        },
      },
      respond,
      extraHandlers: createPrometheusHandlers({
        runControlPreview: (params, deps) =>
          runPrometheusControlPreview(params, {
            ...deps,
            resolvePlannedActionPreflight: () => undefined,
            resolvePlannedActionMetadata: () => metadata,
          }),
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: preflight.disabledMessage,
      }),
    );
  });

  it("keeps planned-action canonical preflight at request handling when resolver returns divergent valid preflight", async () => {
    const action = "autarch.gap-detection.commit";
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(action);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingPreviewActionPreflight({
      action,
      metadata,
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-action-divergent-preflight-request-level",
        method: "prometheus.control.preview",
        params: {
          action,
          goalId: "goal-1",
        },
      },
      respond,
      extraHandlers: createPrometheusHandlers({
        runControlPreview: (params, deps) =>
          runPrometheusControlPreview(params, {
            ...deps,
            resolvePlannedActionPreflight: () => ({
              disabledMessage: "DIVERGENT disabled message",
              notImplementedMessage: "DIVERGENT not implemented message",
              requiredParamsMessage: "DIVERGENT required params message",
            }),
          }),
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: preflight.disabledMessage,
      }),
    );
  });
});
