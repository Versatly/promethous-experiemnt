import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./prometheus-methods.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
} from "./prometheus.control-preview.js";
import { prometheusHandlers } from "./prometheus.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prometheusHandlers.prometheus.control.catalog", () => {
  it("returns control-surface metadata for method and action contracts", async () => {
    const respond = vi.fn();
    await prometheusHandlers["prometheus.control.catalog"]({
      req: { type: "req", id: "control-catalog-1", method: "prometheus.control.catalog" },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });
    const plannedMethodMetadata = getPrometheusPlannedMutatingMethodMetadata(
      "prometheus.control.execute",
    );
    const plannedActionMetadata = getPrometheusPlannedMutatingPreviewActionMetadata(
      "autarch.gap-detection.commit",
    );
    expect(plannedMethodMetadata).toBeDefined();
    expect(plannedActionMetadata).toBeDefined();
    if (!plannedMethodMetadata || !plannedActionMetadata) {
      return;
    }

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.objectContaining({
          totalMethods: expect.any(Number),
          readMethods: expect.any(Number),
          writeMethods: expect.any(Number),
          mutatingMethods: 0,
          plannedMutatingMethods: 3,
          previewActions: 3,
          mutatingPreviewActions: 0,
          plannedMutatingPreviewActions: 3,
        }),
        guardrails: expect.objectContaining({
          mutationsEnabled: false,
          enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
          mutatingMethods: [],
          mutatingPreviewActions: [],
          plannedMutatingMethods: expect.arrayContaining([
            expect.objectContaining({
              method: "prometheus.control.execute",
              access: "write",
              mutatesState: true,
              enabled: false,
              enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
              requiredParams: ["action"],
              preflight: buildPrometheusPlannedMutatingMethodPreflight({
                method: "prometheus.control.execute",
                metadata: plannedMethodMetadata,
              }),
            }),
          ]),
          plannedMutatingPreviewActions: expect.arrayContaining([
            expect.objectContaining({
              action: "autarch.gap-detection.commit",
              mutatesState: true,
              enabled: false,
              enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
              preflight: buildPrometheusPlannedMutatingPreviewActionPreflight({
                action: "autarch.gap-detection.commit",
                metadata: plannedActionMetadata,
              }),
            }),
          ]),
        }),
        methods: expect.arrayContaining([
          expect.objectContaining({
            method: "prometheus.control.catalog",
            access: "read",
            mutatesState: false,
          }),
          expect.objectContaining({
            method: "prometheus.control.preview",
            access: "write",
            mutatesState: false,
          }),
        ]),
        controlPreview: expect.objectContaining({
          method: "prometheus.control.preview",
          actions: expect.arrayContaining([
            expect.objectContaining({
              action: "autarch.gap-detection",
              mutatesState: false,
              requiredParams: [],
            }),
            expect.objectContaining({
              action: "helios.trajectory-evaluation",
              mutatesState: false,
              requiredParams: ["goalId"],
            }),
            expect.objectContaining({
              action: "recursion.mutation-evaluation",
              mutatesState: false,
              requiredParams: ["proposal", "baseline", "candidate"],
            }),
          ]),
        }),
      }),
      undefined,
    );
  });

  it("reflects env-enabled mutating control guardrail state", async () => {
    vi.stubEnv(PROMETHEUS_MUTATING_CONTROLS_ENV, "1");
    const respond = vi.fn();
    await prometheusHandlers["prometheus.control.catalog"]({
      req: { type: "req", id: "control-catalog-2", method: "prometheus.control.catalog" },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        guardrails: expect.objectContaining({
          mutationsEnabled: true,
          enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
        }),
      }),
      undefined,
    );
  });
});
