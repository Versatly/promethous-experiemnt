import { afterEach, describe, expect, it, vi } from "vitest";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
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

describe("PROMETHEUS gateway authorization override fallback regressions (control preview)", () => {
  it("keeps planned-action canonical metadata fallback at request level when injected metadata resolver returns malformed shape", async () => {
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
        id: "planned-action-malformed-metadata-request-level",
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
            resolvePlannedActionMetadata: () =>
              ({
                mutatesState: true,
                enabled: false,
                enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
                requiredParams: ["goalId", "goalId"],
                reason: "invalid required params",
              }) as never,
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
