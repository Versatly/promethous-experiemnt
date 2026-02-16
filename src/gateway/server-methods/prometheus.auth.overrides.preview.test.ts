import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";
import { createPrometheusHandlers } from "./prometheus.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override regressions (control preview)", () => {
  it("does not invoke injected Prometheus preview dependencies for non-prometheus request methods", async () => {
    const runControlPreview = vi.fn(async () => {
      throw new Error("preview dependency should not be called");
    });
    const buildControlCatalogSnapshot = vi.fn(() => {
      throw new Error("catalog dependency should not be called");
    });
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "non-prometheus-extra-handler-short-circuit",
        method: "status",
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
        runControlPreview,
        buildControlCatalogSnapshot,
      }),
    });

    expect(respond).toHaveBeenCalled();
    const [ok] = respond.mock.calls[0] as [boolean, unknown, unknown];
    expect(ok).toBe(true);
    expect(runControlPreview).not.toHaveBeenCalled();
    expect(buildControlCatalogSnapshot).not.toHaveBeenCalled();
  });

  it("invokes planned-action resolvers once for planned action request path", async () => {
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
    const resolvePlannedActionMetadata = vi.fn((requestedAction: string) =>
      getPrometheusPlannedMutatingPreviewActionMetadata(requestedAction),
    );
    const resolvePlannedActionPreflight = vi.fn((requestedAction: string) => {
      const requestedMetadata = getPrometheusPlannedMutatingPreviewActionMetadata(requestedAction);
      if (!requestedMetadata) {
        return undefined;
      }
      return buildPrometheusPlannedMutatingPreviewActionPreflight({
        action: requestedAction,
        metadata: requestedMetadata,
      });
    });

    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "planned-action-resolver-invocation-scope-request-level",
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
            resolvePlannedActionMetadata,
            resolvePlannedActionPreflight,
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
    expect(resolvePlannedActionMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePlannedActionPreflight).toHaveBeenCalledTimes(1);
    expect(resolvePlannedActionMetadata).toHaveBeenCalledWith(action);
    expect(resolvePlannedActionPreflight).toHaveBeenCalledWith(action);
  });

  it("does not invoke planned-action resolvers for active non-planned action request path", async () => {
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("planned-action metadata resolver should not be called");
    });
    const resolvePlannedActionPreflight = vi.fn(() => {
      throw new Error("planned-action preflight resolver should not be called");
    });
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "active-action-resolver-short-circuit-request-level",
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
        runControlPreview: (params, deps) =>
          runPrometheusControlPreview(params, {
            ...deps,
            resolvePlannedActionMetadata,
            resolvePlannedActionPreflight,
          }),
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "autarch.gap-detection",
        mutatesState: false,
      }),
      undefined,
    );
    expect(resolvePlannedActionMetadata).not.toHaveBeenCalled();
    expect(resolvePlannedActionPreflight).not.toHaveBeenCalled();
  });

  it("forwards controlPreviewDeps at request level for planned-action paths", async () => {
    const action = "autarch.gap-detection.commit";
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("request-level controlPreviewDeps metadata dependency exploded");
    });
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "request-level-control-preview-deps-forwarding-planned-action",
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
        controlPreviewDeps: {
          resolvePlannedActionMetadata,
        },
      }),
    });

    expect(resolvePlannedActionMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePlannedActionMetadata).toHaveBeenCalledWith(action);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining(
          "request-level controlPreviewDeps metadata dependency exploded",
        ),
      }),
    );
  });

  it("does not use controlPreviewDeps planned-action resolvers for active non-planned request paths", async () => {
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("controlPreviewDeps metadata resolver should not be called");
    });
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "request-level-control-preview-deps-short-circuit-active-action",
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
        controlPreviewDeps: {
          resolvePlannedActionMetadata,
        },
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "autarch.gap-detection",
        mutatesState: false,
      }),
      undefined,
    );
    expect(resolvePlannedActionMetadata).not.toHaveBeenCalled();
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

  it("returns UNAVAILABLE when injected preview dependency violates bounded HELIOS invariants at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "preview-helios-bounds-request-level",
        method: "prometheus.control.preview",
        params: {
          action: "helios.trajectory-evaluation",
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
        runControlPreview: async () =>
          ({
            ok: true,
            payload: {
              ts: Date.now(),
              action: "helios.trajectory-evaluation",
              mutatesState: false,
              preview: {
                goalId: "goal-1",
                goalStatus: "active",
                computedSnapshot: {
                  at: Date.now(),
                  completionRatio: 0.8,
                  blockedRatio: 0.5,
                  score: 0.7,
                },
                priorWindowSize: 2,
                divergence: null,
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

  it("returns UNAVAILABLE when injected preview dependency violates HELIOS divergence-severity contract at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "preview-helios-divergence-severity-request-level",
        method: "prometheus.control.preview",
        params: {
          action: "helios.trajectory-evaluation",
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
        runControlPreview: async () =>
          ({
            ok: true,
            payload: {
              ts: Date.now(),
              action: "helios.trajectory-evaluation",
              mutatesState: false,
              preview: {
                goalId: "goal-1",
                goalStatus: "active",
                computedSnapshot: {
                  at: Date.now(),
                  completionRatio: 0.4,
                  blockedRatio: 0.1,
                  score: 0.6,
                },
                priorWindowSize: 2,
                divergence: {
                  severity: "critical",
                  reason: "invalid severity",
                  scoreDrop: 0.3,
                  latestScore: 0.6,
                },
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

  it("returns UNAVAILABLE when injected preview dependency violates bounded recursion invariants at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "preview-recursion-bounds-request-level",
        method: "prometheus.control.preview",
        params: {
          action: "recursion.mutation-evaluation",
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
              action: "recursion.mutation-evaluation",
              mutatesState: false,
              preview: {
                evaluation: {
                  mutationId: "mut-1",
                  accepted: true,
                  scoreDelta: 1.2,
                  baselineScore: 0.4,
                  candidateScore: 1.1,
                  rationale: "invalid bounds",
                },
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

  it("keeps planned-action canonical metadata fallback at request level when injected metadata resolver returns malformed shape", async () => {
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
        id: "planned-action-malformed-metadata-request-level",
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
            resolvePlannedActionMetadata: () =>
              ({
                mutatesState: true,
                enabled: false,
                enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
                requiredParams: ["goalId", "goalId"],
                reason: "invalid required params",
              }) as never,
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
