import { afterEach, describe, expect, it, vi } from "vitest";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
import {
  runPrometheusReadRequest,
  runPrometheusWriteRequest,
} from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PROMETHEUS gateway authorization invocation scope", () => {
  it("keeps canonical non-mutating auth behavior when method metadata override diverges", async () => {
    const resolvePrometheusMethodMetadata = vi.fn(() => ({
      access: "write",
      mutatesState: true,
    }));
    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "read-metadata-diverges",
        method: "prometheus.status",
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusMethodMetadata,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.any(Object),
      }),
      undefined,
    );
    expect(resolvePrometheusMethodMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePrometheusMethodMetadata).toHaveBeenCalledWith("prometheus.status");
  });

  it("ignores planned-method auth overrides on non-planned request paths", async () => {
    const resolvePrometheusPlannedMethodMetadata = vi.fn(
      () =>
        ({
          access: "write",
          mutatesState: true,
          enabled: false,
          enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
          requiredParams: ["action"],
          reason: "should not affect non-planned method",
        }) as never,
    );
    const resolvePrometheusPlannedMethodPreflight = vi.fn(
      () =>
        ({
          disabledMessage: "should not be used",
          notImplementedMessage: "should not be used",
          requiredParamsMessage: "should not be used",
        }) as never,
    );
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "planned-override-on-non-planned-method",
        method: "prometheus.control.preview",
        params: {
          action: "autarch.gap-detection",
        },
      },
      respond,
      authOverrides: {
        resolvePrometheusPlannedMethodMetadata,
        resolvePrometheusPlannedMethodPreflight,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "autarch.gap-detection",
        mutatesState: false,
      }),
      undefined,
    );
    expect(resolvePrometheusPlannedMethodMetadata).not.toHaveBeenCalled();
    expect(resolvePrometheusPlannedMethodPreflight).not.toHaveBeenCalled();
  });
});
