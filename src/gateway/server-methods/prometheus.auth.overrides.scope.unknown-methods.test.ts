import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createThrowingPrometheusAuthOverrides,
  expectNoPrometheusAuthOverrideInvocations,
} from "./prometheus.auth.overrides.scope.test-helpers.js";
import {
  runPrometheusNodeRequest,
  runPrometheusOperatorRequest,
  runPrometheusRoleRequest,
} from "./prometheus.request-test-helpers.js";

const UNKNOWN_PROMETHEUS_METHOD = "prometheus.unknown.gateway.method";

function createUnknownMethodDispatchHarness(prefix: string) {
  return {
    unknownMethodHandler: vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    }),
    authOverrides: createThrowingPrometheusAuthOverrides(prefix),
    respond: vi.fn(),
  };
}

function expectUnknownMethodDeniedBeforeDispatch(args: {
  respond: ReturnType<typeof vi.fn>;
  unknownMethodHandler: ReturnType<typeof vi.fn>;
  authOverrides: ReturnType<typeof createThrowingPrometheusAuthOverrides>;
  expectedMessage: string;
}) {
  expect(args.respond).toHaveBeenCalledWith(
    false,
    undefined,
    expect.objectContaining({
      message: expect.stringContaining(args.expectedMessage),
    }),
  );
  expect(args.unknownMethodHandler).not.toHaveBeenCalled();
  expectNoPrometheusAuthOverrideInvocations(args.authOverrides);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override invocation scope (unknown methods)", () => {
  it("does not invoke PROMETHEUS auth overrides for unknown prometheus-prefixed methods", async () => {
    const authOverrides = createThrowingPrometheusAuthOverrides("unknown methods");
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
    expectNoPrometheusAuthOverrideInvocations(authOverrides);
  });

  it("does not dispatch injected unknown handlers when unknown method is scope-denied", async () => {
    const { unknownMethodHandler, authOverrides, respond } = createUnknownMethodDispatchHarness(
      "unknown scope-denied method",
    );
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

    expectUnknownMethodDeniedBeforeDispatch({
      respond,
      unknownMethodHandler,
      authOverrides,
      expectedMessage: "missing scope: operator.admin",
    });
  });

  it("dispatches injected unknown handlers under admin scope without invoking PROMETHEUS auth overrides", async () => {
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { deliveredByExtraHandler: true }, undefined);
    });
    const authOverrides = createThrowingPrometheusAuthOverrides("unknown admin method");
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
    expectNoPrometheusAuthOverrideInvocations(authOverrides);
  });

  it("does not dispatch injected unknown handlers when node role is denied", async () => {
    const { unknownMethodHandler, authOverrides, respond } = createUnknownMethodDispatchHarness(
      "node-denied unknown method",
    );
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

    expectUnknownMethodDeniedBeforeDispatch({
      respond,
      unknownMethodHandler,
      authOverrides,
      expectedMessage: "unauthorized role: node",
    });
  });

  it("keeps node-role denial precedence over admin scopes for unknown methods", async () => {
    const { unknownMethodHandler, authOverrides, respond } = createUnknownMethodDispatchHarness(
      "node-denied unknown method",
    );
    await runPrometheusNodeRequest({
      request: {
        id: "unknown-prometheus-method-node-admin-scope-denied-before-handler-dispatch",
        method: UNKNOWN_PROMETHEUS_METHOD,
        params: {},
      },
      scopes: ["operator.admin"],
      authOverrides,
      extraHandlers: {
        [UNKNOWN_PROMETHEUS_METHOD]: unknownMethodHandler,
      },
      respond,
    });

    expectUnknownMethodDeniedBeforeDispatch({
      respond,
      unknownMethodHandler,
      authOverrides,
      expectedMessage: "unauthorized role: node",
    });
  });

  it("does not dispatch injected unknown handlers when non-operator role is denied", async () => {
    const { unknownMethodHandler, authOverrides, respond } = createUnknownMethodDispatchHarness(
      "non-operator unknown method",
    );
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

    expectUnknownMethodDeniedBeforeDispatch({
      respond,
      unknownMethodHandler,
      authOverrides,
      expectedMessage: "unauthorized role: auditor",
    });
  });

  it("does not dispatch injected unknown handlers when runtime role value is malformed", async () => {
    const { unknownMethodHandler, authOverrides, respond } =
      createUnknownMethodDispatchHarness("malformed unknown role");
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

    expectUnknownMethodDeniedBeforeDispatch({
      respond,
      unknownMethodHandler,
      authOverrides,
      expectedMessage: "unauthorized role: 7",
    });
  });
});
