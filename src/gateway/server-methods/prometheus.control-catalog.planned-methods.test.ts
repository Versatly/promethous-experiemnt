import { describe, expect, it, vi } from "vitest";
import {
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusPlannedMutatingMethodMetadata,
  getPrometheusPlannedMutatingMethodPreflight,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
} from "./prometheus-methods.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";

describe("prometheus control catalog builder (planned method fallback)", () => {
  it("falls back to canonical metadata when planned mutating method metadata lookup misses known entries", () => {
    const plannedMethod = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted()[0]!;
    const metadata = getPrometheusPlannedMutatingMethodMetadata(plannedMethod);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedMethodMetadata: () => undefined,
    });
    expect(
      snapshot.guardrails.plannedMutatingMethods.find((method) => method.method === plannedMethod),
    ).toEqual(
      expect.objectContaining({
        reason: metadata.reason,
        requiredParams: metadata.requiredParams,
      }),
    );
  });

  it("queries planned mutating method resolvers only for canonical planned method keys", () => {
    const plannedMethodKeys = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted();
    const resolvePlannedMethodMetadata = vi.fn((method: string) =>
      getPrometheusPlannedMutatingMethodMetadata(method),
    );
    const resolvePlannedMethodPreflight = vi.fn((method: string) =>
      getPrometheusPlannedMutatingMethodPreflight(method),
    );

    buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedMethodMetadata,
      resolvePlannedMethodPreflight,
    });

    expect(resolvePlannedMethodMetadata).toHaveBeenCalledTimes(plannedMethodKeys.length);
    expect(resolvePlannedMethodPreflight).toHaveBeenCalledTimes(plannedMethodKeys.length);
    expect(resolvePlannedMethodMetadata.mock.calls.map(([method]) => method).toSorted()).toEqual(
      plannedMethodKeys,
    );
    expect(resolvePlannedMethodPreflight.mock.calls.map(([method]) => method).toSorted()).toEqual(
      plannedMethodKeys,
    );
  });

  it("falls back when planned mutating method preflight lookup misses known entries", () => {
    const plannedMethod = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted()[0]!;
    const metadata = getPrometheusPlannedMutatingMethodMetadata(plannedMethod);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedMethodPreflight: () => undefined,
    });
    expect(
      snapshot.guardrails.plannedMutatingMethods.find((method) => method.method === plannedMethod)
        ?.preflight,
    ).toEqual(
      buildPrometheusPlannedMutatingMethodPreflight({
        method: plannedMethod,
        metadata,
      }),
    );
  });

  it("falls back when planned mutating method preflight lookup returns malformed entries", () => {
    const plannedMethod = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted()[0]!;
    const metadata = getPrometheusPlannedMutatingMethodMetadata(plannedMethod);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedMethodPreflight: () =>
        ({
          disabledMessage: 123,
        }) as never,
    });
    expect(
      snapshot.guardrails.plannedMutatingMethods.find((method) => method.method === plannedMethod)
        ?.preflight,
    ).toEqual(
      buildPrometheusPlannedMutatingMethodPreflight({
        method: plannedMethod,
        metadata,
      }),
    );
  });

  it("falls back to canonical preflight when planned mutating method preflight lookup diverges", () => {
    const plannedMethod = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted()[0]!;
    const metadata = getPrometheusPlannedMutatingMethodMetadata(plannedMethod);
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedMethodPreflight: () => ({
        disabledMessage: "DIVERGENT disabled message",
        notImplementedMessage: "DIVERGENT not implemented message",
        requiredParamsMessage: "DIVERGENT required params message",
      }),
    });
    expect(
      snapshot.guardrails.plannedMutatingMethods.find((method) => method.method === plannedMethod)
        ?.preflight,
    ).toEqual(
      buildPrometheusPlannedMutatingMethodPreflight({
        method: plannedMethod,
        metadata,
      }),
    );
  });

  it("falls back to canonical metadata when planned mutating method metadata lookup diverges", () => {
    const plannedMethod = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted()[0]!;
    const canonicalMetadata = getPrometheusPlannedMutatingMethodMetadata(plannedMethod);
    expect(canonicalMetadata).toBeDefined();
    if (!canonicalMetadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedMethodMetadata: () => ({
        access: "write",
        mutatesState: true,
        enabled: false,
        enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
        requiredParams: [...canonicalMetadata.requiredParams],
        reason: "DIVERGENT reason",
      }),
    });
    expect(
      snapshot.guardrails.plannedMutatingMethods.find((method) => method.method === plannedMethod),
    ).toEqual(
      expect.objectContaining({
        reason: canonicalMetadata.reason,
        requiredParams: canonicalMetadata.requiredParams,
      }),
    );
  });

  it("falls back to canonical metadata when planned mutating method metadata reason is blank", () => {
    const plannedMethod = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted()[0]!;
    const canonicalMetadata = getPrometheusPlannedMutatingMethodMetadata(plannedMethod);
    expect(canonicalMetadata).toBeDefined();
    if (!canonicalMetadata) {
      return;
    }
    const snapshot = buildPrometheusControlCatalogSnapshot({
      env: {},
      resolvePlannedMethodMetadata: () =>
        ({
          access: "write",
          mutatesState: true,
          enabled: false,
          enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
          requiredParams: [...canonicalMetadata.requiredParams],
          reason: " ",
        }) as never,
    });
    expect(
      snapshot.guardrails.plannedMutatingMethods.find((method) => method.method === plannedMethod),
    ).toEqual(
      expect.objectContaining({
        reason: canonicalMetadata.reason,
      }),
    );
  });
});
