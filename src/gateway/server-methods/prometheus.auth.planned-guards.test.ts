import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
} from "./prometheus-methods.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization planned mutating guardrails", () => {
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

  it("invokes planned-method auth resolvers only for requested planned method", async () => {
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => metadata);
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => preflight);
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-method-resolver-invocation-scope",
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
      authOverrides: {
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: preflight.disabledMessage,
      }),
    );
    expect(resolvePrometheusPlannedMethodMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePrometheusPlannedMethodPreflight).toHaveBeenCalledTimes(1);
    expect(resolvePrometheusPlannedMethodMetadata).toHaveBeenCalledWith(method);
    expect(resolvePrometheusPlannedMethodPreflight).toHaveBeenCalledWith(method);
  });
});
