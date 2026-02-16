import { describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import { runPrometheusControlCatalogHandler } from "./prometheus.handler-test-helpers.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers.prometheus.control.catalog injected coherence validation", () => {
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
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "control-catalog-invalid-summary",
      respond,
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
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "control-catalog-invalid-read-write-summary",
      respond,
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
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "control-catalog-divergent-planned-method",
      respond,
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
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "control-catalog-divergent-planned-action-preflight",
      respond,
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
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "control-catalog-divergent-method-coverage",
      respond,
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
