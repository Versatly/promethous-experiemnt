import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
} from "./prometheus-methods.js";
import { runPrometheusWriteRequest } from "./prometheus.request-test-helpers.js";

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
      await runPrometheusWriteRequest({
        request: {
          id: `planned-${method}`,
          method,
          params: {},
        },
        respond,
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

  it("does not dispatch injected handlers for planned mutating methods blocked by auth guard", async () => {
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-method-auth-short-circuit-before-handler-dispatch",
        method,
        params: {},
      },
      respond,
      extraHandlers: {
        [method]: plannedExecuteHandler,
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
    expect(plannedExecuteHandler).not.toHaveBeenCalled();
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
      await runPrometheusWriteRequest({
        request: {
          id: `planned-enabled-${method}`,
          method,
          params: {},
        },
        respond,
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

  it("does not dispatch injected handlers when planned methods are env-enabled", async () => {
    vi.stubEnv(PROMETHEUS_MUTATING_CONTROLS_ENV, "1");
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-method-env-enabled-short-circuit-before-handler-dispatch",
        method,
        params: {},
      },
      respond,
      extraHandlers: {
        [method]: plannedExecuteHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: preflight.notImplementedMessage,
      }),
    );
    expect(plannedExecuteHandler).not.toHaveBeenCalled();
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
    await runPrometheusWriteRequest({
      request: {
        id: "planned-method-resolver-invocation-scope",
        method,
        params: {},
      },
      respond,
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
