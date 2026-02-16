import { describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";

const READ_METHODS = [
  "prometheus.status",
  "prometheus.trajectory",
  "prometheus.goals",
  "prometheus.recursion",
  "prometheus.autarch",
  "prometheus.monolith",
] as const;

describe("PROMETHEUS gateway authorization", () => {
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
