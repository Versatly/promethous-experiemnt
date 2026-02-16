import { describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext, GatewayRequestHandlers } from "./types.js";
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

  it("forwards method, params, and context through generic helper", async () => {
    const context = { marker: "ctx" } as GatewayRequestContext;
    const handler = vi.fn(async ({ req, params, context: receivedContext, respond }) => {
      expect(req.id).toBe("handler-helper-generic-forwarding");
      expect(req.method).toBe("prometheus.status");
      expect(params).toEqual({ stateDir: "/tmp/state-dir" });
      expect(receivedContext).toBe(context);
      respond(true, { ok: true }, undefined);
    });
    const handlers: GatewayRequestHandlers = {
      "prometheus.status": handler,
    };
    const respond = vi.fn();
    await runPrometheusHandler({
      handlers,
      method: "prometheus.status",
      requestId: "handler-helper-generic-forwarding",
      params: { stateDir: "/tmp/state-dir" },
      context,
      respond,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("uses default empty params/context for generic helper", async () => {
    const handler = vi.fn(async ({ params, context, respond }) => {
      expect(params).toEqual({});
      expect(context).toEqual({});
      respond(true, { ok: true }, undefined);
    });
    const handlers: GatewayRequestHandlers = {
      "prometheus.status": handler,
    };
    const respond = vi.fn();
    await runPrometheusHandler({
      handlers,
      method: "prometheus.status",
      requestId: "handler-helper-generic-defaults",
      respond,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("delegates control wrapper helpers to canonical method keys", async () => {
    const catalogHandler = vi.fn(async ({ req, params, respond }) => {
      expect(req.method).toBe("prometheus.control.catalog");
      expect(params).toEqual({ stateDir: "/tmp/catalog-state" });
      respond(true, { method: req.method }, undefined);
    });
    const previewHandler = vi.fn(async ({ req, params, respond }) => {
      expect(req.method).toBe("prometheus.control.preview");
      expect(params).toEqual({ action: "autarch.gap-detection" });
      respond(true, { method: req.method }, undefined);
    });
    const handlers: GatewayRequestHandlers = {
      "prometheus.control.catalog": catalogHandler,
      "prometheus.control.preview": previewHandler,
    };

    const catalogRespond = vi.fn();
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "handler-helper-wrapper-catalog",
      params: { stateDir: "/tmp/catalog-state" },
      respond: catalogRespond,
    });
    expect(catalogHandler).toHaveBeenCalledTimes(1);
    expect(catalogRespond).toHaveBeenCalledWith(
      true,
      { method: "prometheus.control.catalog" },
      undefined,
    );

    const previewRespond = vi.fn();
    await runPrometheusControlPreviewHandler({
      handlers,
      requestId: "handler-helper-wrapper-preview",
      params: { action: "autarch.gap-detection" },
      respond: previewRespond,
    });
    expect(previewHandler).toHaveBeenCalledTimes(1);
    expect(previewRespond).toHaveBeenCalledWith(
      true,
      { method: "prometheus.control.preview" },
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

  it("throws descriptive error when generic helper target handler is missing", async () => {
    await expect(
      runPrometheusHandler({
        handlers: {},
        method: "prometheus.status",
        requestId: "handler-helper-missing-generic",
        respond: vi.fn(),
      }),
    ).rejects.toThrow('Missing PROMETHEUS handler for method "prometheus.status"');
  });

  it("throws descriptive error when wrapper helper target handler is missing", async () => {
    await expect(
      runPrometheusControlPreviewHandler({
        handlers: {
          "prometheus.control.catalog": async () => undefined,
        },
        requestId: "handler-helper-missing-wrapper",
        params: {
          action: "autarch.gap-detection",
        },
        respond: vi.fn(),
      }),
    ).rejects.toThrow('Missing PROMETHEUS handler for method "prometheus.control.preview"');
  });

  it("throws descriptive error when catalog wrapper helper target handler is missing", async () => {
    await expect(
      runPrometheusControlCatalogHandler({
        handlers: {
          "prometheus.control.preview": async () => undefined,
        },
        requestId: "handler-helper-missing-catalog-wrapper",
        respond: vi.fn(),
      }),
    ).rejects.toThrow('Missing PROMETHEUS handler for method "prometheus.control.catalog"');
  });
});
