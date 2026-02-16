import { describe, expect, it } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import {
  getPrometheusMutatingControlGuardError,
  getPrometheusPlannedMutatingMethodGuardError,
} from "../server-methods.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./prometheus-methods.js";

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

  it("blocks mutating methods when env guard is disabled", () => {
    const error = getPrometheusMutatingControlGuardError({
      method: "prometheus.control.execute",
      env: {},
      resolveMethodMetadata: () => ({
        access: "write",
        mutatesState: true,
      }),
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining(PROMETHEUS_MUTATING_CONTROLS_ENV),
      }),
    );
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

  it("does not block methods outside planned mutating metadata", () => {
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.status",
      resolvePlannedMethodPreflight: () => undefined,
    });
    expect(error).toBeUndefined();
  });
});
