import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import { createPrometheusHandlers } from "./prometheus.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override regressions", () => {
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
