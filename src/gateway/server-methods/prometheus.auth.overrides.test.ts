import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";
import { createPrometheusHandlers } from "./prometheus.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override regressions", () => {
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

  it("returns UNAVAILABLE when injected catalog dependency violates canonical method coverage at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "catalog-method-coverage-request-level",
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
            methods: snapshot.methods.map((method, index, methods) =>
              index === methods.length - 1 ? (methods[0] ?? method) : method,
            ),
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

  it("returns UNAVAILABLE when injected catalog dependency diverges planned metadata contract at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "catalog-planned-metadata-divergence-request-level",
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
            guardrails: {
              ...snapshot.guardrails,
              plannedMutatingMethods: snapshot.guardrails.plannedMutatingMethods.map(
                (method, index) =>
                  index === 0
                    ? {
                        ...method,
                        reason: "DIVERGENT reason",
                      }
                    : method,
              ),
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

  it("returns UNAVAILABLE when injected catalog dependency diverges planned preflight contract at request level", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "catalog-planned-preflight-divergence-request-level",
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
            guardrails: {
              ...snapshot.guardrails,
              plannedMutatingPreviewActions: snapshot.guardrails.plannedMutatingPreviewActions.map(
                (action, index) =>
                  index === 0
                    ? {
                        ...action,
                        preflight: {
                          ...action.preflight,
                          disabledMessage: "DIVERGENT disabled message",
                        },
                      }
                    : action,
              ),
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
