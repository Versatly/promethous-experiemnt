import { describe, expect, it } from "vitest";
import {
  arePrometheusMutatingControlsEnabled,
  assertPrometheusGatewayMethodMetadataContract,
  assertPrometheusPlannedMutatingMethodContract,
  getPrometheusGatewayMethodMetadata,
  getPrometheusPlannedMutatingMethodMetadata,
  listPrometheusPlannedMutatingMethods,
  listPrometheusMutatingMethods,
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
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

  it("fails fast when method metadata diverges from method lists", () => {
    expect(() =>
      assertPrometheusGatewayMethodMetadataContract({
        readMethods: ["prometheus.status"],
        writeMethods: [],
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
    ).toThrow("methods and metadata keys diverged");
  });

  it("reports mutating methods from metadata and keeps current list empty", () => {
    expect(listPrometheusMutatingMethods()).toEqual([]);
    expect(listPrometheusPlannedMutatingMethods()).toEqual([
      "prometheus.control.autarch.commit",
      "prometheus.control.execute",
      "prometheus.control.recursion.commit",
    ]);
    expect(
      listPrometheusMutatingMethods({
        "prometheus.status": {
          access: "read",
          mutatesState: false,
        },
        "prometheus.control.execute": {
          access: "write",
          mutatesState: true,
        },
      }),
    ).toEqual(["prometheus.control.execute"]);
  });

  it("keeps planned mutating methods disjoint from active methods", () => {
    expect(
      Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).some((method) =>
        PROMETHEUS_GATEWAY_METHODS.includes(method as never),
      ),
    ).toBe(false);
    expect(() =>
      assertPrometheusPlannedMutatingMethodContract({
        activeMethods: ["prometheus.control.execute"],
        plannedMutatingMethodMetadata: {
          "prometheus.control.execute": {
            access: "write",
            mutatesState: true,
            enabled: false,
            enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
            requiredParams: ["action"],
            reason: "invalid overlap",
          },
        },
      }),
    ).toThrow("overlaps active methods");
  });

  it("fails fast when planned mutating required params are malformed", () => {
    expect(() =>
      assertPrometheusPlannedMutatingMethodContract({
        activeMethods: [],
        plannedMutatingMethodMetadata: {
          "prometheus.control.execute": {
            access: "write",
            mutatesState: true,
            enabled: false,
            enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
            requiredParams: ["action", "action"],
            reason: "invalid duplicated params",
          },
        },
      }),
    ).toThrow("invalid required params");
  });

  it("only enables mutating controls when env var is set to 1", () => {
    expect(arePrometheusMutatingControlsEnabled({})).toBe(false);
    expect(arePrometheusMutatingControlsEnabled({ [PROMETHEUS_MUTATING_CONTROLS_ENV]: "0" })).toBe(
      false,
    );
    expect(arePrometheusMutatingControlsEnabled({ [PROMETHEUS_MUTATING_CONTROLS_ENV]: "1" })).toBe(
      true,
    );
  });

  it("resolves method metadata only for known PROMETHEUS methods", () => {
    expect(getPrometheusGatewayMethodMetadata("prometheus.control.preview")).toEqual({
      access: "write",
      mutatesState: false,
    });
    expect(getPrometheusGatewayMethodMetadata("prometheus.unknown")).toBeUndefined();
  });

  it("resolves planned mutating metadata only for known planned methods", () => {
    expect(getPrometheusPlannedMutatingMethodMetadata("prometheus.control.execute")).toEqual(
      expect.objectContaining({
        access: "write",
        mutatesState: true,
        enabled: false,
        requiredParams: ["action"],
      }),
    );
    expect(getPrometheusPlannedMutatingMethodMetadata("prometheus.status")).toBeUndefined();
  });

  it("exports stable planned mutating method set for rollout scaffolding", () => {
    expect(Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA).toSorted()).toEqual([
      "prometheus.control.autarch.commit",
      "prometheus.control.execute",
      "prometheus.control.recursion.commit",
    ]);
  });
});
