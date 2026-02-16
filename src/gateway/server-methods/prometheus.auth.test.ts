import { describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { listGatewayMethods } from "../server-methods-list.js";
import { handleGatewayRequest } from "../server-methods.js";
import { PROMETHEUS_GATEWAY_READ_METHODS } from "./prometheus-methods.js";

const READ_METHODS = PROMETHEUS_GATEWAY_READ_METHODS;

describe("PROMETHEUS gateway authorization", () => {
  it("covers every prometheus.* method exposed in gateway method list", () => {
    const prometheusMethods = listGatewayMethods()
      .filter((method) => method.startsWith("prometheus."))
      .toSorted();
    expect(prometheusMethods).toEqual([...READ_METHODS].toSorted());
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
