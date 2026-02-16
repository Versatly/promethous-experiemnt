import { describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import { runPrometheusControlCatalogHandler } from "./prometheus.handler-test-helpers.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers.prometheus.control.catalog injected snapshot validation", () => {
  it("returns UNAVAILABLE when injected catalog snapshot builder throws", async () => {
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot: () => {
        throw new Error("catalog dependency exploded");
      },
    });
    const respond = vi.fn();
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "control-catalog-dependency-error",
      respond,
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
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "control-catalog-invalid-shape",
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
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "control-catalog-invalid-nested-shape",
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
