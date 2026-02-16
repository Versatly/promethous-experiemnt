import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrometheusHandlers } from "./prometheus.js";
import {
  runPrometheusReadRequest,
  runPrometheusWriteRequest,
} from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override error handling", () => {
  it("does not invoke throwing planned auth resolvers on active non-planned methods", async () => {
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error("planned metadata override should not be called");
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error("planned preflight override should not be called");
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-override-throw-non-planned-method",
        method: "prometheus.control.preview",
        params: {
          action: "autarch.gap-detection",
        },
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
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
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("returns UNAVAILABLE when injected auth override resolver throws", async () => {
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-auth-override-throws",
        method: "prometheus.control.execute",
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodMetadata: () => {
          throw new Error("auth override dependency exploded");
        },
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("auth override dependency exploded"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected method metadata auth override throws", async () => {
    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "auth-method-metadata-override-throws",
        method: "prometheus.status",
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusMethodMetadata: () => {
          throw new Error("method metadata override exploded");
        },
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("method metadata override exploded"),
      }),
    );
  });

  it("does not invoke injected handlers when auth override resolver throws", async () => {
    const runControlPreview = vi.fn(async () => {
      throw new Error("control preview handler should not be called");
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "auth-override-throw-short-circuits-injected-handler",
        method: "prometheus.control.preview",
        params: {
          action: "autarch.gap-detection",
        },
      },
      respond,
      authOverrides: {
        resolvePrometheusMethodMetadata: () => {
          throw new Error("method metadata override exploded before handler dispatch");
        },
      },
      extraHandlers: createPrometheusHandlers({
        runControlPreview,
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining(
          "method metadata override exploded before handler dispatch",
        ),
      }),
    );
    expect(runControlPreview).not.toHaveBeenCalled();
  });

  it("returns UNAVAILABLE when injected planned preflight auth override throws", async () => {
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "auth-planned-preflight-override-throws",
        method: "prometheus.control.execute",
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodPreflight: () => {
          throw new Error("planned preflight override exploded");
        },
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("planned preflight override exploded"),
      }),
    );
  });
});
