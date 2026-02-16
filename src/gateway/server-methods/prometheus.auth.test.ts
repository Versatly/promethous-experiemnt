import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { listGatewayMethods } from "../server-methods-list.js";
import { handleGatewayRequest } from "../server-methods.js";
import {
  PROMETHEUS_GATEWAY_METHODS,
  PROMETHEUS_GATEWAY_READ_METHODS,
  PROMETHEUS_GATEWAY_WRITE_METHODS,
} from "./prometheus-methods.js";

const READ_METHODS = PROMETHEUS_GATEWAY_READ_METHODS;
const WRITE_METHODS = PROMETHEUS_GATEWAY_WRITE_METHODS;
const ALL_METHODS = PROMETHEUS_GATEWAY_METHODS;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization", () => {
  it("covers every prometheus.* method exposed in gateway method list", () => {
    const prometheusMethods = listGatewayMethods()
      .filter((method) => method.startsWith("prometheus."))
      .toSorted();
    expect(prometheusMethods).toEqual([...ALL_METHODS].toSorted());
    expect(new Set([...READ_METHODS, ...WRITE_METHODS]).size).toBe(ALL_METHODS.length);
  });

  it.each(READ_METHODS)("allows operator.read scope for %s", async (method) => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: `read-${method}`,
        method,
        params: method === "prometheus.trajectory" ? { goalId: "goal-root" } : {},
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
    });

    expect(respond).toHaveBeenCalled();
    const [ok, , error] = respond.mock.calls[0] as [
      boolean,
      unknown,
      { message?: string } | undefined,
    ];
    if (method === "prometheus.trajectory") {
      // Auth passed; method failed because goal is missing in empty state.
      expect(ok).toBe(false);
      expect(error?.message).toContain('Unknown goalId "goal-root"');
      return;
    }
    expect(ok).toBe(true);
  });

  it("keeps canonical non-mutating auth behavior when method metadata override diverges", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "read-metadata-diverges",
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
        resolvePrometheusMethodMetadata: () => ({
          access: "write",
          mutatesState: true,
        }),
      },
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.any(Object),
      }),
      undefined,
    );
  });

  it("ignores planned-method auth overrides on non-planned request paths", async () => {
    const resolvePrometheusPlannedMethodMetadata = vi.fn(
      () =>
        ({
          access: "write",
          mutatesState: true,
          enabled: false,
          enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
          requiredParams: ["action"],
          reason: "should not affect non-planned method",
        }) as never,
    );
    const resolvePrometheusPlannedMethodPreflight = vi.fn(
      () =>
        ({
          disabledMessage: "should not be used",
          notImplementedMessage: "should not be used",
          requiredParamsMessage: "should not be used",
        }) as never,
    );
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-override-on-non-planned-method",
        method: "prometheus.control.preview",
        params: {
          action: "autarch.gap-detection",
        },
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

  it.each(READ_METHODS)("rejects missing read scope for %s", async (method) => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: `deny-${method}`,
        method,
        params: method === "prometheus.trajectory" ? { goalId: "goal-root" } : {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: [],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("operator.read"),
      }),
    );
  });

  it.each(READ_METHODS)("allows operator.write scope for %s", async (method) => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: `write-${method}`,
        method,
        params: method === "prometheus.trajectory" ? { goalId: "goal-root" } : {},
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
    });

    expect(respond).toHaveBeenCalled();
    const [ok, , error] = respond.mock.calls[0] as [
      boolean,
      unknown,
      { message?: string } | undefined,
    ];
    if (method === "prometheus.trajectory") {
      expect(ok).toBe(false);
      expect(error?.message).toContain('Unknown goalId "goal-root"');
      return;
    }
    expect(ok).toBe(true);
  });

  it("requires operator.write scope for all prometheus write methods", async () => {
    for (const method of WRITE_METHODS as ReadonlyArray<string>) {
      const respond = vi.fn();
      await handleGatewayRequest({
        req: {
          type: "req",
          id: `write-required-${method}`,
          method,
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
      });

      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          message: expect.stringContaining("operator.write"),
        }),
      );
    }
  });

  it.each(READ_METHODS)("rejects node role access for %s", async (method) => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: `node-${method}`,
        method,
        params: method === "prometheus.trajectory" ? { goalId: "goal-root" } : {},
      },
      client: {
        connect: {
          role: "node",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: node"),
      }),
    );
  });
});
