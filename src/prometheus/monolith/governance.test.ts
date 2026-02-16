import { describe, expect, it } from "vitest";
import type { PrometheusState } from "../state.js";
import { evaluateInstitutionAction } from "./governance.js";

function buildState(overrides: Partial<PrometheusState>): PrometheusState {
  return {
    version: 1,
    goals: {},
    agents: {},
    capabilityGaps: {},
    synthesizedCapabilities: {},
    institutions: {},
    capitalLedger: {},
    recursionCycles: [],
    ...overrides,
  };
}

describe("evaluateInstitutionAction", () => {
  it("allows bounded capital allocations and requests approvals for large allocations", () => {
    const state = buildState({
      institutions: {
        "inst-1": {
          id: "inst-1",
          name: "Prometheus Lab",
          mandate: "scale recursive intelligence",
          authorityModel: "council",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
      },
      capitalLedger: {
        "cap-1": {
          id: "cap-1",
          institutionId: "inst-1",
          form: "compute",
          amount: 100,
          unit: "gpu-hours",
          updatedAt: 1,
        },
      },
    });

    const decision = evaluateInstitutionAction({
      state,
      request: {
        institutionId: "inst-1",
        type: "capital.allocate",
        form: "compute",
        amount: 85,
      },
      policy: {
        maxSingleAllocationByForm: { compute: 90 },
      },
    });
    expect(decision.allowed).toBe(true);
    expect(decision.requiredApprovals).toContain("treasury-council");
  });

  it("rejects dissolution when institution is not dormant", () => {
    const state = buildState({
      institutions: {
        "inst-1": {
          id: "inst-1",
          name: "Prometheus Lab",
          mandate: "scale recursive intelligence",
          authorityModel: "council",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
      },
    });

    const decision = evaluateInstitutionAction({
      state,
      request: {
        institutionId: "inst-1",
        type: "institution.dissolve",
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(" ")).toContain("dormant");
    expect(decision.requiredApprovals).toContain("legal-review");
  });
});
