import { describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { ErrorCodes } from "../protocol/index.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers.prometheus.control.preview injected error normalization", () => {
  it("returns UNAVAILABLE when injected control preview runner throws", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () => {
        throw new Error("control preview dependency exploded");
      },
    });
    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-dependency-error",
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
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-invalid-shape",
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
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "control-preview-invalid-error-code",
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
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });
});
