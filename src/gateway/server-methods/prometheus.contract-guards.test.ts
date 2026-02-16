import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isPrometheusControlCatalogSnapshot,
  isPrometheusControlPreviewResult,
} from "./prometheus.contract-guards.js";
import { buildPrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import { runPrometheusControlPreview } from "./prometheus.control-preview.js";

const cleanupDirs = new Set<string>();

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  cleanupDirs.add(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  cleanupDirs.clear();
});

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

  it("accepts valid control preview success results", async () => {
    const stateDir = await makeTempDir("prometheus-contract-guards-preview-valid-");
    const result = await runPrometheusControlPreview({
      stateDir,
      action: "autarch.gap-detection",
    });
    expect(result.ok).toBe(true);
    expect(isPrometheusControlPreviewResult(result)).toBe(true);
  });

  it("rejects control preview success results with AUTARCH count drift", () => {
    const malformedResult = {
      ok: true,
      payload: {
        ts: Date.now(),
        action: "autarch.gap-detection",
        mutatesState: false,
        preview: {
          suggestedGapCount: 2,
          suggestions: [
            {
              suggestionId: "gap-1",
              goalId: "goal-1",
              severity: "high",
              description: "Gap",
            },
          ],
        },
      },
    };
    expect(isPrometheusControlPreviewResult(malformedResult)).toBe(false);
  });

  it("rejects control preview success results with HELIOS divergence severity drift", () => {
    const malformedResult = {
      ok: true,
      payload: {
        ts: Date.now(),
        action: "helios.trajectory-evaluation",
        mutatesState: false,
        preview: {
          goalId: "goal-1",
          goalStatus: "active",
          computedSnapshot: {
            at: Date.now(),
            completionRatio: 0.4,
            blockedRatio: 0.2,
            score: 0.5,
          },
          priorWindowSize: 1,
          divergence: {
            severity: "critical",
            reason: "invalid severity",
            scoreDrop: 0.2,
            latestScore: 0.5,
          },
        },
      },
    };
    expect(isPrometheusControlPreviewResult(malformedResult)).toBe(false);
  });

  it("rejects control preview failure results with invalid protocol error codes", () => {
    const malformedResult = {
      ok: false,
      error: {
        code: "BOOM",
        message: "invalid code",
      },
    };
    expect(isPrometheusControlPreviewResult(malformedResult)).toBe(false);
  });
});
