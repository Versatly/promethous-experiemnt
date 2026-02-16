import { describe, expect, it } from "vitest";
import type { PrometheusState } from "../state.js";
import { assertAlignmentGuardrails, evaluateAlignmentGuardrails } from "./guardrails.js";

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

describe("evaluateAlignmentGuardrails", () => {
  it("detects runaway optimization and institution policy breaches", () => {
    const state = buildState({
      goals: {
        g1: {
          id: "g1",
          title: "G1",
          objective: "o1",
          status: "blocked",
          priority: 90,
          createdAt: 1,
          updatedAt: 1,
          childGoalIds: [],
        },
        g2: {
          id: "g2",
          title: "G2",
          objective: "o2",
          status: "blocked",
          priority: 85,
          createdAt: 1,
          updatedAt: 1,
          childGoalIds: [],
        },
        g3: {
          id: "g3",
          title: "G3",
          objective: "o3",
          status: "completed",
          priority: 60,
          createdAt: 1,
          updatedAt: 1,
          childGoalIds: [],
        },
      },
      institutions: {
        "inst-1": {
          id: "inst-1",
          name: "I1",
          mandate: "m",
          authorityModel: "council",
          status: "dissolved",
          createdAt: 1,
          updatedAt: 1,
        },
      },
      capitalLedger: {
        "cap-1": {
          id: "cap-1",
          institutionId: "inst-1",
          form: "money",
          amount: 100,
          unit: "USD",
          updatedAt: 1,
        },
      },
      capabilityGaps: {
        "gap-a": {
          id: "gap-a",
          goalId: "g1",
          description: "critical gap a",
          severity: "critical",
          createdAt: 1,
        },
        "gap-b": {
          id: "gap-b",
          goalId: "g2",
          description: "critical gap b",
          severity: "critical",
          createdAt: 1,
        },
      },
      recursionCycles: [
        { cycleId: "c1", summary: "s1", accepted: true, occurredAt: 1 },
        { cycleId: "c2", summary: "s2", accepted: true, occurredAt: 2 },
        { cycleId: "c3", summary: "s3", accepted: true, occurredAt: 3 },
        { cycleId: "c4", summary: "s4", accepted: true, occurredAt: 4 },
      ],
    });

    const result = evaluateAlignmentGuardrails({
      state,
      recursionWindowSize: 4,
    });

    const codes = result.violations.map((violation) => violation.code);
    expect(codes).toContain("runaway-optimization");
    expect(codes).toContain("institution-policy-breach");
    expect(codes).toContain("capability-hijack-risk");
    expect(() => assertAlignmentGuardrails(result)).toThrow("Alignment guardrail");
  });

  it("returns no violations for stable aligned state", () => {
    const state = buildState({
      goals: {
        g1: {
          id: "g1",
          title: "G1",
          objective: "o1",
          status: "completed",
          priority: 90,
          createdAt: 1,
          updatedAt: 1,
          childGoalIds: [],
        },
      },
      institutions: {
        "inst-1": {
          id: "inst-1",
          name: "I1",
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
          form: "money",
          amount: 100,
          unit: "USD",
          updatedAt: 1,
        },
      },
      recursionCycles: [{ cycleId: "c1", summary: "stable", accepted: false, occurredAt: 1 }],
    });

    const result = evaluateAlignmentGuardrails({ state });
    expect(result.violations).toEqual([]);
    expect(() => assertAlignmentGuardrails(result)).not.toThrow();
  });
});
