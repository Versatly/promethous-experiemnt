import { describe, expect, it, vi } from "vitest";
import {
  createThrowingPrometheusAuthOverrides,
  expectNoPrometheusAuthOverrideInvocations,
  expectPrometheusAuthShortCircuitBeforeDispatch,
} from "./prometheus.auth.overrides.scope.test-helpers.js";

describe("prometheus auth override scope test helpers", () => {
  it("creates throwing auth override resolvers with the provided prefix", () => {
    const overrides = createThrowingPrometheusAuthOverrides("scope-helper-prefix");

    expect(() => overrides.resolvePrometheusMethodMetadata("prometheus.status")).toThrow(
      "scope-helper-prefix: method metadata resolver should not be called",
    );
    expect(() =>
      overrides.resolvePrometheusPlannedMethodMetadata("prometheus.control.execute"),
    ).toThrow("scope-helper-prefix: planned metadata resolver should not be called");
    expect(() =>
      overrides.resolvePrometheusPlannedMethodPreflight("prometheus.control.execute"),
    ).toThrow("scope-helper-prefix: planned preflight resolver should not be called");
  });

  it("asserts no auth override resolver invocations", () => {
    const overrides = createThrowingPrometheusAuthOverrides("scope-helper-no-invocations");
    expectNoPrometheusAuthOverrideInvocations(overrides);
  });

  it("asserts short-circuit response and no dispatch with handler provided", () => {
    const overrides = createThrowingPrometheusAuthOverrides("scope-helper-short-circuit");
    const handler = vi.fn();
    const respond = vi.fn();
    respond(false, undefined, {
      code: "INVALID_REQUEST",
      message: "unauthorized role: node",
    });

    expectPrometheusAuthShortCircuitBeforeDispatch({
      respond,
      handler,
      authOverrides: overrides,
      expectedMessage: "unauthorized role: node",
    });
  });

  it("asserts short-circuit response without requiring a handler", () => {
    const overrides = createThrowingPrometheusAuthOverrides(
      "scope-helper-short-circuit-without-handler",
    );
    const respond = vi.fn();
    respond(false, undefined, {
      code: "INVALID_REQUEST",
      message: "unauthorized role: auditor",
    });

    expectPrometheusAuthShortCircuitBeforeDispatch({
      respond,
      authOverrides: overrides,
      expectedMessage: "unauthorized role: auditor",
    });
  });
});
