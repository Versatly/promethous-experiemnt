import { describe, expect, it } from "vitest";
import { isPrometheusControlCatalogSnapshot } from "./prometheus.contract-guards.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";

describe("prometheus contract guards", () => {
  it("accepts canonical control catalog snapshots", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {}, now: 123 });
    expect(isPrometheusControlCatalogSnapshot(snapshot)).toBe(true);
  });

  it("rejects control catalog snapshots with canonical method-coverage drift", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {} });
    const malformedSnapshot = {
      ...snapshot,
      methods: snapshot.methods.map((method, index, methods) =>
        index === methods.length - 1 ? (methods[0] ?? method) : method,
      ),
    };
    expect(isPrometheusControlCatalogSnapshot(malformedSnapshot)).toBe(false);
  });

  it("rejects control catalog snapshots with control-preview action coverage drift", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {} });
    const malformedSnapshot = {
      ...snapshot,
      controlPreview: {
        ...snapshot.controlPreview,
        actions: snapshot.controlPreview.actions.slice(1),
      },
    };
    expect(isPrometheusControlCatalogSnapshot(malformedSnapshot)).toBe(false);
  });

  it("rejects control catalog snapshots with planned mutating method coverage drift", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {} });
    const malformedSnapshot = {
      ...snapshot,
      guardrails: {
        ...snapshot.guardrails,
        plannedMutatingMethods: snapshot.guardrails.plannedMutatingMethods.slice(1),
      },
    };
    expect(isPrometheusControlCatalogSnapshot(malformedSnapshot)).toBe(false);
  });

  it("rejects control catalog snapshots with planned mutating preview-action coverage drift", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {} });
    const malformedSnapshot = {
      ...snapshot,
      guardrails: {
        ...snapshot.guardrails,
        plannedMutatingPreviewActions: snapshot.guardrails.plannedMutatingPreviewActions.slice(1),
      },
    };
    expect(isPrometheusControlCatalogSnapshot(malformedSnapshot)).toBe(false);
  });

  it("rejects control catalog snapshots with summary read/write drift", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {} });
    const malformedSnapshot = {
      ...snapshot,
      summary: {
        ...snapshot.summary,
        readMethods: snapshot.summary.readMethods + 1,
      },
    };
    expect(isPrometheusControlCatalogSnapshot(malformedSnapshot)).toBe(false);
  });

  it("rejects control catalog snapshots with divergent planned preflight metadata", () => {
    const snapshot = buildPrometheusControlCatalogSnapshot({ env: {} });
    const malformedSnapshot = {
      ...snapshot,
      guardrails: {
        ...snapshot.guardrails,
        plannedMutatingPreviewActions: snapshot.guardrails.plannedMutatingPreviewActions.map(
          (action, index) =>
            index === 0
              ? {
                  ...action,
                  preflight: {
                    ...action.preflight,
                    disabledMessage: "DIVERGENT disabled message",
                  },
                }
              : action,
        ),
      },
    };
    expect(isPrometheusControlCatalogSnapshot(malformedSnapshot)).toBe(false);
  });
});
