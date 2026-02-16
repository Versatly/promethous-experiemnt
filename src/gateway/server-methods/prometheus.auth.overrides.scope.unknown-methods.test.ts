import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runPrometheusNodeRequest,
  runPrometheusOperatorRequest,
  runPrometheusRoleRequest,
} from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override invocation scope (unknown methods)", () => {
  it("does not invoke PROMETHEUS auth overrides for unknown prometheus-prefixed methods", async () => {
    const method = "prometheus.unknown.gateway.method";
    const resolvePrometheusMethodMetadata = vi.fn(() => {
      throw new Error("method metadata resolver should not be called for unknown methods");
    });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error("planned metadata resolver should not be called for unknown methods");
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error("planned preflight resolver should not be called for unknown methods");
    });
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "unknown-prometheus-method-auth-override-short-circuit",
        method,
        params: {},
      },
      respond,
      scopes: ["operator.admin"],
      authOverrides: {
        resolvePrometheusMethodMetadata,
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: `unknown method: ${method}`,
      }),
    );
    expect(resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("does not dispatch injected unknown handlers when unknown method is scope-denied", async () => {
    const method = "prometheus.unknown.gateway.method";
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const resolvePrometheusMethodMetadata = vi.fn(() => {
      throw new Error(
        "method metadata resolver should not be called for unknown scope-denied method",
      );
    });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error(
        "planned metadata resolver should not be called for unknown scope-denied method",
      );
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error(
        "planned preflight resolver should not be called for unknown scope-denied method",
      );
    });
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "unknown-prometheus-method-scope-denied-before-handler-dispatch",
        method,
        params: {},
      },
      respond,
      scopes: ["operator.read"],
      authOverrides: {
        resolvePrometheusMethodMetadata,
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
      extraHandlers: {
        [method]: unknownMethodHandler,
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
    expect(resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("dispatches injected unknown handlers under admin scope without invoking PROMETHEUS auth overrides", async () => {
    const method = "prometheus.unknown.gateway.method";
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { deliveredByExtraHandler: true }, undefined);
    });
    const resolvePrometheusMethodMetadata = vi.fn(() => {
      throw new Error("method metadata resolver should not run for unknown admin method");
    });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error("planned metadata resolver should not run for unknown admin method");
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error("planned preflight resolver should not run for unknown admin method");
    });
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "unknown-prometheus-method-admin-extra-handler-dispatch",
        method,
        params: {},
      },
      respond,
      scopes: ["operator.admin"],
      authOverrides: {
        resolvePrometheusMethodMetadata,
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
      extraHandlers: {
        [method]: unknownMethodHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(true, { deliveredByExtraHandler: true }, undefined);
    expect(unknownMethodHandler).toHaveBeenCalledTimes(1);
    expect(resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("does not dispatch injected unknown handlers when node role is denied", async () => {
    const method = "prometheus.unknown.gateway.method";
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const resolvePrometheusMethodMetadata = vi.fn(() => {
      throw new Error("method metadata resolver should not run for node-denied unknown method");
    });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error("planned metadata resolver should not run for node-denied unknown method");
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error("planned preflight resolver should not run for node-denied unknown method");
    });
    const respond = vi.fn();
    await runPrometheusNodeRequest({
      request: {
        id: "unknown-prometheus-method-node-denied-before-handler-dispatch",
        method,
        params: {},
      },
      authOverrides: {
        resolvePrometheusMethodMetadata,
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
      extraHandlers: {
        [method]: unknownMethodHandler,
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
    expect(resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });

  it("does not dispatch injected unknown handlers when non-operator role is denied", async () => {
    const method = "prometheus.unknown.gateway.method";
    const unknownMethodHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const resolvePrometheusMethodMetadata = vi.fn(() => {
      throw new Error("method metadata resolver should not run for non-operator unknown method");
    });
    const resolvePrometheusPlannedMethodMetadata = vi.fn(() => {
      throw new Error("planned metadata resolver should not run for non-operator unknown method");
    });
    const resolvePrometheusPlannedMethodPreflight = vi.fn(() => {
      throw new Error("planned preflight resolver should not run for non-operator unknown method");
    });
    const respond = vi.fn();
    await runPrometheusRoleRequest({
      role: "auditor",
      request: {
        id: "unknown-prometheus-method-non-operator-denied-before-handler-dispatch",
        method,
        params: {},
      },
      authOverrides: {
        resolvePrometheusMethodMetadata,
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
      extraHandlers: {
        [method]: unknownMethodHandler,
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
    expect(resolvePrometheusMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });
});
