import type { PrometheusState } from "../state.js";
import type { GoalStatus } from "../types.js";

const STATUS_WEIGHTS: Record<GoalStatus, number> = {
  active: 0.6,
  completed: 1.0,
  blocked: 0.15,
  archived: 0.4,
};

export type GoalTrajectorySnapshot = {
  at: number;
  completionRatio: number;
  blockedRatio: number;
  score: number;
};

export type DivergenceSignal = {
  severity: "low" | "medium" | "high";
  reason: string;
  scoreDrop: number;
  latestScore: number;
};

function collectGoalTree(state: PrometheusState, rootGoalId: string): string[] {
  const queue = [rootGoalId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (visited.has(next)) {
      continue;
    }
    visited.add(next);
    const goal = state.goals[next];
    if (!goal) {
      continue;
    }
    queue.push(...goal.childGoalIds);
  }
  return [...visited];
}

export function computeGoalTrajectorySnapshot(params: {
  state: PrometheusState;
  rootGoalId: string;
  at: number;
}): GoalTrajectorySnapshot {
  const goalIds = collectGoalTree(params.state, params.rootGoalId);
  if (goalIds.length === 0) {
    return {
      at: params.at,
      completionRatio: 0,
      blockedRatio: 0,
      score: 0,
    };
  }

  let completedCount = 0;
  let blockedCount = 0;
  let weightedScore = 0;
  for (const goalId of goalIds) {
    const goal = params.state.goals[goalId];
    if (!goal) {
      continue;
    }
    if (goal.status === "completed") {
      completedCount += 1;
    }
    if (goal.status === "blocked") {
      blockedCount += 1;
    }
    weightedScore += STATUS_WEIGHTS[goal.status];
  }

  const denominator = goalIds.length;
  const completionRatio = completedCount / denominator;
  const blockedRatio = blockedCount / denominator;
  const rawScore = weightedScore / denominator;
  // Penalize blocked branches to prioritize trajectory recovery.
  const score = Math.max(0, Math.min(1, rawScore - blockedRatio * 0.35));

  return {
    at: params.at,
    completionRatio,
    blockedRatio,
    score,
  };
}

export function detectTrajectoryDivergence(params: {
  snapshots: readonly GoalTrajectorySnapshot[];
  dropThreshold?: number;
  floorThreshold?: number;
}): DivergenceSignal | null {
  if (params.snapshots.length < 2) {
    return null;
  }
  const dropThreshold = params.dropThreshold ?? 0.2;
  const floorThreshold = params.floorThreshold ?? 0.35;
  const latest = params.snapshots[params.snapshots.length - 1];
  const previous = params.snapshots[params.snapshots.length - 2];
  if (!latest || !previous) {
    return null;
  }
  const scoreDrop = previous.score - latest.score;

  if (latest.score < floorThreshold) {
    return {
      severity: latest.score < floorThreshold * 0.7 ? "high" : "medium",
      reason: "trajectory score fell below minimum floor",
      scoreDrop,
      latestScore: latest.score,
    };
  }

  if (scoreDrop > dropThreshold) {
    return {
      severity: scoreDrop > dropThreshold * 1.75 ? "high" : "medium",
      reason: "trajectory score dropped too quickly between snapshots",
      scoreDrop,
      latestScore: latest.score,
    };
  }

  return null;
}
