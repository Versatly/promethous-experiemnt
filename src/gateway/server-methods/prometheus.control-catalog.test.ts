import { describe, expect, it } from "vitest";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
} from "./prometheus-methods.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
} from "./prometheus.control-preview.js";

describe("prometheus control catalog builder", () => {
  it("builds a consistent snapshot with summary counts", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ now: 123, env: {} });

    expect(snapshot.ts).toBe(123);
    expect(snapshot.summary.totalMethods).toBe(snapshot.methods.length);
    expect(snapshot.summary.readMethods + snapshot.summary.writeMethods).toBe(
      snapshot.methods.length,
    );
    expect(snapshot.summary.mutatingMethods).toBe(snapshot.guardrails.mutatingMethods.length);
    expect(snapshot.summary.plannedMutatingMethods).toBe(
      snapshot.guardrails.plannedMutatingMethods.length,
    );
    expect(snapshot.summary.previewActions).toBe(snapshot.controlPreview.actions.length);
    expect(snapshot.summary.mutatingPreviewActions).toBe(
      snapshot.guardrails.mutatingPreviewActions.length,
    );
    expect(snapshot.summary.plannedMutatingPreviewActions).toBe(
      snapshot.guardrails.plannedMutatingPreviewActions.length,
    );
    expect(snapshot.guardrails.enableEnvVar).toBe(PROMETHEUS_MUTATING_CONTROLS_ENV);
    expect(snapshot.guardrails.mutationsEnabled).toBe(false);
  });

  it("reports mutationsEnabled=true when guardrail env is enabled", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: { [PROMETHEUS_MUTATING_CONTROLS_ENV]: "1" },
    });
    expect(snapshot.guardrails.mutationsEnabled).toBe(true);
  });

  it("keeps planned mutating entries disjoint from active catalog entries", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {} });
    const activeMethods = new Set(snapshot.methods.map((method) => method.method));
    const plannedMethods = snapshot.guardrails.plannedMutatingMethods.map(
      (method) => method.method,
    );
    const activeActions = new Set(snapshot.controlPreview.actions.map((action) => action.action));
    const plannedActions = snapshot.guardrails.plannedMutatingPreviewActions.map(
      (action) => action.action,
    );

    expect(plannedMethods.every((method) => !activeMethods.has(method))).toBe(true);
    expect(plannedActions.every((action) => !activeActions.has(action))).toBe(true);
  });

  it("projects planned mutating metadata entries into guardrail payloads", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {} });
    const plannedMethodKeys = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted();
    const plannedActionKeys = Object.keys(
      PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
    ).toSorted();

    expect(
      snapshot.guardrails.plannedMutatingMethods.map((method) => method.method).toSorted(),
    ).toEqual(plannedMethodKeys);
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.map((action) => action.action).toSorted(),
    ).toEqual(plannedActionKeys);
    expect(
      snapshot.guardrails.plannedMutatingMethods.every(
        (method) => method.enableEnvVar === PROMETHEUS_MUTATING_CONTROLS_ENV,
      ),
    ).toBe(true);
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.every(
        (action) => action.enableEnvVar === PROMETHEUS_MUTATING_CONTROLS_ENV,
      ),
    ).toBe(true);
    for (const method of snapshot.guardrails.plannedMutatingMethods) {
      const metadata = getPrometheusPlannedMutatingMethodMetadata(method.method);
      expect(metadata).toBeDefined();
      if (!metadata) {
        continue;
      }
      expect(method.requiredParams).toEqual(metadata.requiredParams);
      expect(method.preflight).toEqual(
        buildPrometheusPlannedMutatingMethodPreflight({
          method: method.method,
          metadata,
        }),
      );
    }
    for (const action of snapshot.guardrails.plannedMutatingPreviewActions) {
      const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(action.action);
      expect(metadata).toBeDefined();
      if (!metadata) {
        continue;
      }
      expect(action.requiredParams).toEqual(metadata.requiredParams);
      expect(action.preflight).toEqual(
        buildPrometheusPlannedMutatingPreviewActionPreflight({
          action: action.action,
          metadata,
        }),
      );
    }
  });

  it("keeps planned mutating method required params usable for future contract validation", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {} });
    expect(
      snapshot.guardrails.plannedMutatingMethods.every(
        (method) =>
          method.requiredParams.length > 0 &&
          new Set(method.requiredParams).size === method.requiredParams.length,
      ),
    ).toBe(true);
    expect(
      snapshot.guardrails.plannedMutatingMethods.find(
        (method) => method.method === "prometheus.control.execute",
      ),
    ).toEqual(
      expect.objectContaining({
        requiredParams: ["action"],
      }),
    );
  });

  it("fails fast when planned mutating method metadata lookup misses known entries", () => {
    const plannedMethod = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted()[0]!;
    expect(() =>
      buildPrometheusControlCatalogSnapshot({
        env: {},
        resolvePlannedMethodMetadata: () => undefined,
      }),
    ).toThrow(`Missing planned mutating method metadata for "${plannedMethod}"`);
  });

  it("fails fast when planned mutating method preflight lookup misses known entries", () => {
    const plannedMethod = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted()[0]!;
    expect(() =>
      buildPrometheusControlCatalogSnapshot({
        env: {},
        resolvePlannedMethodPreflight: () => undefined,
      }),
    ).toThrow(`Missing planned mutating method preflight for "${plannedMethod}"`);
  });

  it("fails fast when planned mutating action metadata lookup misses known entries", () => {
    const plannedAction = Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)
      .toSorted()
      .at(0)!;
    expect(() =>
      buildPrometheusControlCatalogSnapshot({
        env: {},
        resolvePlannedActionMetadata: () => undefined,
      }),
    ).toThrow(`Missing planned mutating action metadata for "${plannedAction}"`);
  });

  it("fails fast when planned mutating action preflight lookup misses known entries", () => {
    const plannedAction = Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA)
      .toSorted()
      .at(0)!;
    expect(() =>
      buildPrometheusControlCatalogSnapshot({
        env: {},
        resolvePlannedActionPreflight: () => undefined,
      }),
    ).toThrow(`Missing planned mutating action preflight for "${plannedAction}"`);
  });
});
