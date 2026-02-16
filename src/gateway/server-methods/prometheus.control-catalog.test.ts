import { describe, expect, it } from "vitest";
import {
  PROMETHEUS_MUTATING_CONTROLS_ENV,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
} from "./prometheus-methods.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import { PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA } from "./prometheus.control-preview.js";
import {
  formatPlannedMutatingActionDisabledMessage,
  formatPlannedMutatingActionNotImplementedMessage,
  formatPlannedMutatingMethodDisabledMessage,
  formatPlannedMutatingMethodNotImplementedMessage,
} from "./prometheus.preflight-guards.js";

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
    expect(
      snapshot.guardrails.plannedMutatingMethods.every(
        (method) =>
          method.requiredParams.join(",") ===
            PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA[method.method]?.requiredParams.join(",") &&
          method.preflight.disabledMessage ===
            formatPlannedMutatingMethodDisabledMessage(method.method, method.enableEnvVar) &&
          method.preflight.notImplementedMessage ===
            formatPlannedMutatingMethodNotImplementedMessage(method.method),
      ),
    ).toBe(true);
    expect(
      snapshot.guardrails.plannedMutatingPreviewActions.every(
        (action) =>
          action.preflight.disabledMessage ===
            formatPlannedMutatingActionDisabledMessage(action.action, action.enableEnvVar) &&
          action.preflight.notImplementedMessage ===
            formatPlannedMutatingActionNotImplementedMessage(action.action),
      ),
    ).toBe(true);
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
});
