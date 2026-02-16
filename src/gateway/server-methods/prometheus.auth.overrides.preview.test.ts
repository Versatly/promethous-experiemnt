import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";
import { createPrometheusHandlers } from "./prometheus.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override regressions (control preview)", () => {
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
});
