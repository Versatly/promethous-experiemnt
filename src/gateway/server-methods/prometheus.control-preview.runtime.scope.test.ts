import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { runPrometheusControlPreview } from "./prometheus.control-preview.js";
import { createPrometheusTempDirHarness } from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
  vi.unstubAllEnvs();
});

describe("prometheus control preview runtime invocation scope", () => {
  it("does not invoke planned-action resolvers for unsupported actions", async () => {
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("metadata resolver should not be called");
    });
    const resolvePlannedActionPreflight = vi.fn(() => {
      throw new Error("preflight resolver should not be called");
    });
    const result = await runPrometheusControlPreview(
      {
        action: "unknown.action",
      },
      {
        resolvePlannedActionMetadata,
        resolvePlannedActionPreflight,
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "unknown.action"',
      },
    });
    expect(resolvePlannedActionMetadata).not.toHaveBeenCalled();
    expect(resolvePlannedActionPreflight).not.toHaveBeenCalled();
  });

  it("does not invoke planned-action resolvers for active non-planned actions", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const resolvePlannedActionMetadata = vi.fn(() => {
      throw new Error("metadata resolver should not be called");
    });
    const resolvePlannedActionPreflight = vi.fn(() => {
      throw new Error("preflight resolver should not be called");
    });
    const result = await runPrometheusControlPreview(
      {
        stateDir,
        action: "autarch.gap-detection",
      },
      {
        resolvePlannedActionMetadata,
        resolvePlannedActionPreflight,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("autarch.gap-detection");
    expect(resolvePlannedActionMetadata).not.toHaveBeenCalled();
    expect(resolvePlannedActionPreflight).not.toHaveBeenCalled();
  });
});
