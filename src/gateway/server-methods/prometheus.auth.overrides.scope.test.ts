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
import {
  runPrometheusNodeRequest,
  runPrometheusOperatorRequest,
  runPrometheusReadRequest,
} from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override invocation scope", () => {
  it("does not invoke PROMETHEUS auth overrides when role short-circuit denies node clients", async () => {
    const resolvePrometheusMethodMetadata = vi.fn(() => {
      throw new Error("method metadata resolver should not be called for node role");
    });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error("planned metadata resolver should not be called for node role");
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error("planned preflight resolver should not be called for node role");
    });
    const respond = vi.fn();
    await runPrometheusNodeRequest({
      request: {
        id: "node-role-auth-override-short-circuit",
        method: "prometheus.control.execute",
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusMethodMetadata,
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: node"),
      }),
    );
    expect(resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

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

  it("does not invoke PROMETHEUS auth overrides for unknown prometheus-prefixed methods", async () => {
    const method = "prometheus.unknown.gateway.method";
    const resolvePrometheusMethodMetadata = vi.fn(() => {
      throw new Error("method metadata resolver should not be called for unknown methods");
    });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error("planned metadata resolver should not be called for unknown methods");
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error("planned preflight resolver should not be called for unknown methods");
    });
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "unknown-prometheus-method-auth-override-short-circuit",
        method,
        params: {},
      },
      respond,
      scopes: ["operator.admin"],
      authOverrides: {
        resolvePrometheusMethodMetadata,
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: `unknown method: ${method}`,
      }),
    );
    expect(resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("does not dispatch injected unknown handlers when unknown method is scope-denied", async () => {
    const method = "prometheus.unknown.gateway.method";
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const resolvePrometheusMethodMetadata = vi.fn(() => {
      throw new Error(
        "method metadata resolver should not be called for unknown scope-denied method",
      );
    });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error(
        "planned metadata resolver should not be called for unknown scope-denied method",
      );
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error(
        "planned preflight resolver should not be called for unknown scope-denied method",
      );
    });
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "unknown-prometheus-method-scope-denied-before-handler-dispatch",
        method,
        params: {},
      },
      respond,
      scopes: ["operator.read"],
      authOverrides: {
        resolvePrometheusMethodMetadata,
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
      extraHandlers: {
        [method]: unknownMethodHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("missing scope: operator.admin"),
      }),
    );
    expect(unknownMethodHandler).not.toHaveBeenCalled();
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
