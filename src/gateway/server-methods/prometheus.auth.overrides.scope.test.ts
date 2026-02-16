import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPrometheusPlannedMutatingMethodMetadata,
  getPrometheusPlannedMutatingMethodPreflight,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
} from "./prometheus-methods.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import {
  getPrometheusPlannedMutatingPreviewActionMetadata,
  getPrometheusPlannedMutatingPreviewActionPreflight,
  PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
} from "./prometheus.control-preview.js";
import { createPrometheusHandlers } from "./prometheus.js";
import { runPrometheusReadRequest } from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override invocation scope", () => {
  it("does not invoke PROMETHEUS auth override resolvers for non-prometheus methods", async () => {
    const resolvePrometheusMethodMetadata = vi.fn(() => {
      throw new Error("method metadata resolver should not be called");
    });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error("planned metadata resolver should not be called");
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error("planned preflight resolver should not be called");
    });
    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "non-prometheus-auth-override-short-circuit",
        method: "status",
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusMethodMetadata,
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
    });

    expect(respond).toHaveBeenCalled();
    const [ok] = respond.mock.calls[0] as [boolean, unknown, unknown];
    expect(ok).toBe(true);
    expect(resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("invokes planned catalog resolvers for canonical planned method/action keys at request level", async () => {
    const plannedMethodKeys = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted();
    const plannedActionKeys = Object.keys(
      PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
    ).toSorted();
    const resolvePlannedMethodMetadata = vi.fn((method: string) =>
      getPrometheusPlannedMutatingMethodMetadata(method),
    );
    const resolvePlannedMethodPreflight = vi.fn((method: string) =>
      getPrometheusPlannedMutatingMethodPreflight(method),
    );
    const resolvePlannedActionMetadata = vi.fn((action: string) =>
      getPrometheusPlannedMutatingPreviewActionMetadata(action),
    );
    const resolvePlannedActionPreflight = vi.fn((action: string) =>
      getPrometheusPlannedMutatingPreviewActionPreflight(action),
    );

    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "catalog-planned-resolver-invocation-request-level",
        method: "prometheus.control.catalog",
        params: {},
      },
      respond,
      extraHandlers: createPrometheusHandlers({
        buildControlCatalogSnapshot: () =>
          buildPrometheusControlCatalogSnapshot({
            env: {},
            resolvePlannedMethodMetadata,
            resolvePlannedMethodPreflight,
            resolvePlannedActionMetadata,
            resolvePlannedActionPreflight,
          }),
      }),
    });

    expect(respond).toHaveBeenCalledWith(true, expect.any(Object), undefined);
    expect(resolvePlannedMethodMetadata).toHaveBeenCalledTimes(plannedMethodKeys.length);
    expect(resolvePlannedMethodPreflight).toHaveBeenCalledTimes(plannedMethodKeys.length);
    expect(resolvePlannedActionMetadata).toHaveBeenCalledTimes(plannedActionKeys.length);
    expect(resolvePlannedActionPreflight).toHaveBeenCalledTimes(plannedActionKeys.length);
    expect(resolvePlannedMethodMetadata.mock.calls.map(([method]) => method).toSorted()).toEqual(
      plannedMethodKeys,
    );
    expect(resolvePlannedMethodPreflight.mock.calls.map(([method]) => method).toSorted()).toEqual(
      plannedMethodKeys,
    );
    expect(resolvePlannedActionMetadata.mock.calls.map(([action]) => action).toSorted()).toEqual(
      plannedActionKeys,
    );
    expect(resolvePlannedActionPreflight.mock.calls.map(([action]) => action).toSorted()).toEqual(
      plannedActionKeys,
    );
  });
});
