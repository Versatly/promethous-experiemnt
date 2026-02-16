import { describe, expect, it } from "vitest";
import { listGatewayMethods } from "./server-methods-list.js";
import {
  PROMETHEUS_GATEWAY_METHODS,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
} from "./server-methods/prometheus-methods.js";

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

  it("does not expose planned mutating methods before rollout", () => {
    const methods = listGatewayMethods();
    for (const plannedMethod of Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA)) {
      expect(methods).not.toContain(plannedMethod);
    }
  });
});
