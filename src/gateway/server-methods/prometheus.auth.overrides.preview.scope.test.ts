import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";
import { createPrometheusHandlers } from "./prometheus.js";
import {
  runPrometheusOperatorRequest,
  runPrometheusWriteRequest,
} from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override invocation scope (control preview)", () => {
  it("does not invoke injected Prometheus preview dependencies for non-prometheus request methods", async () => {
    const runControlPreview = vi.fn(async () => {
      throw new Error("preview dependency should not be called");
    });
    const buildControlCatalogSnapshot = vi.fn(() => {
      throw new Error("catalog dependency should not be called");
    });
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "non-prometheus-extra-handler-short-circuit",
        method: "status",
        params: {},
      },
      respond,
      scopes: ["operator.read"],
      extraHandlers: createPrometheusHandlers({
        runControlPreview,
        buildControlCatalogSnapshot,
      }),
    });

    expect(respond).toHaveBeenCalled();
    const [ok] = respond.mock.calls[0] as [boolean, unknown, unknown];
    expect(ok).toBe(true);
    expect(runControlPreview).not.toHaveBeenCalled();
    expect(buildControlCatalogSnapshot).not.toHaveBeenCalled();
  });

  it("invokes planned-action resolvers once for planned action request path", async () => {
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
    const resolvePlannedActionMetadata = vi.fn((requestedAction: string) =>
      getPrometheusPlannedMutatingPreviewActionMetadata(requestedAction),
    );
    const resolvePlannedActionPreflight = vi.fn((requestedAction: string) => {
      const requestedMetadata = getPrometheusPlannedMutatingPreviewActionMetadata(requestedAction);
      if (!requestedMetadata) {
        return undefined;
      }
      return buildPrometheusPlannedMutatingPreviewActionPreflight({
        action: requestedAction,
        metadata: requestedMetadata,
      });
    });

    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-action-resolver-invocation-scope-request-level",
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
            resolvePlannedActionMetadata,
            resolvePlannedActionPreflight,
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
    expect(resolvePlannedActionMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePlannedActionPreflight).toHaveBeenCalledTimes(1);
    expect(resolvePlannedActionMetadata).toHaveBeenCalledWith(action);
    expect(resolvePlannedActionPreflight).toHaveBeenCalledWith(action);
  });

  it("does not invoke planned-action resolvers for active non-planned action request path", async () => {
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("planned-action metadata resolver should not be called");
    });
    const resolvePlannedActionPreflight = vi.fn(() => {
      throw new Error("planned-action preflight resolver should not be called");
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "active-action-resolver-short-circuit-request-level",
        method: "prometheus.control.preview",
        params: {
          action: "autarch.gap-detection",
        },
      },
      respond,
      extraHandlers: createPrometheusHandlers({
        runControlPreview: (params, deps) =>
          runPrometheusControlPreview(params, {
            ...deps,
            resolvePlannedActionMetadata,
            resolvePlannedActionPreflight,
          }),
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "autarch.gap-detection",
        mutatesState: false,
      }),
      undefined,
    );
    expect(resolvePlannedActionMetadata).not.toHaveBeenCalled();
    expect(resolvePlannedActionPreflight).not.toHaveBeenCalled();
  });
});
