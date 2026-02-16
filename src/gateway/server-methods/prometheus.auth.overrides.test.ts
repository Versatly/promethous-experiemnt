import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override regressions", () => {
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
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "non-prometheus-auth-override-short-circuit",
        method: "status",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "catalog-planned-resolver-invocation-request-level",
        method: "prometheus.control.catalog",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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

  it("returns UNAVAILABLE when injected catalog dependency violates summary invariants at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "catalog-summary-invariant-request-level",
        method: "prometheus.control.catalog",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      extraHandlers: createPrometheusHandlers({
        buildControlCatalogSnapshot: () => {
          const snapshot = buildPrometheusControlCatalogSnapshot();
          return {
            ...snapshot,
            summary: {
              ...snapshot.summary,
              writeMethods: snapshot.summary.writeMethods + 1,
            },
          } as never;
        },
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog dependency violates canonical method coverage at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "catalog-method-coverage-request-level",
        method: "prometheus.control.catalog",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      extraHandlers: createPrometheusHandlers({
        buildControlCatalogSnapshot: () => {
          const snapshot = buildPrometheusControlCatalogSnapshot();
          return {
            ...snapshot,
            methods: snapshot.methods.map((method, index, methods) =>
              index === methods.length - 1 ? (methods[0] ?? method) : method,
            ),
          } as never;
        },
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog dependency diverges planned metadata contract at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "catalog-planned-metadata-divergence-request-level",
        method: "prometheus.control.catalog",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      extraHandlers: createPrometheusHandlers({
        buildControlCatalogSnapshot: () => {
          const snapshot = buildPrometheusControlCatalogSnapshot();
          return {
            ...snapshot,
            guardrails: {
              ...snapshot.guardrails,
              plannedMutatingMethods: snapshot.guardrails.plannedMutatingMethods.map(
                (method, index) =>
                  index === 0
                    ? {
                        ...method,
                        reason: "DIVERGENT reason",
                      }
                    : method,
              ),
            },
          } as never;
        },
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog dependency diverges planned preflight contract at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "catalog-planned-preflight-divergence-request-level",
        method: "prometheus.control.catalog",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      extraHandlers: createPrometheusHandlers({
        buildControlCatalogSnapshot: () => {
          const snapshot = buildPrometheusControlCatalogSnapshot();
          return {
            ...snapshot,
            guardrails: {
              ...snapshot.guardrails,
              plannedMutatingPreviewActions: snapshot.guardrails.plannedMutatingPreviewActions.map(
                (action, index) =>
                  index === 0
                    ? {
                        ...action,
                        preflight: {
                          ...action.preflight,
                          disabledMessage: "DIVERGENT disabled message",
                        },
                      }
                    : action,
              ),
            },
          } as never;
        },
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });
});
