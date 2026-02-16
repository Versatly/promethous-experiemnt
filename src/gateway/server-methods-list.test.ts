import { describe, expect, it } from "vitest";
import { listGatewayMethods } from "./server-methods-list.js";
import { PROMETHEUS_GATEWAY_METHODS } from "./server-methods/prometheus-methods.js";

describe("listGatewayMethods", () => {
  it("includes PROMETHEUS compatibility methods", () => {
    const methods = listGatewayMethods();
    const listedPrometheusMethods = methods
      .filter((method) => method.startsWith("prometheus."))
      .toSorted();
    expect(listedPrometheusMethods).toEqual([...PROMETHEUS_GATEWAY_METHODS].toSorted());
  });

  it("does not emit duplicate method entries", () => {
    const methods = listGatewayMethods();
    const unique = new Set(methods);
    expect(unique.size).toBe(methods.length);
  });
});
