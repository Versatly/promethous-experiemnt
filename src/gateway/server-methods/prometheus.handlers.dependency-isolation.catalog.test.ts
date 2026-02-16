import { describe, expect, it, vi } from "vitest";
import {
  getPrometheusPlannedMutatingMethodMetadata,
  getPrometheusPlannedMutatingMethodPreflight,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
} from "./prometheus-methods.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import {
  getPrometheusPlannedMutatingPreviewActionMetadata,
  getPrometheusPlannedMutatingPreviewActionPreflight,
  PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
} from "./prometheus.control-preview.js";
import { runPrometheusControlCatalogHandler } from "./prometheus.handler-test-helpers.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers dependency isolation (control catalog)", () => {
  it("does not invoke control-preview runner dependency for catalog requests", async () => {
    const runControlPreview = vi.fn(async () => {
      throw new Error("control preview dependency should not be called");
    });
    const buildControlCatalogSnapshot = vi.fn(() =>
      buildPrometheusControlCatalogSnapshot({ env: {}, now: 123 }),
    );
    const handlers = createPrometheusHandlers({
      runControlPreview,
      buildControlCatalogSnapshot,
    });

    const respond = vi.fn();
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "catalog-dependency-isolation",
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ts: 123,
      }),
      undefined,
    );
    expect(buildControlCatalogSnapshot).toHaveBeenCalledTimes(1);
    expect(runControlPreview).not.toHaveBeenCalled();
  });

  it("queries planned method/action resolvers only for canonical keys through handler seam", async () => {
    const plannedMethodKeys = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted();
    const plannedActionKeys = Object.keys(
      PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
    ).toSorted();
    const resolvePlannedMethodMetadata = vi.fn((method: string) =>
      getPrometheusPlannedMutatingMethodMetadata(method),
    );
    const resolvePlannedMethodPreflight = vi.fn((method: string) =>
      getPrometheusPlannedMutatingMethodPreflight(method),
    );
    const resolvePlannedActionMetadata = vi.fn((action: string) =>
      getPrometheusPlannedMutatingPreviewActionMetadata(action),
    );
    const resolvePlannedActionPreflight = vi.fn((action: string) =>
      getPrometheusPlannedMutatingPreviewActionPreflight(action),
    );
    const runControlPreview = vi.fn(async () => {
      throw new Error("control preview dependency should not be called");
    });
    const buildControlCatalogSnapshot = vi.fn(() =>
      buildPrometheusControlCatalogSnapshot({
        env: {},
        now: 124,
        resolvePlannedMethodMetadata,
        resolvePlannedMethodPreflight,
        resolvePlannedActionMetadata,
        resolvePlannedActionPreflight,
      }),
    );
    const handlers = createPrometheusHandlers({
      runControlPreview,
      buildControlCatalogSnapshot,
    });

    const respond = vi.fn();
    await runPrometheusControlCatalogHandler({
      handlers,
      requestId: "catalog-planned-resolver-scope",
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ts: 124,
      }),
      undefined,
    );
    expect(buildControlCatalogSnapshot).toHaveBeenCalledTimes(1);
    expect(runControlPreview).not.toHaveBeenCalled();
    expect(resolvePlannedMethodMetadata).toHaveBeenCalledTimes(plannedMethodKeys.length);
    expect(resolvePlannedMethodPreflight).toHaveBeenCalledTimes(plannedMethodKeys.length);
    expect(resolvePlannedActionMetadata).toHaveBeenCalledTimes(plannedActionKeys.length);
    expect(resolvePlannedActionPreflight).toHaveBeenCalledTimes(plannedActionKeys.length);
    expect(resolvePlannedMethodMetadata.mock.calls.map(([method]) => method).toSorted()).toEqual(
      plannedMethodKeys,
    );
    expect(resolvePlannedMethodPreflight.mock.calls.map(([method]) => method).toSorted()).toEqual(
      plannedMethodKeys,
    );
    expect(resolvePlannedActionMetadata.mock.calls.map(([action]) => action).toSorted()).toEqual(
      plannedActionKeys,
    );
    expect(resolvePlannedActionPreflight.mock.calls.map(([action]) => action).toSorted()).toEqual(
      plannedActionKeys,
    );
  });
});
