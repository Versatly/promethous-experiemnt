import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createThrowingPrometheusAuthOverrides,
  expectPrometheusAuthShortCircuitBeforeDispatch,
} from "./prometheus.auth.overrides.scope.test-helpers.js";
import {
  runPrometheusNodeRequest,
  runPrometheusRoleRequest,
} from "./prometheus.request-test-helpers.js";

const PLANNED_METHOD = "prometheus.control.execute";

function createPlannedMethodDispatchHarness(prefix: string) {
  return {
    plannedExecuteHandler: vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    }),
    authOverrides: createThrowingPrometheusAuthOverrides(prefix),
    respond: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override invocation scope (role short-circuits)", () => {
  it("does not invoke PROMETHEUS auth overrides when role short-circuit denies node clients", async () => {
    const authOverrides = createThrowingPrometheusAuthOverrides("node role");
    const respond = vi.fn();
    await runPrometheusNodeRequest({
      request: {
        id: "node-role-auth-override-short-circuit",
        method: PLANNED_METHOD,
        params: {},
      },
      respond,
      authOverrides,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: node"),
      }),
    );
    expectPrometheusAuthShortCircuitBeforeDispatch({
      respond,
      authOverrides,
      expectedMessage: "unauthorized role: node",
    });
  });

  it("does not dispatch planned-method extra handlers when node role is denied", async () => {
    const { plannedExecuteHandler, authOverrides, respond } =
      createPlannedMethodDispatchHarness("node role");
    await runPrometheusNodeRequest({
      request: {
        id: "node-role-planned-method-extra-handler-short-circuit",
        method: PLANNED_METHOD,
        params: {},
      },
      respond,
      authOverrides,
      extraHandlers: {
        [PLANNED_METHOD]: plannedExecuteHandler,
      },
    });

    expectPrometheusAuthShortCircuitBeforeDispatch({
      respond,
      handler: plannedExecuteHandler,
      authOverrides,
      expectedMessage: "unauthorized role: node",
    });
  });

  it("does not dispatch extra handlers when non-operator/non-node role is denied", async () => {
    const { plannedExecuteHandler, authOverrides, respond } =
      createPlannedMethodDispatchHarness("non-operator role");
    await runPrometheusRoleRequest({
      role: "auditor",
      request: {
        id: "non-operator-role-planned-method-extra-handler-short-circuit",
        method: PLANNED_METHOD,
        params: {},
      },
      respond,
      authOverrides,
      extraHandlers: {
        [PLANNED_METHOD]: plannedExecuteHandler,
      },
    });

    expectPrometheusAuthShortCircuitBeforeDispatch({
      respond,
      handler: plannedExecuteHandler,
      authOverrides,
      expectedMessage: "unauthorized role: auditor",
    });
  });

  it("keeps non-operator role denial precedence over admin scopes for planned methods", async () => {
    const { plannedExecuteHandler, authOverrides, respond } =
      createPlannedMethodDispatchHarness("non-operator role");
    await runPrometheusRoleRequest({
      role: "auditor",
      request: {
        id: "non-operator-role-admin-scope-planned-method-short-circuit",
        method: PLANNED_METHOD,
        params: {},
      },
      scopes: ["operator.admin"],
      respond,
      authOverrides,
      extraHandlers: {
        [PLANNED_METHOD]: plannedExecuteHandler,
      },
    });

    expectPrometheusAuthShortCircuitBeforeDispatch({
      respond,
      handler: plannedExecuteHandler,
      authOverrides,
      expectedMessage: "unauthorized role: auditor",
    });
  });

  it("does not dispatch extra handlers when runtime role value is malformed", async () => {
    const { plannedExecuteHandler, authOverrides, respond } =
      createPlannedMethodDispatchHarness("malformed role");
    await runPrometheusRoleRequest({
      role: 7 as never,
      request: {
        id: "malformed-role-planned-method-extra-handler-short-circuit",
        method: PLANNED_METHOD,
        params: {},
      },
      respond,
      authOverrides,
      extraHandlers: {
        [PLANNED_METHOD]: plannedExecuteHandler,
      },
    });

    expectPrometheusAuthShortCircuitBeforeDispatch({
      respond,
      handler: plannedExecuteHandler,
      authOverrides,
      expectedMessage: "unauthorized role: 7",
    });
  });
});
