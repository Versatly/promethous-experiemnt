import { describe, expect, it, vi } from "vitest";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_GATEWAY_METHOD_METADATA,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
} from "./prometheus-methods.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  PROMETHEUS_CONTROL_PREVIEW_ACTIONS,
  PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
  PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
} from "./prometheus.control-preview.js";
import { runPrometheusControlCatalogHandler } from "./prometheus.handler-test-helpers.js";

describe("prometheus control-catalog consistency", () => {
  it("keeps control catalog response aligned with method/action metadata", async () => {
    const respond = vi.fn();
    await runPrometheusControlCatalogHandler({
      requestId: "control-catalog",
      respond,
    });

    expect(respond).toHaveBeenCalledWith(true, expect.any(Object), undefined);
    const payload = respond.mock.calls[0]?.[1] as {
      summary: {
        totalMethods: number;
        readMethods: number;
        writeMethods: number;
        mutatingMethods: number;
        plannedMutatingMethods: number;
        previewActions: number;
        mutatingPreviewActions: number;
        plannedMutatingPreviewActions: number;
      };
      guardrails: {
        mutationsEnabled: boolean;
        enableEnvVar: string;
        mutatingMethods: string[];
        mutatingPreviewActions: string[];
        plannedMutatingMethods: Array<{
          method: string;
          access: string;
          mutatesState: boolean;
          enabled: boolean;
          enableEnvVar: string;
          requiredParams: string[];
          preflight: {
            disabledMessage: string;
            notImplementedMessage: string;
            requiredParamsMessage: string;
          };
        }>;
        plannedMutatingPreviewActions: Array<{
          action: string;
          mutatesState: boolean;
          enabled: boolean;
          enableEnvVar: string;
          requiredParams: string[];
          preflight: {
            disabledMessage: string;
            notImplementedMessage: string;
            requiredParamsMessage: string;
          };
        }>;
      };
      methods: Array<{ method: string; access: string; mutatesState: boolean }>;
      controlPreview: {
        method: string;
        actions: Array<{
          action: string;
          mutatesState: boolean;
          requiredParams: string[];
        }>;
      };
    };
    const methodMapFromCatalog = Object.fromEntries(
      payload.methods.map((methodEntry) => [
        methodEntry.method,
        {
          access: methodEntry.access,
          mutatesState: methodEntry.mutatesState,
        },
      ]),
    );
    expect(methodMapFromCatalog).toEqual(PROMETHEUS_GATEWAY_METHOD_METADATA);
    expect(payload.controlPreview.method).toBe("prometheus.control.preview");
    expect(payload.controlPreview.actions).toHaveLength(PROMETHEUS_CONTROL_PREVIEW_ACTIONS.length);
    expect(payload.summary.totalMethods).toBe(payload.methods.length);
    expect(payload.summary.readMethods + payload.summary.writeMethods).toBe(payload.methods.length);
    expect(payload.summary.mutatingMethods).toBe(
      payload.methods.filter((method) => method.mutatesState).length,
    );
    expect(payload.summary.plannedMutatingMethods).toBe(
      payload.guardrails.plannedMutatingMethods.length,
    );
    expect(payload.summary.previewActions).toBe(payload.controlPreview.actions.length);
    expect(payload.summary.mutatingPreviewActions).toBe(
      payload.controlPreview.actions.filter((action) => action.mutatesState).length,
    );
    expect(payload.summary.plannedMutatingPreviewActions).toBe(
      payload.guardrails.plannedMutatingPreviewActions.length,
    );
    expect(payload.guardrails.enableEnvVar).toBe("OPENCLAW_PROMETHEUS_MUTATING_CONTROLS");
    expect(payload.guardrails.mutatingMethods).toEqual(
      payload.methods
        .filter((method) => method.mutatesState)
        .map((method) => method.method)
        .toSorted(),
    );
    expect(payload.guardrails.mutatingPreviewActions).toEqual(
      payload.controlPreview.actions
        .filter((action) => action.mutatesState)
        .map((action) => action.action)
        .toSorted(),
    );
    expect(payload.methods.map((method) => method.method)).toEqual(
      expect.not.arrayContaining(Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA)),
    );
    expect(payload.controlPreview.actions.map((action) => action.action)).toEqual(
      expect.not.arrayContaining(Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)),
    );
    const plannedMethodMetadata = getPrometheusPlannedMutatingMethodMetadata(
      "prometheus.control.execute",
    );
    const plannedActionMetadata = getPrometheusPlannedMutatingPreviewActionMetadata(
      "autarch.gap-detection.commit",
    );
    expect(plannedMethodMetadata).toBeDefined();
    expect(plannedActionMetadata).toBeDefined();
    if (!plannedMethodMetadata || !plannedActionMetadata) {
      return;
    }
    expect(payload.guardrails.plannedMutatingMethods.length).toBeGreaterThan(0);
    expect(payload.guardrails.plannedMutatingMethods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "prometheus.control.execute",
          access: "write",
          mutatesState: true,
          enabled: false,
          enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
          requiredParams: ["action"],
          preflight: buildPrometheusPlannedMutatingMethodPreflight({
            method: "prometheus.control.execute",
            metadata: plannedMethodMetadata,
          }),
        }),
      ]),
    );
    expect(payload.guardrails.plannedMutatingPreviewActions.length).toBeGreaterThan(0);
    expect(payload.guardrails.plannedMutatingPreviewActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "autarch.gap-detection.commit",
          mutatesState: true,
          enabled: false,
          enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
          preflight: buildPrometheusPlannedMutatingPreviewActionPreflight({
            action: "autarch.gap-detection.commit",
            metadata: plannedActionMetadata,
          }),
        }),
      ]),
    );
    expect(payload.guardrails.mutationsEnabled).toBe(false);

    for (const action of PROMETHEUS_CONTROL_PREVIEW_ACTIONS) {
      expect(payload.controlPreview.actions).toContainEqual(
        expect.objectContaining({
          action,
          mutatesState: PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[action].mutatesState,
          requiredParams: [...PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[action].requiredParams],
        }),
      );
    }
  });
});
