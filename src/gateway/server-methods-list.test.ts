import { describe, expect, it } from "vitest";
import { listGatewayMethods } from "./server-methods-list.js";

describe("listGatewayMethods", () => {
  it("includes PROMETHEUS compatibility methods", () => {
    const methods = listGatewayMethods();
    expect(methods).toContain("prometheus.status");
    expect(methods).toContain("prometheus.goals");
    expect(methods).toContain("prometheus.recursion");
    expect(methods).toContain("prometheus.monolith");
  });

  it("does not emit duplicate method entries", () => {
    const methods = listGatewayMethods();
    const unique = new Set(methods);
    expect(unique.size).toBe(methods.length);
  });
});
