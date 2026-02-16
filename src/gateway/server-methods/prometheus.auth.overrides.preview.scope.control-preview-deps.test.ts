import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";
import { createPrometheusHandlers } from "./prometheus.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization override invocation scope (control preview deps)", () => {
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
});
