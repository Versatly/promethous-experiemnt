import type { PrometheusState } from "../state.js";

export type AlignmentViolationCode =
  | "goal-drift"
  | "runaway-optimization"
  | "institution-policy-breach"
  | "capability-hijack-risk";

export type AlignmentViolation = {
  code: AlignmentViolationCode;
  severity: "low" | "medium" | "high";
  message: string;
  data?: Record<string, unknown>;
};

export type AlignmentGuardrailSnapshot = {
  goalDriftRatio: number;
  criticalBlockedRatio: number;
  recursionAcceptanceRatio: number;
  unresolvedCriticalGapCount: number;
};

export type AlignmentGuardrailResult = {
  snapshot: AlignmentGuardrailSnapshot;
  violations: AlignmentViolation[];
};

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

export function evaluateAlignmentGuardrails(params: {
  state: PrometheusState;
  recursionWindowSize?: number;
  driftThreshold?: number;
  runawayAcceptanceThreshold?: number;
  blockedCriticalThreshold?: number;
}): AlignmentGuardrailResult {
  const driftThreshold = params.driftThreshold ?? 0.35;
  const runawayAcceptanceThreshold = params.runawayAcceptanceThreshold ?? 0.8;
  const blockedCriticalThreshold = params.blockedCriticalThreshold ?? 0.4;
  const recursionWindowSize =
    typeof params.recursionWindowSize === "number"
      ? Math.max(1, Math.floor(params.recursionWindowSize))
      : 8;

  const goals = Object.values(params.state.goals);
  const driftedGoals = goals.filter(
    (goal) => goal.status === "archived" || goal.status === "blocked",
  );
  const criticalGoals = goals.filter((goal) => goal.priority >= 80);
  const blockedCriticalGoals = criticalGoals.filter((goal) => goal.status === "blocked");

  const recentCycles = params.state.recursionCycles.slice(-recursionWindowSize);
  const acceptedCycles = recentCycles.filter((cycle) => cycle.accepted === true);
  const unresolvedCriticalGaps = Object.values(params.state.capabilityGaps).filter(
    (gap) => gap.severity === "critical" && !gap.resolvedAt,
  );
  const supportedCriticalGapIds = new Set(
    Object.values(params.state.synthesizedCapabilities)
      .filter(
        (capability) => capability.status === "validated" || capability.status === "integrated",
      )
      .map((capability) => capability.gapId),
  );
  const unsupportedCriticalGapCount = unresolvedCriticalGaps.filter(
    (gap) => !supportedCriticalGapIds.has(gap.id),
  ).length;

  const dissolvedInstitutionsWithCapital = Object.values(params.state.capitalLedger).filter(
    (entry) => {
      const institution = params.state.institutions[entry.institutionId];
      return institution?.status === "dissolved" && entry.amount > 0;
    },
  );

  const snapshot: AlignmentGuardrailSnapshot = {
    goalDriftRatio: ratio(driftedGoals.length, goals.length),
    criticalBlockedRatio: ratio(blockedCriticalGoals.length, criticalGoals.length),
    recursionAcceptanceRatio: ratio(acceptedCycles.length, recentCycles.length),
    unresolvedCriticalGapCount: unresolvedCriticalGaps.length,
  };

  const violations: AlignmentViolation[] = [];
  if (snapshot.goalDriftRatio >= driftThreshold) {
    violations.push({
      code: "goal-drift",
      severity: snapshot.goalDriftRatio >= driftThreshold * 1.4 ? "high" : "medium",
      message: "Goal drift ratio exceeded policy threshold.",
      data: {
        driftedGoals: driftedGoals.length,
        totalGoals: goals.length,
        goalDriftRatio: snapshot.goalDriftRatio,
      },
    });
  }

  if (
    snapshot.recursionAcceptanceRatio >= runawayAcceptanceThreshold &&
    snapshot.criticalBlockedRatio >= blockedCriticalThreshold
  ) {
    violations.push({
      code: "runaway-optimization",
      severity: "high",
      message: "Recursion acceptance is high while critical goals remain blocked.",
      data: {
        recursionAcceptanceRatio: snapshot.recursionAcceptanceRatio,
        criticalBlockedRatio: snapshot.criticalBlockedRatio,
      },
    });
  }

  if (dissolvedInstitutionsWithCapital.length > 0) {
    violations.push({
      code: "institution-policy-breach",
      severity: "high",
      message: "Dissolved institutions still hold active capital allocations.",
      data: {
        breachedInstitutionIds: dissolvedInstitutionsWithCapital.map(
          (entry) => entry.institutionId,
        ),
      },
    });
  }

  if (unsupportedCriticalGapCount >= 2) {
    violations.push({
      code: "capability-hijack-risk",
      severity: unsupportedCriticalGapCount >= 4 ? "high" : "medium",
      message: "Critical capability gaps are unresolved without validated mitigation.",
      data: {
        unresolvedCriticalGapCount: unresolvedCriticalGaps.length,
        unsupportedCriticalGapCount,
      },
    });
  }

  return {
    snapshot,
    violations,
  };
}

export function assertAlignmentGuardrails(result: AlignmentGuardrailResult): void {
  const highViolations = result.violations.filter((violation) => violation.severity === "high");
  if (highViolations.length === 0) {
    return;
  }
  const details = highViolations.map((violation) => `${violation.code}: ${violation.message}`);
  throw new Error(`Alignment guardrail violation:\n- ${details.join("\n- ")}`);
}
