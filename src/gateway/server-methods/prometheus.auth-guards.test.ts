import { describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./prometheus-methods.js";
import { getPrometheusPlannedMutatingMethodGuardError } from "./prometheus.auth-guards.js";

describe("PROMETHEUS planned mutating guard", () => {
  it("returns UNAVAILABLE for planned mutating methods when env guard is disabled", () => {
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({
      method: "prometheus.control.execute",
      metadata: {
        access: "write",
        mutatesState: true,
        enabled: false,
        enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
        requiredParams: ["action"],
        reason: "planned rollout",
      },
    });
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.control.execute",
      env: {},
      resolvePlannedMethodPreflight: () => preflight,
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.disabledMessage,
      }),
    );
  });

  it("returns UNAVAILABLE for planned mutating methods when env guard is enabled", () => {
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({
      method: "prometheus.control.execute",
      metadata: {
        access: "write",
        mutatesState: true,
        enabled: false,
        enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
        requiredParams: ["action"],
        reason: "planned rollout",
      },
    });
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.control.execute",
      env: { [PROMETHEUS_MUTATING_CONTROLS_ENV]: "1" },
      resolvePlannedMethodPreflight: () => preflight,
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.notImplementedMessage,
      }),
    );
  });

  it("invokes planned metadata/preflight resolvers for requested planned method", () => {
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const resolvePlannedMethodMetadata = vi.fn(() => metadata);
    const resolvePlannedMethodPreflight = vi.fn(() => preflight);
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method,
      env: {},
      resolvePlannedMethodMetadata,
      resolvePlannedMethodPreflight,
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.disabledMessage,
      }),
    );
    expect(resolvePlannedMethodMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePlannedMethodPreflight).toHaveBeenCalledTimes(1);
    expect(resolvePlannedMethodMetadata).toHaveBeenCalledWith(method);
    expect(resolvePlannedMethodPreflight).toHaveBeenCalledWith(method);
  });

  it("ignores planned metadata/preflight resolver results for non-planned methods", () => {
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.status",
      env: {},
      resolvePlannedMethodMetadata: () =>
        ({
          access: "write",
          mutatesState: true,
          enabled: false,
          enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
          requiredParams: ["action"],
          reason: "should be ignored",
        }) as never,
      resolvePlannedMethodPreflight: () =>
        ({
          disabledMessage: "should be ignored",
          notImplementedMessage: "should be ignored",
          requiredParamsMessage: "should be ignored",
        }) as never,
    });
    expect(error).toBeUndefined();
  });

  it("does not invoke planned resolvers for non-planned methods", () => {
    const resolvePlannedMethodMetadata = vi.fn(() => ({
      access: "write" as const,
      mutatesState: true as const,
      enabled: false as const,
      enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
      requiredParams: ["action"] as const,
      reason: "should not be called",
    }));
    const resolvePlannedMethodPreflight = vi.fn(() => ({
      disabledMessage: "should not be called",
      notImplementedMessage: "should not be called",
      requiredParamsMessage: "should not be called",
    }));
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.status",
      env: {},
      resolvePlannedMethodMetadata,
      resolvePlannedMethodPreflight,
    });
    expect(error).toBeUndefined();
    expect(resolvePlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("propagates planned metadata resolver exceptions to caller", () => {
    expect(() =>
      getPrometheusPlannedMutatingMethodGuardError({
        method: "prometheus.control.execute",
        resolvePlannedMethodMetadata: () => {
          throw new Error("planned metadata resolver exploded");
        },
      }),
    ).toThrow("planned metadata resolver exploded");
  });

  it("does not block methods outside planned mutating metadata", () => {
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.status",
      resolvePlannedMethodPreflight: () => undefined,
    });
    expect(error).toBeUndefined();
  });
});
