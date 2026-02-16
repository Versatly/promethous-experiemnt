import { describe, expect, it } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./prometheus-methods.js";
import { getPrometheusPlannedMutatingMethodGuardError } from "./prometheus.auth-guards.js";

describe("PROMETHEUS planned mutating guard fallback regressions", () => {
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

  it("falls back to canonical metadata when planned metadata reason is blank", () => {
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
          requiredParams: ["action"],
          reason: " ",
        }) as never,
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: canonicalPreflight.disabledMessage,
      }),
    );
  });
});
