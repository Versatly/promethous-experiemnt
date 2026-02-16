import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { createFilePrometheusEventStore } from "../../prometheus/index.js";
import { ErrorCodes } from "../protocol/index.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
} from "./prometheus.control-preview.js";
import { prometheusHandlers } from "./prometheus.js";
import { formatPrometheusMissingRequiredParamsMessage } from "./prometheus.preflight-guards.js";
import { createPrometheusTempDirHarness } from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheus control-preview error shape parity", () => {
  it("uses INVALID_REQUEST for control preview validation failures", async () => {
    const missingActionRespond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-missing-action", method: "prometheus.control.preview" },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond: missingActionRespond,
      context: {} as GatewayRequestContext,
    });
    expect(missingActionRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: "action is required for prometheus.control.preview",
      }),
    );

    const unsupportedActionRespond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-unsupported", method: "prometheus.control.preview" },
      params: { action: "unsupported.action" },
      client: null,
      isWebchatConnect: () => false,
      respond: unsupportedActionRespond,
      context: {} as GatewayRequestContext,
    });
    expect(unsupportedActionRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "unsupported.action"',
      }),
    );

    const stateDir = await makeTempDir("gateway-prometheus-errors-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-rec-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-rec",
        title: "Recursion goal",
        objective: "Evaluate mutation",
      },
    });

    const incompleteRecursionRespond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-rec-invalid", method: "prometheus.control.preview" },
      params: {
        stateDir,
        action: "recursion.mutation-evaluation",
        proposal: {
          mutationId: "mut-1",
          title: "Invalid proposal",
          hypothesis: "missing snapshots",
        },
      },
      client: null,
      isWebchatConnect: () => false,
      respond: incompleteRecursionRespond,
      context: {} as GatewayRequestContext,
    });
    expect(incompleteRecursionRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: formatPrometheusMissingRequiredParamsMessage({
          kind: "action",
          name: "recursion.mutation-evaluation",
          missingParams: ["baseline", "candidate"],
        }),
      }),
    );
  });

  it("uses UNAVAILABLE for planned mutating preview actions before rollout", async () => {
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(
      "autarch.gap-detection.commit",
    );
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = buildPrometheusPlannedMutatingPreviewActionPreflight({
      action: "autarch.gap-detection.commit",
      metadata,
    });
    const plannedActionRespond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-planned-disabled", method: "prometheus.control.preview" },
      params: {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      client: null,
      isWebchatConnect: () => false,
      respond: plannedActionRespond,
      context: {} as GatewayRequestContext,
    });
    expect(plannedActionRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: preflight.disabledMessage,
      }),
    );
  });
});
