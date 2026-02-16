import { describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers dependency isolation", () => {
  it("does not invoke control-preview runner dependency for catalog requests", async () => {
    const runControlPreview = vi.fn(async () => {
      throw new Error("control preview dependency should not be called");
    });
    const buildControlCatalogSnapshot = vi.fn(() =>
      buildPrometheusControlCatalogSnapshot({ env: {}, now: 123 }),
    );
    const handlers = createPrometheusHandlers({
      runControlPreview,
      buildControlCatalogSnapshot,
    });

    const respond = vi.fn();
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "catalog-dependency-isolation",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ts: 123,
      }),
      undefined,
    );
    expect(buildControlCatalogSnapshot).toHaveBeenCalledTimes(1);
    expect(runControlPreview).not.toHaveBeenCalled();
  });

  it("does not invoke control-catalog snapshot dependency for preview requests", async () => {
    const buildControlCatalogSnapshot = vi.fn(() => {
      throw new Error("catalog snapshot dependency should not be called");
    });
    const runControlPreview = vi.fn(async () => ({
      ok: true as const,
      payload: {
        ts: 456,
        action: "autarch.gap-detection" as const,
        mutatesState: false as const,
        preview: {
          suggestedGapCount: 0,
          suggestions: [],
        },
      },
    }));
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot,
      runControlPreview,
    });

    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "preview-dependency-isolation",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ts: 456,
        action: "autarch.gap-detection",
      }),
      undefined,
    );
    expect(runControlPreview).toHaveBeenCalledTimes(1);
    expect(buildControlCatalogSnapshot).not.toHaveBeenCalled();
  });
});
