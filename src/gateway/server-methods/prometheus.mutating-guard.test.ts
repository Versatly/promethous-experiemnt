import { describe, expect, it } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import {
  getPrometheusMutatingControlGuardError,
  getPrometheusPlannedMutatingMethodGuardError,
} from "../server-methods.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
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
      resolvePlannedMethodMetadata: () => ({
        access: "write",
        mutatesState: true,
        enabled: false,
        enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
        requiredParams: ["action"],
        reason: "planned rollout",
      }),
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
      resolvePlannedMethodMetadata: () => ({
        access: "write",
        mutatesState: true,
        enabled: false,
        enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
        requiredParams: ["action"],
        reason: "planned rollout",
      }),
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.notImplementedMessage,
      }),
    );
  });

  it("does not block methods outside planned mutating metadata", () => {
    const error = getPrometheusPlannedMutatingMethodGuardError({
      method: "prometheus.status",
      resolvePlannedMethodMetadata: () => undefined,
    });
    expect(error).toBeUndefined();
  });
});
