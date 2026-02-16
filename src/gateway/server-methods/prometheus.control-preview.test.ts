import { describe, expect, it } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import {
  PROMETHEUS_CONTROL_PREVIEW_ACTIONS,
  isPrometheusControlPreviewAction,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";

describe("prometheus control preview helpers", () => {
  it("exposes a unique action set and matching type guard", () => {
    const actions = [...PROMETHEUS_CONTROL_PREVIEW_ACTIONS];
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual([
      "autarch.gap-detection",
      "helios.trajectory-evaluation",
      "recursion.mutation-evaluation",
    ]);
    expect(actions.every((action) => isPrometheusControlPreviewAction(action))).toBe(true);
    expect(isPrometheusControlPreviewAction("unknown.action")).toBe(false);
  });

  it("returns INVALID_REQUEST for missing or unsupported actions", async () => {
    const missingAction = await runPrometheusControlPreview({});
    expect(missingAction).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: "action is required for prometheus.control.preview",
      },
    });

    const unsupportedAction = await runPrometheusControlPreview({
      action: "unknown.action",
    });
    expect(unsupportedAction).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "unknown.action"',
      },
    });
  });
});
