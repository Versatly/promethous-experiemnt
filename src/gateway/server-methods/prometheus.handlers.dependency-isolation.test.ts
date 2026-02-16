import { describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { ErrorCodes } from "../protocol/index.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import { createPrometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers dependency isolation", () => {
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
    await handlers["prometheus.control.catalog"]({
      req: {
        type: "req",
        id: "catalog-dependency-isolation",
        method: "prometheus.control.catalog",
      },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
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

  it("does not invoke control-catalog snapshot dependency for preview requests", async () => {
    const buildControlCatalogSnapshot = vi.fn(() => {
      throw new Error("catalog snapshot dependency should not be called");
    });
    const runControlPreview = vi.fn(async () => ({
      ok: true as const,
      payload: {
        ts: 456,
        action: "autarch.gap-detection" as const,
        mutatesState: false as const,
        preview: {
          suggestedGapCount: 0,
          suggestions: [],
        },
      },
    }));
    const handlers = createPrometheusHandlers({
      buildControlCatalogSnapshot,
      runControlPreview,
    });

    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "preview-dependency-isolation",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ts: 456,
        action: "autarch.gap-detection",
      }),
      undefined,
    );
    expect(runControlPreview).toHaveBeenCalledTimes(1);
    expect(buildControlCatalogSnapshot).not.toHaveBeenCalled();
  });

  it("forwards controlPreviewDeps to injected preview runner", async () => {
    const controlPreviewDeps = {
      resolvePlannedActionMetadata: vi.fn(() => undefined),
      resolvePlannedActionPreflight: vi.fn(() => undefined),
    };
    const runControlPreview = vi.fn(async () => ({
      ok: true as const,
      payload: {
        ts: 789,
        action: "autarch.gap-detection" as const,
        mutatesState: false as const,
        preview: {
          suggestedGapCount: 0,
          suggestions: [],
        },
      },
    }));
    const handlers = createPrometheusHandlers({
      runControlPreview,
      controlPreviewDeps,
    });

    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "preview-dependency-forwarding",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ts: 789,
      }),
      undefined,
    );
    expect(runControlPreview).toHaveBeenCalledWith(
      expect.objectContaining({ action: "autarch.gap-detection" }),
      controlPreviewDeps,
    );
    expect(controlPreviewDeps.resolvePlannedActionMetadata).not.toHaveBeenCalled();
    expect(controlPreviewDeps.resolvePlannedActionPreflight).not.toHaveBeenCalled();
  });

  it("prefers injected preview runner over default planned-action deps", async () => {
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("default preview runner should not invoke planned-action metadata");
    });
    const runControlPreview = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: ErrorCodes.UNAVAILABLE,
        message: "injected preview runner handled planned action",
      },
    }));
    const handlers = createPrometheusHandlers({
      runControlPreview,
      controlPreviewDeps: {
        resolvePlannedActionMetadata,
      },
    });

    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "preview-injected-runner-precedence",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: "injected preview runner handled planned action",
      }),
    );
    expect(runControlPreview).toHaveBeenCalledTimes(1);
    expect(resolvePlannedActionMetadata).not.toHaveBeenCalled();
  });

  it("uses controlPreviewDeps with default preview runner for planned actions", async () => {
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("planned-action metadata dependency exploded");
    });
    const handlers = createPrometheusHandlers({
      controlPreviewDeps: {
        resolvePlannedActionMetadata,
      },
    });

    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "preview-default-runner-dependency",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(resolvePlannedActionMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePlannedActionMetadata).toHaveBeenCalledWith("autarch.gap-detection.commit");
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining("planned-action metadata dependency exploded"),
      }),
    );
  });

  it("does not invoke default preview planned-action deps for active actions", async () => {
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("planned-action metadata dependency should not run for active actions");
    });
    const handlers = createPrometheusHandlers({
      controlPreviewDeps: {
        resolvePlannedActionMetadata,
      },
    });

    const respond = vi.fn();
    await handlers["prometheus.control.preview"]({
      req: {
        type: "req",
        id: "preview-default-runner-active-action-short-circuit",
        method: "prometheus.control.preview",
      },
      params: {
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "autarch.gap-detection",
        mutatesState: false,
      }),
      undefined,
    );
    expect(resolvePlannedActionMetadata).not.toHaveBeenCalled();
  });
});
