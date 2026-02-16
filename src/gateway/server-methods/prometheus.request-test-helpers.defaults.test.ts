import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runPrometheusNodeRequest,
  runPrometheusOperatorRequest,
  runPrometheusReadRequest,
  runPrometheusWriteRequest,
} from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prometheus request test helpers (defaults and scopes)", () => {
  it("uses write-scope operator defaults for write helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "request-helper-write-defaults",
        method: "prometheus.status",
        params: {},
      },
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

  it("uses read-scope operator defaults for read helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "request-helper-read-defaults",
        method: "prometheus.control.preview",
        params: {
          action: "autarch.gap-detection",
        },
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("operator.write"),
      }),
    );
  });

  it("uses node-role defaults for node helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusNodeRequest({
      request: {
        id: "request-helper-node-defaults",
        method: "prometheus.status",
        params: {},
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: node"),
      }),
    );
  });

  it("applies explicit scopes for operator helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "request-helper-operator-scopes",
        method: "prometheus.status",
        params: {},
      },
      respond,
      scopes: [],
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("operator.read"),
      }),
    );
  });

  it("forwards authOverrides through helper requests", async () => {
    const resolvePrometheusMethodMetadata = vi.fn(() => ({
      access: "read",
      mutatesState: false,
    }));
    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "request-helper-auth-overrides",
        method: "prometheus.status",
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusMethodMetadata,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.any(Object),
      }),
      undefined,
    );
    expect(resolvePrometheusMethodMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePrometheusMethodMetadata).toHaveBeenCalledWith("prometheus.status");
  });
});
