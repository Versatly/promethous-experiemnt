import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrometheusHandlers } from "./prometheus.js";
import { runPrometheusWriteRequest } from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override error handling (dispatch ordering)", () => {
  it("does not dispatch injected planned-method handlers when planned metadata override throws", async () => {
    const method = "prometheus.control.execute";
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-auth-override-throws-before-planned-handler-dispatch",
        method,
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodMetadata: () => {
          throw new Error("auth override dependency exploded before planned handler dispatch");
        },
      },
      extraHandlers: {
        [method]: plannedExecuteHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining(
          "auth override dependency exploded before planned handler dispatch",
        ),
      }),
    );
    expect(plannedExecuteHandler).not.toHaveBeenCalled();
  });

  it("does not invoke injected handlers when auth override resolver throws", async () => {
    const runControlPreview = vi.fn(async () => {
      throw new Error("control preview handler should not be called");
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "auth-override-throw-short-circuits-injected-handler",
        method: "prometheus.control.preview",
        params: {
          action: "autarch.gap-detection",
        },
      },
      respond,
      authOverrides: {
        resolvePrometheusMethodMetadata: () => {
          throw new Error("method metadata override exploded before handler dispatch");
        },
      },
      extraHandlers: createPrometheusHandlers({
        runControlPreview,
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining(
          "method metadata override exploded before handler dispatch",
        ),
      }),
    );
    expect(runControlPreview).not.toHaveBeenCalled();
  });

  it("does not dispatch injected planned-method handlers when planned preflight override throws", async () => {
    const method = "prometheus.control.execute";
    const plannedExecuteHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-preflight-override-throws-before-planned-handler-dispatch",
        method,
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodPreflight: () => {
          throw new Error("planned preflight override exploded before planned handler dispatch");
        },
      },
      extraHandlers: {
        [method]: plannedExecuteHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining(
          "planned preflight override exploded before planned handler dispatch",
        ),
      }),
    );
    expect(plannedExecuteHandler).not.toHaveBeenCalled();
  });
});
