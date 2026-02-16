import type { PrometheusState } from "../state.js";
import type {
  DriftEscalationDecision,
  DriftEscalationPolicy,
  DriftEscalationState,
} from "./escalation.js";
import type { HeliosTrajectoryStore } from "./trajectory-store.js";
import type { DivergenceSignal, GoalTrajectorySnapshot } from "./trajectory.js";
import { nextDriftEscalation } from "./escalation.js";
import { computeGoalTrajectorySnapshot, detectTrajectoryDivergence } from "./trajectory.js";

export type HeliosEvaluationResult = {
  rootGoalId: string;
  snapshot: GoalTrajectorySnapshot;
  trajectoryWindow: GoalTrajectorySnapshot[];
  signal: DivergenceSignal | null;
  escalation: DriftEscalationDecision | null;
};

export type HeliosTrajectoryEvaluator = {
  evaluateGoal: (params: {
    state: PrometheusState;
    rootGoalId: string;
    at?: number;
  }) => Promise<HeliosEvaluationResult>;
  evaluateGoals: (params: {
    state: PrometheusState;
    rootGoalIds: readonly string[];
    at?: number;
  }) => Promise<HeliosEvaluationResult[]>;
};

export type HeliosTrajectoryEvaluatorOptions = {
  trajectoryStore: HeliosTrajectoryStore;
  trajectoryWindowSize?: number;
  divergenceDropThreshold?: number;
  divergenceFloorThreshold?: number;
  escalationPolicy?: Partial<DriftEscalationPolicy>;
  now?: () => number;
};

function clampWindowSize(value?: number): number {
  if (typeof value !== "number") {
    return 30;
  }
  return Math.max(2, Math.floor(value));
}

export function createHeliosTrajectoryEvaluator(
  options: HeliosTrajectoryEvaluatorOptions,
): HeliosTrajectoryEvaluator {
  const trajectoryWindowSize = clampWindowSize(options.trajectoryWindowSize);
  const clock = options.now ?? (() => Date.now());
  const escalationStateByGoal = new Map<string, DriftEscalationState>();

  const evaluateGoal: HeliosTrajectoryEvaluator["evaluateGoal"] = async ({
    state,
    rootGoalId,
    at,
  }) => {
    const evaluatedAt = typeof at === "number" ? at : clock();
    const snapshot = computeGoalTrajectorySnapshot({
      state,
      rootGoalId,
      at: evaluatedAt,
    });
    await options.trajectoryStore.append({
      goalId: rootGoalId,
      snapshot,
    });

    const trajectoryWindow = await options.trajectoryStore.readWindow({
      goalId: rootGoalId,
      maxSnapshots: trajectoryWindowSize,
    });

    const signal = detectTrajectoryDivergence({
      snapshots: trajectoryWindow,
      dropThreshold: options.divergenceDropThreshold,
      floorThreshold: options.divergenceFloorThreshold,
    });
    const previousState = escalationStateByGoal.get(rootGoalId);
    const { state: nextState, decision } = nextDriftEscalation({
      signal,
      trajectoryWindow,
      previousState,
      now: evaluatedAt,
      policy: options.escalationPolicy,
    });
    escalationStateByGoal.set(rootGoalId, nextState);

    return {
      rootGoalId,
      snapshot,
      trajectoryWindow,
      signal,
      escalation: decision,
    };
  };

  const evaluateGoals: HeliosTrajectoryEvaluator["evaluateGoals"] = async ({
    state,
    rootGoalIds,
    at,
  }) => {
    const evaluatedAt = typeof at === "number" ? at : clock();
    const results: HeliosEvaluationResult[] = [];
    for (const rootGoalId of rootGoalIds) {
      results.push(
        await evaluateGoal({
          state,
          rootGoalId,
          at: evaluatedAt,
        }),
      );
    }
    return results;
  };

  return { evaluateGoal, evaluateGoals };
}
