import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runPrometheusNodeRequest,
  runPrometheusOperatorRequest,
  runPrometheusRoleRequest,
} from "./prometheus.request-test-helpers.js";

const UNKNOWN_PROMETHEUS_METHOD = "prometheus.unknown.gateway.method";

function createThrowingAuthOverrides(prefix: string) {
  const resolvePrometheusMethodMetadata = vi.fn(() => {
    throw new Error(`${prefix}: method metadata resolver should not be called`);
  });
  const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
    throw new Error(`${prefix}: planned metadata resolver should not be called`);
  });
  const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
    throw new Error(`${prefix}: planned preflight resolver should not be called`);
  });
  return {
    resolvePrometheusMethodMetadata,
    resolvePrometheusPlannedMethodMetadata,
    resolvePrometheusPlannedMethodPreflight,
  };
}

function expectNoAuthOverrideInvocations(
  overrides: ReturnType<typeof createThrowingAuthOverrides>,
) {
  expect(overrides.resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
  expect(overrides.resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
  expect(overrides.resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override invocation scope (unknown methods)", () => {
  it("does not invoke PROMETHEUS auth overrides for unknown prometheus-prefixed methods", async () => {
    const authOverrides = createThrowingAuthOverrides("unknown methods");
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "unknown-prometheus-method-auth-override-short-circuit",
        method: UNKNOWN_PROMETHEUS_METHOD,
        params: {},
      },
      respond,
      scopes: ["operator.admin"],
      authOverrides,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: `unknown method: ${UNKNOWN_PROMETHEUS_METHOD}`,
      }),
    );
    expectNoAuthOverrideInvocations(authOverrides);
  });

  it("does not dispatch injected unknown handlers when unknown method is scope-denied", async () => {
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingAuthOverrides("unknown scope-denied method");
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "unknown-prometheus-method-scope-denied-before-handler-dispatch",
        method: UNKNOWN_PROMETHEUS_METHOD,
        params: {},
      },
      respond,
      scopes: ["operator.read"],
      authOverrides,
      extraHandlers: {
        [UNKNOWN_PROMETHEUS_METHOD]: unknownMethodHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("missing scope: operator.admin"),
      }),
    );
    expect(unknownMethodHandler).not.toHaveBeenCalled();
    expectNoAuthOverrideInvocations(authOverrides);
  });

  it("dispatches injected unknown handlers under admin scope without invoking PROMETHEUS auth overrides", async () => {
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { deliveredByExtraHandler: true }, undefined);
    });
    const authOverrides = createThrowingAuthOverrides("unknown admin method");
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "unknown-prometheus-method-admin-extra-handler-dispatch",
        method: UNKNOWN_PROMETHEUS_METHOD,
        params: {},
      },
      respond,
      scopes: ["operator.admin"],
      authOverrides,
      extraHandlers: {
        [UNKNOWN_PROMETHEUS_METHOD]: unknownMethodHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(true, { deliveredByExtraHandler: true }, undefined);
    expect(unknownMethodHandler).toHaveBeenCalledTimes(1);
    expectNoAuthOverrideInvocations(authOverrides);
  });

  it("does not dispatch injected unknown handlers when node role is denied", async () => {
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingAuthOverrides("node-denied unknown method");
    const respond = vi.fn();
    await runPrometheusNodeRequest({
      request: {
        id: "unknown-prometheus-method-node-denied-before-handler-dispatch",
        method: UNKNOWN_PROMETHEUS_METHOD,
        params: {},
      },
      authOverrides,
      extraHandlers: {
        [UNKNOWN_PROMETHEUS_METHOD]: unknownMethodHandler,
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: node"),
      }),
    );
    expect(unknownMethodHandler).not.toHaveBeenCalled();
    expectNoAuthOverrideInvocations(authOverrides);
  });

  it("does not dispatch injected unknown handlers when non-operator role is denied", async () => {
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingAuthOverrides("non-operator unknown method");
    const respond = vi.fn();
    await runPrometheusRoleRequest({
      role: "auditor",
      request: {
        id: "unknown-prometheus-method-non-operator-denied-before-handler-dispatch",
        method: UNKNOWN_PROMETHEUS_METHOD,
        params: {},
      },
      authOverrides,
      extraHandlers: {
        [UNKNOWN_PROMETHEUS_METHOD]: unknownMethodHandler,
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: auditor"),
      }),
    );
    expect(unknownMethodHandler).not.toHaveBeenCalled();
    expectNoAuthOverrideInvocations(authOverrides);
  });

  it("does not dispatch injected unknown handlers when runtime role value is malformed", async () => {
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingAuthOverrides("malformed unknown role");
    const respond = vi.fn();
    await runPrometheusRoleRequest({
      role: 7 as never,
      request: {
        id: "unknown-prometheus-method-malformed-role-denied-before-handler-dispatch",
        method: UNKNOWN_PROMETHEUS_METHOD,
        params: {},
      },
      authOverrides,
      extraHandlers: {
        [UNKNOWN_PROMETHEUS_METHOD]: unknownMethodHandler,
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: 7"),
      }),
    );
    expect(unknownMethodHandler).not.toHaveBeenCalled();
    expectNoAuthOverrideInvocations(authOverrides);
  });
});
