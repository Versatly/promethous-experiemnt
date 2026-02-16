import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createThrowingPrometheusAuthOverrides,
  expectNoPrometheusAuthOverrideInvocations,
} from "./prometheus.auth.overrides.scope.test-helpers.js";
import {
  runPrometheusNodeRequest,
  runPrometheusRoleRequest,
} from "./prometheus.request-test-helpers.js";

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
        method: "prometheus.control.execute",
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
    expectNoPrometheusAuthOverrideInvocations(authOverrides);
  });

  it("does not dispatch planned-method extra handlers when node role is denied", async () => {
    const method = "prometheus.control.execute";
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingPrometheusAuthOverrides("node role");
    const respond = vi.fn();
    await runPrometheusNodeRequest({
      request: {
        id: "node-role-planned-method-extra-handler-short-circuit",
        method,
        params: {},
      },
      respond,
      authOverrides,
      extraHandlers: {
        [method]: plannedExecuteHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: node"),
      }),
    );
    expect(plannedExecuteHandler).not.toHaveBeenCalled();
    expectNoPrometheusAuthOverrideInvocations(authOverrides);
  });

  it("does not dispatch extra handlers when non-operator/non-node role is denied", async () => {
    const method = "prometheus.control.execute";
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingPrometheusAuthOverrides("non-operator role");
    const respond = vi.fn();
    await runPrometheusRoleRequest({
      role: "auditor",
      request: {
        id: "non-operator-role-planned-method-extra-handler-short-circuit",
        method,
        params: {},
      },
      respond,
      authOverrides,
      extraHandlers: {
        [method]: plannedExecuteHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: auditor"),
      }),
    );
    expect(plannedExecuteHandler).not.toHaveBeenCalled();
    expectNoPrometheusAuthOverrideInvocations(authOverrides);
  });

  it("does not dispatch extra handlers when runtime role value is malformed", async () => {
    const method = "prometheus.control.execute";
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingPrometheusAuthOverrides("malformed role");
    const respond = vi.fn();
    await runPrometheusRoleRequest({
      role: 7 as never,
      request: {
        id: "malformed-role-planned-method-extra-handler-short-circuit",
        method,
        params: {},
      },
      respond,
      authOverrides,
      extraHandlers: {
        [method]: plannedExecuteHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: 7"),
      }),
    );
    expect(plannedExecuteHandler).not.toHaveBeenCalled();
    expectNoPrometheusAuthOverrideInvocations(authOverrides);
  });
});
