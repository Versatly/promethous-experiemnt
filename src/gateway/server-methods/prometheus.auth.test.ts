import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { listGatewayMethods } from "../server-methods-list.js";
import { handleGatewayRequest } from "../server-methods.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_GATEWAY_METHODS,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
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

  it("returns UNAVAILABLE for planned mutating methods before rollout", async () => {
    for (const method of Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA)) {
      const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
      expect(metadata).toBeDefined();
      if (!metadata) {
        continue;
      }
      const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
      const respond = vi.fn();
      await handleGatewayRequest({
        req: {
          type: "req",
          id: `planned-${method}`,
          method,
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
      });

      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "UNAVAILABLE",
          message: preflight.disabledMessage,
        }),
      );
    }
  });

  it("returns UNAVAILABLE not-implemented when planned methods are env-enabled", async () => {
    vi.stubEnv(PROMETHEUS_MUTATING_CONTROLS_ENV, "1");
    for (const method of Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA)) {
      const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
      expect(metadata).toBeDefined();
      if (!metadata) {
        continue;
      }
      const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
      const respond = vi.fn();
      await handleGatewayRequest({
        req: {
          type: "req",
          id: `planned-enabled-${method}`,
          method,
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
      });

      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "UNAVAILABLE",
          message: preflight.notImplementedMessage,
        }),
      );
    }
  });
});
