import { describe, expect, it } from "vitest";
import {
  PROMETHEUS_GATEWAY_METHODS,
  PROMETHEUS_GATEWAY_METHOD_METADATA,
  PROMETHEUS_GATEWAY_READ_METHODS,
  PROMETHEUS_GATEWAY_WRITE_METHODS,
  type PrometheusGatewayMethod,
} from "./prometheus-methods.js";

describe("PROMETHEUS method access map", () => {
  it("contains unique method names", () => {
    expect(new Set(PROMETHEUS_GATEWAY_METHODS).size).toBe(PROMETHEUS_GATEWAY_METHODS.length);
  });

  it("partitions read and write method sets without overlap", () => {
    const overlap = PROMETHEUS_GATEWAY_READ_METHODS.filter((method) =>
      PROMETHEUS_GATEWAY_WRITE_METHODS.includes(method as never),
    );
    expect(overlap).toEqual([]);
    expect(PROMETHEUS_GATEWAY_METHODS).toEqual([
      ...PROMETHEUS_GATEWAY_READ_METHODS,
      ...PROMETHEUS_GATEWAY_WRITE_METHODS,
    ]);
  });

  it("declares explicit control-surface write methods", () => {
    expect(PROMETHEUS_GATEWAY_WRITE_METHODS).toEqual(["prometheus.control.preview"]);
    expect(PROMETHEUS_GATEWAY_READ_METHODS.length).toBeGreaterThan(0);
  });

  it("keeps method metadata aligned with read/write partitions", () => {
    const metadataMethods = Object.keys(
      PROMETHEUS_GATEWAY_METHOD_METADATA,
    ).toSorted() as PrometheusGatewayMethod[];
    expect(metadataMethods).toEqual([...PROMETHEUS_GATEWAY_METHODS].toSorted());

    const readMethods = metadataMethods.filter(
      (method) => PROMETHEUS_GATEWAY_METHOD_METADATA[method].access === "read",
    );
    const writeMethods = metadataMethods.filter(
      (method) => PROMETHEUS_GATEWAY_METHOD_METADATA[method].access === "write",
    );
    expect(readMethods.toSorted()).toEqual([...PROMETHEUS_GATEWAY_READ_METHODS].toSorted());
    expect(writeMethods.toSorted()).toEqual([...PROMETHEUS_GATEWAY_WRITE_METHODS].toSorted());
  });

  it("keeps current control surfaces non-mutating", () => {
    for (const method of PROMETHEUS_GATEWAY_METHODS) {
      expect(PROMETHEUS_GATEWAY_METHOD_METADATA[method].mutatesState).toBe(false);
    }
  });
});
