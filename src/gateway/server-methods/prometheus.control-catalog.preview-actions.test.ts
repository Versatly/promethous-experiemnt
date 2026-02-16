import { describe, expect, it } from "vitest";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
} from "./prometheus.control-preview.js";

describe("prometheus control catalog builder (planned preview-action fallback)", () => {
  it("falls back to canonical metadata when planned mutating action metadata lookup misses known entries", () => {
    const plannedAction = Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)
      .toSorted()
      .at(0)!;
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(plannedAction);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedActionMetadata: () => undefined,
    });
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.find(
        (action) => action.action === plannedAction,
      ),
    ).toEqual(
      expect.objectContaining({
        reason: metadata.reason,
        requiredParams: metadata.requiredParams,
      }),
    );
  });

  it("falls back when planned mutating action preflight lookup misses known entries", () => {
    const plannedAction = Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)
      .toSorted()
      .at(0)!;
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(plannedAction);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedActionPreflight: () => undefined,
    });
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.find(
        (action) => action.action === plannedAction,
      )?.preflight,
    ).toEqual(
      buildPrometheusPlannedMutatingPreviewActionPreflight({
        action: plannedAction,
        metadata,
      }),
    );
  });

  it("falls back when planned mutating action preflight lookup returns malformed entries", () => {
    const plannedAction = Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)
      .toSorted()
      .at(0)!;
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(plannedAction);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedActionPreflight: () =>
        ({
          disabledMessage: 123,
        }) as never,
    });
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.find(
        (action) => action.action === plannedAction,
      )?.preflight,
    ).toEqual(
      buildPrometheusPlannedMutatingPreviewActionPreflight({
        action: plannedAction,
        metadata,
      }),
    );
  });

  it("falls back to canonical preflight when planned mutating action preflight lookup diverges", () => {
    const plannedAction = Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)
      .toSorted()
      .at(0)!;
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(plannedAction);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedActionPreflight: () => ({
        disabledMessage: "DIVERGENT disabled message",
        notImplementedMessage: "DIVERGENT not implemented message",
        requiredParamsMessage: "DIVERGENT required params message",
      }),
    });
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.find(
        (action) => action.action === plannedAction,
      )?.preflight,
    ).toEqual(
      buildPrometheusPlannedMutatingPreviewActionPreflight({
        action: plannedAction,
        metadata,
      }),
    );
  });

  it("falls back to canonical metadata when planned mutating action metadata resolver returns malformed object", () => {
    const plannedAction = Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)
      .toSorted()
      .at(0)!;
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(plannedAction);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedActionMetadata: () =>
        ({
          mutatesState: true,
          enabled: false,
          enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
          requiredParams: ["goalId", "goalId"],
          reason: "invalid required params",
        }) as never,
    });
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.find(
        (action) => action.action === plannedAction,
      ),
    ).toEqual(
      expect.objectContaining({
        reason: metadata.reason,
        requiredParams: metadata.requiredParams,
      }),
    );
  });

  it("falls back to canonical metadata when planned mutating action metadata reason is blank", () => {
    const plannedAction = Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)
      .toSorted()
      .at(0)!;
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(plannedAction);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedActionMetadata: () =>
        ({
          mutatesState: true,
          enabled: false,
          enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
          requiredParams: [...metadata.requiredParams],
          reason: " ",
        }) as never,
    });
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.find(
        (action) => action.action === plannedAction,
      ),
    ).toEqual(
      expect.objectContaining({
        reason: metadata.reason,
      }),
    );
  });

  it("falls back to canonical metadata when planned mutating action metadata lookup diverges", () => {
    const plannedAction = Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)
      .toSorted()
      .at(0)!;
    const canonicalMetadata = getPrometheusPlannedMutatingPreviewActionMetadata(plannedAction);
    expect(canonicalMetadata).toBeDefined();
    if (!canonicalMetadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedActionMetadata: () => ({
        mutatesState: true,
        enabled: false,
        enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
        requiredParams: [...canonicalMetadata.requiredParams],
        reason: "DIVERGENT reason",
      }),
    });
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.find(
        (action) => action.action === plannedAction,
      ),
    ).toEqual(
      expect.objectContaining({
        reason: canonicalMetadata.reason,
        requiredParams: canonicalMetadata.requiredParams,
      }),
    );
  });
});
