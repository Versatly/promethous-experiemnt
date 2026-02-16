import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./prometheus-methods.js";
import { runPrometheusWriteRequest } from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization planned mutating method fallback regressions", () => {
  it("keeps planned-method UNAVAILABLE fallback at request handling when preflight resolver misses", async () => {
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-fallback-request-level",
        method,
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodPreflight: () => undefined,
        resolvePrometheusPlannedMethodMetadata: () => metadata,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: preflight.disabledMessage,
      }),
    );
  });

  it("keeps planned-method UNAVAILABLE fallback at request handling when preflight resolver returns malformed shape", async () => {
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-malformed-preflight-request-level",
        method,
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodPreflight: () =>
          ({
            disabledMessage: 123,
          }) as never,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: preflight.disabledMessage,
      }),
    );
  });

  it("keeps planned-method canonical preflight at request handling when resolver returns divergent valid preflight", async () => {
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-divergent-preflight-request-level",
        method,
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodPreflight: () => ({
          disabledMessage: "DIVERGENT disabled message",
          notImplementedMessage: "DIVERGENT not implemented message",
          requiredParamsMessage: "DIVERGENT required params message",
        }),
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: preflight.disabledMessage,
      }),
    );
  });

  it("keeps planned-method UNAVAILABLE fallback at request handling when metadata resolver returns malformed shape", async () => {
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-malformed-metadata-request-level",
        method,
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodMetadata: () =>
          ({
            access: "write",
            mutatesState: true,
            enabled: false,
            enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
            requiredParams: ["action", "action"],
            reason: "invalid required params",
          }) as never,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: preflight.disabledMessage,
      }),
    );
  });

  it("keeps planned-method UNAVAILABLE fallback at request handling when metadata reason is blank", async () => {
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-blank-reason-metadata-request-level",
        method,
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodMetadata: () =>
          ({
            access: "write",
            mutatesState: true,
            enabled: false,
            enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
            requiredParams: ["action"],
            reason: " ",
          }) as never,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: preflight.disabledMessage,
      }),
    );
  });
});
