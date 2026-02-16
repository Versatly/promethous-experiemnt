import { describe, expect, it, vi } from "vitest";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
import { getPrometheusMutatingControlGuardError } from "./prometheus.auth-guards.js";

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

  it("invokes method metadata resolver for canonical Prometheus methods", () => {
    const resolveMethodMetadata = vi.fn(() => ({
      access: "read" as const,
      mutatesState: false,
    }));
    const error = getPrometheusMutatingControlGuardError({
      method: "prometheus.status",
      env: {},
      resolveMethodMetadata,
    });
    expect(error).toBeUndefined();
    expect(resolveMethodMetadata).toHaveBeenCalledTimes(1);
    expect(resolveMethodMetadata).toHaveBeenCalledWith("prometheus.status");
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

  it("does not invoke mutating metadata resolver for unknown methods", () => {
    const resolveMethodMetadata = vi.fn(() => ({
      access: "write" as const,
      mutatesState: true,
    }));
    const error = getPrometheusMutatingControlGuardError({
      method: "prometheus.unknown-method",
      env: {},
      resolveMethodMetadata,
    });
    expect(error).toBeUndefined();
    expect(resolveMethodMetadata).not.toHaveBeenCalled();
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
});
