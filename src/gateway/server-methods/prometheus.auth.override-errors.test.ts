import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override error handling", () => {
  it("returns UNAVAILABLE when injected auth override resolver throws", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-auth-override-throws",
        method: "prometheus.control.execute",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "auth-method-metadata-override-throws",
        method: "prometheus.status",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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

  it("returns UNAVAILABLE when injected planned preflight auth override throws", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "auth-planned-preflight-override-throws",
        method: "prometheus.control.execute",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
