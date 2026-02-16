import { describe, expect, it } from "vitest";
import { PROMETHEUS_GATEWAY_METHOD_METADATA } from "./prometheus-methods.js";
import { assertPrometheusHandlerContract, prometheusHandlers } from "./prometheus.js";

describe("prometheusHandlers contract", () => {
  it("keeps handler keys aligned with method metadata", () => {
    expect(() =>
      assertPrometheusHandlerContract({
        handlers: prometheusHandlers,
        methodMetadata: PROMETHEUS_GATEWAY_METHOD_METADATA,
      }),
    ).not.toThrow();
  });

  it("fails fast when handler keys diverge from method metadata", () => {
    expect(() =>
      assertPrometheusHandlerContract({
        handlers: {
          "prometheus.status": async (_opts) => undefined,
        },
        methodMetadata: {
          "prometheus.status": {
            access: "read",
            mutatesState: false,
          },
          "prometheus.control.preview": {
            access: "write",
            mutatesState: false,
          },
        },
      }),
    ).toThrow("handlers and metadata keys diverged");
  });
});
