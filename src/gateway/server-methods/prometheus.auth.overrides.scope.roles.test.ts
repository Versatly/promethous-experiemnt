import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runPrometheusNodeRequest,
  runPrometheusRoleRequest,
} from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

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

describe("PROMETHEUS gateway authorization override invocation scope (role short-circuits)", () => {
  it("does not invoke PROMETHEUS auth overrides when role short-circuit denies node clients", async () => {
    const authOverrides = createThrowingAuthOverrides("node role");
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
    expect(authOverrides.resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(authOverrides.resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(authOverrides.resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("does not dispatch planned-method extra handlers when node role is denied", async () => {
    const method = "prometheus.control.execute";
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingAuthOverrides("node role");
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
    expect(authOverrides.resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(authOverrides.resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(authOverrides.resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("does not dispatch extra handlers when non-operator/non-node role is denied", async () => {
    const method = "prometheus.control.execute";
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingAuthOverrides("non-operator role");
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
    expect(authOverrides.resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(authOverrides.resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(authOverrides.resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("does not dispatch extra handlers when runtime role value is malformed", async () => {
    const method = "prometheus.control.execute";
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const authOverrides = createThrowingAuthOverrides("malformed role");
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
    expect(authOverrides.resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(authOverrides.resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(authOverrides.resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });
});
