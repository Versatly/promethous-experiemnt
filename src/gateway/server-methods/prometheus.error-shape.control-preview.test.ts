import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
} from "./prometheus.control-preview.js";
import { runPrometheusControlPreviewHandler } from "./prometheus.handler-test-helpers.js";
import { formatPrometheusMissingRequiredParamsMessage } from "./prometheus.preflight-guards.js";
import { createGoalCreatedEvent } from "./prometheus.test-events.js";
import {
  createPrometheusEventStoreForStateDir,
  createPrometheusTempDirHarness,
} from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheus control-preview error shape parity", () => {
  it("uses INVALID_REQUEST for control preview validation failures", async () => {
    const missingActionRespond = vi.fn();
    await runPrometheusControlPreviewHandler({
      requestId: "control-missing-action",
      params: {},
      respond: missingActionRespond,
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
    await runPrometheusControlPreviewHandler({
      requestId: "control-unsupported",
      params: { action: "unsupported.action" },
      respond: unsupportedActionRespond,
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
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.append(
      createGoalCreatedEvent({
        id: "evt-rec-goal",
        occurredAt: 1,
        goalId: "goal-rec",
        title: "Recursion goal",
        objective: "Evaluate mutation",
      }),
    );

    const incompleteRecursionRespond = vi.fn();
    await runPrometheusControlPreviewHandler({
      requestId: "control-rec-invalid",
      params: {
        stateDir,
        action: "recursion.mutation-evaluation",
        proposal: {
          mutationId: "mut-1",
          title: "Invalid proposal",
          hypothesis: "missing snapshots",
        },
      },
      respond: incompleteRecursionRespond,
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
    await runPrometheusControlPreviewHandler({
      requestId: "control-planned-disabled",
      params: {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      respond: plannedActionRespond,
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
