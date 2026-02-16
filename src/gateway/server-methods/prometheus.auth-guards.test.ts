import { describe, expect, it } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./prometheus-methods.js";
import {
  getPrometheusMutatingControlGuardError,
  getPrometheusPlannedMutatingMethodGuardError,
} from "./prometheus.auth-guards.js";

describe("PROMETHEUS mutating-control guard", () => {
  it("does not block non-mutating methods", () => {
    const error = getPrometheusMutatingControlGuardError({
      method: "prometheus.status",
      resolveMethodMetadata: () => ({
        access: "read",
        mutatesState: false,
      }),
    });
    expect(error).toBeUndefined();
  });

  it("ignores mutating overrides when method is outside canonical metadata", () => {
    const error = getPrometheusMutatingControlGuardError({
      method: "prometheus.control.execute",
      env: {},
      resolveMethodMetadata: () => ({
        access: "write",
        mutatesState: true,
      }),
    });
    expect(error).toBeUndefined();
  });

  it("allows mutating methods when env guard is explicitly enabled", () => {
    const error = getPrometheusMutatingControlGuardError({
      method: "prometheus.control.execute",
      env: { [PROMETHEUS_MUTATING_CONTROLS_ENV]: "1" },
      resolveMethodMetadata: () => ({
        access: "write",
        mutatesState: true,
      }),
    });
    expect(error).toBeUndefined();
  });

  it("prefers canonical metadata when resolver mutability diverges", () => {
    const error = getPrometheusMutatingControlGuardError({
      method: "prometheus.status",
      env: {},
      resolveMethodMetadata: () => ({
        access: "write",
        mutatesState: true,
      }),
    });
    expect(error).toBeUndefined();
  });

  it("ignores mutating metadata resolver results for unknown methods", () => {
    const error = getPrometheusMutatingControlGuardError({
      method: "prometheus.unknown-method",
      env: {},
      resolveMethodMetadata: () => ({
        access: "write",
        mutatesState: true,
      }),
    });
    expect(error).toBeUndefined();
  });

  it("propagates mutating metadata resolver exceptions to caller", () => {
    expect(() =>
      getPrometheusMutatingControlGuardError({
        method: "prometheus.status",
        resolveMethodMetadata: () => {
          throw new Error("mutating metadata resolver exploded");
        },
      }),
    ).toThrow("mutating metadata resolver exploded");
  });

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

  it("falls back to metadata when planned preflight resolver is missing", () => {
    const metadata = {
      access: "write" as const,
      mutatesState: true as const,
      enabled: false as const,
      enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
      requiredParams: ["action"],
      reason: "planned rollout",
    };
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({
      method: "prometheus.control.execute",
      metadata,
    });
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.control.execute",
      env: {},
      resolvePlannedMethodPreflight: () => undefined,
      resolvePlannedMethodMetadata: () => metadata,
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.disabledMessage,
      }),
    );
  });

  it("falls back to canonical preflight when planned preflight resolver returns malformed shape", () => {
    const metadata = {
      access: "write" as const,
      mutatesState: true as const,
      enabled: false as const,
      enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
      requiredParams: ["action"],
      reason: "planned rollout",
    };
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({
      method: "prometheus.control.execute",
      metadata,
    });
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.control.execute",
      env: {},
      resolvePlannedMethodPreflight: () =>
        ({
          disabledMessage: 123,
        }) as never,
      resolvePlannedMethodMetadata: () => metadata,
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.disabledMessage,
      }),
    );
  });

  it("falls back to canonical preflight when resolver returns divergent valid preflight", () => {
    const metadata = {
      access: "write" as const,
      mutatesState: true as const,
      enabled: false as const,
      enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
      requiredParams: ["action"],
      reason: "planned rollout",
    };
    const canonicalPreflight = buildPrometheusPlannedMutatingMethodPreflight({
      method: "prometheus.control.execute",
      metadata,
    });
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.control.execute",
      env: {},
      resolvePlannedMethodPreflight: () => ({
        disabledMessage: "DIVERGENT disabled message",
        notImplementedMessage: "DIVERGENT not implemented message",
        requiredParamsMessage: "DIVERGENT required params message",
      }),
      resolvePlannedMethodMetadata: () => metadata,
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: canonicalPreflight.disabledMessage,
      }),
    );
  });

  it("falls back to canonical metadata when planned metadata resolver returns malformed shape", () => {
    const metadata = getPrometheusPlannedMutatingMethodMetadata("prometheus.control.execute");
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const canonicalPreflight = buildPrometheusPlannedMutatingMethodPreflight({
      method: "prometheus.control.execute",
      metadata,
    });
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.control.execute",
      env: {},
      resolvePlannedMethodPreflight: () => undefined,
      resolvePlannedMethodMetadata: () =>
        ({
          access: "write",
          mutatesState: true,
          enabled: false,
          enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
          requiredParams: ["action", "action"],
          reason: "invalid required params",
        }) as never,
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: canonicalPreflight.disabledMessage,
      }),
    );
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
