import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./prometheus-methods.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";
import { createPrometheusHandlers } from "./prometheus.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization planned mutating fallback regressions", () => {
  it("keeps planned-method UNAVAILABLE fallback at request handling when preflight resolver misses", async () => {
    const method = "prometheus.control.execute";
    const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-fallback-request-level",
        method,
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-malformed-preflight-request-level",
        method,
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-divergent-preflight-request-level",
        method,
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-malformed-metadata-request-level",
        method,
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-blank-reason-metadata-request-level",
        method,
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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

  it("keeps planned-action UNAVAILABLE fallback at request handling when preflight resolver misses", async () => {
    const action = "autarch.gap-detection.commit";
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(action);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingPreviewActionPreflight({
      action,
      metadata,
    });
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-action-fallback-request-level",
        method: "prometheus.control.preview",
        params: {
          action,
          goalId: "goal-1",
        },
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      extraHandlers: createPrometheusHandlers({
        runControlPreview: (params, deps) =>
          runPrometheusControlPreview(params, {
            ...deps,
            resolvePlannedActionPreflight: () => undefined,
            resolvePlannedActionMetadata: () => metadata,
          }),
      }),
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

  it("keeps planned-action canonical preflight at request handling when resolver returns divergent valid preflight", async () => {
    const action = "autarch.gap-detection.commit";
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(action);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingPreviewActionPreflight({
      action,
      metadata,
    });
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-action-divergent-preflight-request-level",
        method: "prometheus.control.preview",
        params: {
          action,
          goalId: "goal-1",
        },
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      extraHandlers: createPrometheusHandlers({
        runControlPreview: (params, deps) =>
          runPrometheusControlPreview(params, {
            ...deps,
            resolvePlannedActionPreflight: () => ({
              disabledMessage: "DIVERGENT disabled message",
              notImplementedMessage: "DIVERGENT not implemented message",
              requiredParamsMessage: "DIVERGENT required params message",
            }),
          }),
      }),
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
