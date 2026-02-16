import type { DivergenceSignal, GoalTrajectorySnapshot } from "./trajectory.js";

export type DriftEscalationLevel = "observe" | "warning" | "intervention" | "critical";

export type DriftEscalationPolicy = {
  consecutiveSignalsForIntervention: number;
  criticalCooldownMs: number;
  blockedRatioInterventionFloor: number;
};

export type DriftEscalationState = {
  consecutiveSignals: number;
  lastEscalatedAt?: number;
};

export type DriftEscalationDecision = {
  level: DriftEscalationLevel;
  reason: string;
  recommendedAction: string;
  signal: DivergenceSignal;
  consecutiveSignals: number;
};

export type DriftEscalationResult = {
  state: DriftEscalationState;
  decision: DriftEscalationDecision | null;
};

const DEFAULT_POLICY: DriftEscalationPolicy = {
  consecutiveSignalsForIntervention: 3,
  criticalCooldownMs: 5 * 60 * 1000,
  blockedRatioInterventionFloor: 0.5,
};

function clampPolicy(overrides?: Partial<DriftEscalationPolicy>): DriftEscalationPolicy {
  return {
    consecutiveSignalsForIntervention: Math.max(
      2,
      Math.floor(
        overrides?.consecutiveSignalsForIntervention ??
          DEFAULT_POLICY.consecutiveSignalsForIntervention,
      ),
    ),
    criticalCooldownMs: Math.max(
      0,
      Math.floor(overrides?.criticalCooldownMs ?? DEFAULT_POLICY.criticalCooldownMs),
    ),
    blockedRatioInterventionFloor: Math.max(
      0,
      Math.min(
        1,
        overrides?.blockedRatioInterventionFloor ?? DEFAULT_POLICY.blockedRatioInterventionFloor,
      ),
    ),
  };
}

function resolveEscalationLevel(params: {
  signal: DivergenceSignal;
  consecutiveSignals: number;
  latestSnapshot?: GoalTrajectorySnapshot;
  policy: DriftEscalationPolicy;
}): DriftEscalationLevel {
  if (params.signal.severity === "high") {
    return "critical";
  }
  if (params.consecutiveSignals >= params.policy.consecutiveSignalsForIntervention) {
    return "intervention";
  }
  if ((params.latestSnapshot?.blockedRatio ?? 0) >= params.policy.blockedRatioInterventionFloor) {
    return "intervention";
  }
  if (params.signal.severity === "medium") {
    return "warning";
  }
  return "observe";
}

function buildRecommendedAction(level: DriftEscalationLevel): string {
  switch (level) {
    case "critical":
      return "pause recursive expansion and request human intervention";
    case "intervention":
      return "trigger trajectory recovery plan and reallocate execution resources";
    case "warning":
      return "tighten evaluation cadence and review blocked objectives";
    case "observe":
      return "continue monitoring objective trajectory";
    default: {
      const exhaustive: never = level;
      return exhaustive;
    }
  }
}

export function nextDriftEscalation(params: {
  signal: DivergenceSignal | null;
  trajectoryWindow: readonly GoalTrajectorySnapshot[];
  previousState?: DriftEscalationState;
  now: number;
  policy?: Partial<DriftEscalationPolicy>;
}): DriftEscalationResult {
  const policy = clampPolicy(params.policy);
  const previousState = params.previousState ?? { consecutiveSignals: 0 };

  if (!params.signal) {
    return {
      state: {
        ...previousState,
        consecutiveSignals: 0,
      },
      decision: null,
    };
  }

  const consecutiveSignals = previousState.consecutiveSignals + 1;
  const latestSnapshot = params.trajectoryWindow[params.trajectoryWindow.length - 1];
  let level = resolveEscalationLevel({
    signal: params.signal,
    consecutiveSignals,
    latestSnapshot,
    policy,
  });

  const inCriticalCooldown =
    level === "critical" &&
    previousState.lastEscalatedAt !== undefined &&
    params.now - previousState.lastEscalatedAt < policy.criticalCooldownMs;
  if (inCriticalCooldown) {
    level = "intervention";
  }

  const decision: DriftEscalationDecision = {
    level,
    reason: params.signal.reason,
    recommendedAction: buildRecommendedAction(level),
    signal: params.signal,
    consecutiveSignals,
  };

  const state: DriftEscalationState = {
    consecutiveSignals,
    lastEscalatedAt: params.now,
  };

  return { state, decision };
}
