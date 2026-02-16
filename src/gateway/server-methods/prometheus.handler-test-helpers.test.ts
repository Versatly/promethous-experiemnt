import { describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import {
  runPrometheusControlCatalogHandler,
  runPrometheusControlPreviewHandler,
  runPrometheusHandler,
} from "./prometheus.handler-test-helpers.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheus handler test helpers", () => {
  it("runs generic helper for non-control prometheus handlers", async () => {
    const respond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.status",
      requestId: "handler-helper-generic-status",
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.any(Object),
      }),
      undefined,
    );
  });

  it("runs control catalog handler with default prometheus handlers", async () => {
    const respond = vi.fn();
    await runPrometheusControlCatalogHandler({
      requestId: "handler-helper-catalog-default",
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.any(Object),
      }),
      undefined,
    );
  });

  it("runs control preview handler with default prometheus handlers", async () => {
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      requestId: "handler-helper-preview-default",
      respond,
      params: {
        action: "autarch.gap-detection",
      },
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "autarch.gap-detection",
        mutatesState: false,
      }),
      undefined,
    );
  });

  it("forwards injected handlers for control catalog helper", async () => {
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot: () => {
        throw new Error("catalog helper forwards injected handlers");
      },
    });
    const respond = vi.fn();
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "handler-helper-catalog-injected",
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("catalog helper forwards injected handlers"),
      }),
    );
  });

  it("forwards injected handlers for control preview helper", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () => {
        throw new Error("preview helper forwards injected handlers");
      },
    });
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      handlers,
      requestId: "handler-helper-preview-injected",
      respond,
      params: {
        action: "autarch.gap-detection",
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("preview helper forwards injected handlers"),
      }),
    );
  });
});
