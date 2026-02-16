import { describe, expect, it } from "vitest";
import {
  PROMETHEUS_GATEWAY_METHODS,
  PROMETHEUS_GATEWAY_READ_METHODS,
  PROMETHEUS_GATEWAY_WRITE_METHODS,
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

  it("keeps current migration phase methods read-only", () => {
    expect(PROMETHEUS_GATEWAY_WRITE_METHODS).toEqual([]);
    expect(PROMETHEUS_GATEWAY_READ_METHODS.length).toBeGreaterThan(0);
  });
});
