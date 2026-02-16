import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { listGatewayMethods } from "../server-methods-list.js";
import { handleGatewayRequest } from "../server-methods.js";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_GATEWAY_METHODS,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
  PROMETHEUS_GATEWAY_READ_METHODS,
  PROMETHEUS_GATEWAY_WRITE_METHODS,
} from "./prometheus-methods.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";
import { createPrometheusHandlers } from "./prometheus.js";

const READ_METHODS = PROMETHEUS_GATEWAY_READ_METHODS;
const WRITE_METHODS = PROMETHEUS_GATEWAY_WRITE_METHODS;
const ALL_METHODS = PROMETHEUS_GATEWAY_METHODS;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization", () => {
  it("covers every prometheus.* method exposed in gateway method list", () => {
    const prometheusMethods = listGatewayMethods()
      .filter((method) => method.startsWith("prometheus."))
      .toSorted();
    expect(prometheusMethods).toEqual([...ALL_METHODS].toSorted());
    expect(new Set([...READ_METHODS, ...WRITE_METHODS]).size).toBe(ALL_METHODS.length);
  });

  it.each(READ_METHODS)("allows operator.read scope for %s", async (method) => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: `read-${method}`,
        method,
        params: method === "prometheus.trajectory" ? { goalId: "goal-root" } : {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalled();
    const [ok, , error] = respond.mock.calls[0] as [
      boolean,
      unknown,
      { message?: string } | undefined,
    ];
    if (method === "prometheus.trajectory") {
      // Auth passed; method failed because goal is missing in empty state.
      expect(ok).toBe(false);
      expect(error?.message).toContain('Unknown goalId "goal-root"');
      return;
    }
    expect(ok).toBe(true);
  });

  it("keeps canonical non-mutating auth behavior when method metadata override diverges", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "read-metadata-diverges",
        method: "prometheus.status",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      authOverrides: {
        resolvePrometheusMethodMetadata: () => ({
          access: "write",
          mutatesState: true,
        }),
      },
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.any(Object),
      }),
      undefined,
    );
  });

  it.each(READ_METHODS)("rejects missing read scope for %s", async (method) => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: `deny-${method}`,
        method,
        params: method === "prometheus.trajectory" ? { goalId: "goal-root" } : {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: [],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("operator.read"),
      }),
    );
  });

  it.each(READ_METHODS)("allows operator.write scope for %s", async (method) => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: `write-${method}`,
        method,
        params: method === "prometheus.trajectory" ? { goalId: "goal-root" } : {},
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
    });

    expect(respond).toHaveBeenCalled();
    const [ok, , error] = respond.mock.calls[0] as [
      boolean,
      unknown,
      { message?: string } | undefined,
    ];
    if (method === "prometheus.trajectory") {
      expect(ok).toBe(false);
      expect(error?.message).toContain('Unknown goalId "goal-root"');
      return;
    }
    expect(ok).toBe(true);
  });

  it("requires operator.write scope for all prometheus write methods", async () => {
    for (const method of WRITE_METHODS as ReadonlyArray<string>) {
      const respond = vi.fn();
      await handleGatewayRequest({
        req: {
          type: "req",
          id: `write-required-${method}`,
          method,
          params: {},
        },
        client: {
          connect: {
            role: "operator",
            scopes: ["operator.read"],
          },
        },
        isWebchatConnect: () => false,
        respond,
        context: {} as GatewayRequestContext,
      });

      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          message: expect.stringContaining("operator.write"),
        }),
      );
    }
  });

  it.each(READ_METHODS)("rejects node role access for %s", async (method) => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: `node-${method}`,
        method,
        params: method === "prometheus.trajectory" ? { goalId: "goal-root" } : {},
      },
      client: {
        connect: {
          role: "node",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: node"),
      }),
    );
  });

  it("returns UNAVAILABLE for planned mutating methods before rollout", async () => {
    for (const method of Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA)) {
      const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
      expect(metadata).toBeDefined();
      if (!metadata) {
        continue;
      }
      const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
      const respond = vi.fn();
      await handleGatewayRequest({
        req: {
          type: "req",
          id: `planned-${method}`,
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
      });

      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "UNAVAILABLE",
          message: preflight.disabledMessage,
        }),
      );
    }
  });

  it("returns UNAVAILABLE not-implemented when planned methods are env-enabled", async () => {
    vi.stubEnv(PROMETHEUS_MUTATING_CONTROLS_ENV, "1");
    for (const method of Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA)) {
      const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
      expect(metadata).toBeDefined();
      if (!metadata) {
        continue;
      }
      const preflight = buildPrometheusPlannedMutatingMethodPreflight({ method, metadata });
      const respond = vi.fn();
      await handleGatewayRequest({
        req: {
          type: "req",
          id: `planned-enabled-${method}`,
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
      });

      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "UNAVAILABLE",
          message: preflight.notImplementedMessage,
        }),
      );
    }
  });

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

  it("returns UNAVAILABLE when injected auth override resolver throws", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-auth-override-throws",
        method: "prometheus.control.execute",
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
        resolvePrometheusPlannedMethodMetadata: () => {
          throw new Error("auth override dependency exploded");
        },
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("auth override dependency exploded"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected method metadata auth override throws", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "auth-method-metadata-override-throws",
        method: "prometheus.status",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      authOverrides: {
        resolvePrometheusMethodMetadata: () => {
          throw new Error("method metadata override exploded");
        },
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("method metadata override exploded"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected planned preflight auth override throws", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "auth-planned-preflight-override-throws",
        method: "prometheus.control.execute",
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
        resolvePrometheusPlannedMethodPreflight: () => {
          throw new Error("planned preflight override exploded");
        },
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("planned preflight override exploded"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected catalog dependency violates summary invariants at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "catalog-summary-invariant-request-level",
        method: "prometheus.control.catalog",
        params: {},
      },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      extraHandlers: createPrometheusHandlers({
        buildControlCatalogSnapshot: () => {
          const snapshot = buildPrometheusControlCatalogSnapshot();
          return {
            ...snapshot,
            summary: {
              ...snapshot.summary,
              writeMethods: snapshot.summary.writeMethods + 1,
            },
          } as never;
        },
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("Invalid control catalog snapshot shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected preview dependency violates bounded AUTARCH invariants at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "preview-autarch-bounds-request-level",
        method: "prometheus.control.preview",
        params: {
          action: "autarch.gap-detection",
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
        runControlPreview: async () =>
          ({
            ok: true,
            payload: {
              ts: Date.now(),
              action: "autarch.gap-detection",
              mutatesState: false,
              preview: {
                suggestedGapCount: 2,
                suggestions: [
                  {
                    suggestionId: "gap-1",
                    goalId: "goal-1",
                    severity: "high",
                    description: "First",
                  },
                ],
              },
            },
          }) as never,
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });
});
