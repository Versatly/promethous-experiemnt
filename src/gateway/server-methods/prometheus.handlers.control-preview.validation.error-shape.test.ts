import { describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { runPrometheusControlPreviewHandler } from "./prometheus.handler-test-helpers.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers.prometheus.control.preview injected error normalization", () => {
  it("returns UNAVAILABLE when injected control preview runner throws", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () => {
        throw new Error("control preview dependency exploded");
      },
    });
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      handlers,
      requestId: "control-preview-dependency-error",
      params: {
        action: "autarch.gap-detection",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("control preview dependency exploded"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview result shape is invalid", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () => ({ ok: true }) as never,
    });
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      handlers,
      requestId: "control-preview-invalid-shape",
      params: {
        action: "autarch.gap-detection",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview error code is invalid", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () =>
        ({
          ok: false,
          error: {
            code: "BOOM",
            message: "unexpected",
          },
        }) as never,
    });
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      handlers,
      requestId: "control-preview-invalid-error-code",
      params: {
        action: "autarch.gap-detection",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });
});
