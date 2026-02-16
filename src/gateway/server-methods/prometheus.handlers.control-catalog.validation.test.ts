import { describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { ErrorCodes } from "../protocol/index.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers.prometheus.control.catalog injected snapshot validation", () => {
  it("returns UNAVAILABLE when injected catalog snapshot builder throws", async () => {
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot: () => {
        throw new Error("catalog dependency exploded");
      },
    });
    const respond = vi.fn();
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "control-catalog-dependency-error",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("catalog dependency exploded"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog snapshot shape is invalid", async () => {
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot: () => ({ ts: Date.now() }) as never,
    });
    const respond = vi.fn();
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "control-catalog-invalid-shape",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog snapshot has invalid nested entries", async () => {
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot: () => {
        const snapshot = buildPrometheusControlCatalogSnapshot();
        return {
          ...snapshot,
          guardrails: {
            ...snapshot.guardrails,
            plannedMutatingMethods: [
              {
                ...snapshot.guardrails.plannedMutatingMethods[0],
                requiredParams: 123,
              },
            ],
          },
        } as never;
      },
    });
    const respond = vi.fn();
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "control-catalog-invalid-nested-shape",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog snapshot summary is inconsistent", async () => {
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot: () => {
        const snapshot = buildPrometheusControlCatalogSnapshot();
        return {
          ...snapshot,
          summary: {
            ...snapshot.summary,
            totalMethods: snapshot.summary.totalMethods + 1,
          },
        } as never;
      },
    });
    const respond = vi.fn();
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "control-catalog-invalid-summary",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog snapshot read/write summary diverges from methods", async () => {
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot: () => {
        const snapshot = buildPrometheusControlCatalogSnapshot();
        return {
          ...snapshot,
          summary: {
            ...snapshot.summary,
            readMethods: snapshot.summary.readMethods + 1,
          },
        } as never;
      },
    });
    const respond = vi.fn();
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "control-catalog-invalid-read-write-summary",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog snapshot planned-method metadata diverges from canonical contract", async () => {
    const handlers = createPrometheusHandlers({
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
    });
    const respond = vi.fn();
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "control-catalog-divergent-planned-method",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog snapshot planned-action preflight diverges from canonical contract", async () => {
    const handlers = createPrometheusHandlers({
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
    });
    const respond = vi.fn();
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "control-catalog-divergent-planned-action-preflight",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog snapshot method list diverges from canonical coverage", async () => {
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot: () => {
        const snapshot = buildPrometheusControlCatalogSnapshot();
        return {
          ...snapshot,
          methods: snapshot.methods.map((method, index, methods) =>
            index === methods.length - 1 ? (methods[0] ?? method) : method,
          ),
        } as never;
      },
    });
    const respond = vi.fn();
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "control-catalog-divergent-method-coverage",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });
});
