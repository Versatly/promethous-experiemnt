import { describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { runPrometheusControlPreviewHandler } from "./prometheus.handler-test-helpers.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers.prometheus.control.preview injected result validation", () => {
  it("returns UNAVAILABLE when injected control preview success payload mutability diverges", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () =>
        ({
          ok: true,
          payload: {
            ts: Date.now(),
            action: "autarch.gap-detection",
            mutatesState: true,
            preview: {
              suggestedGapCount: 1,
              suggestedGaps: [],
            },
          },
        }) as never,
    });
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      handlers,
      requestId: "control-preview-invalid-success-mutability",
      params: {
        action: "autarch.gap-detection",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview success payload preview shape diverges", async () => {
    const handlers = createPrometheusHandlers({
      runControlPreview: async () =>
        ({
          ok: true,
          payload: {
            ts: Date.now(),
            action: "autarch.gap-detection",
            mutatesState: false,
            preview: {
              suggestedGapCount: "1",
              suggestions: [],
            },
          },
        }) as never,
    });
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      handlers,
      requestId: "control-preview-invalid-success-preview-shape",
      params: {
        action: "autarch.gap-detection",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview AUTARCH payload count diverges from suggestions", async () => {
    const handlers = createPrometheusHandlers({
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
    });
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      handlers,
      requestId: "control-preview-invalid-autarch-count",
      params: {
        action: "autarch.gap-detection",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });

  it("returns UNAVAILABLE when injected control preview HELIOS payload ratios exceed bounds", async () => {
    const handlers = createPrometheusHandlers({
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
                score: 0.6,
              },
              priorWindowSize: 1,
              divergence: null,
            },
          },
        }) as never,
    });
    const respond = vi.fn();
    await runPrometheusControlPreviewHandler({
      handlers,
      requestId: "control-preview-invalid-helios-ratio-bounds",
      params: {
        action: "helios.trajectory-evaluation",
        goalId: "goal-1",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("Invalid control preview result shape"),
      }),
    );
  });
});
