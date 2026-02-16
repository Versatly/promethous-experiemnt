import type { PrometheusEvent } from "../events.js";

const CLAUSE_DELIMITERS = /[.;]\s+|\s+and\s+/gi;

function normalizeClause(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function toTitle(clause: string, fallback: string): string {
  const normalized = clause.replace(/^[^a-zA-Z0-9]+/, "").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 80 ? `${normalized.slice(0, 77).trimEnd()}...` : normalized;
}

export type GoalDecompositionPlan = {
  rootGoalId: string;
  subGoals: Array<{
    goalId: string;
    title: string;
    objective: string;
    priority: number;
  }>;
};

export function decomposeGoalObjective(params: {
  rootGoalId: string;
  objective: string;
  maxSubGoals?: number;
  baselinePriority?: number;
}): GoalDecompositionPlan {
  const maxSubGoals = Math.max(1, params.maxSubGoals ?? 6);
  const baselinePriority = Math.max(0, Math.min(100, params.baselinePriority ?? 70));
  const clauses = params.objective
    .split(CLAUSE_DELIMITERS)
    .map(normalizeClause)
    .filter(Boolean)
    .slice(0, maxSubGoals);

  const normalizedClauses = clauses.length > 0 ? clauses : [normalizeClause(params.objective)];
  const subGoals = normalizedClauses.map((clause, index) => {
    const goalId = `${params.rootGoalId}:sg:${index + 1}`;
    const priorityStep = Math.min(index * 5, 25);
    return {
      goalId,
      title: toTitle(clause, `Sub-goal ${index + 1}`),
      objective: clause,
      priority: Math.max(10, baselinePriority - priorityStep),
    };
  });

  return {
    rootGoalId: params.rootGoalId,
    subGoals,
  };
}

export function buildGoalDecompositionEvents(params: {
  actorAgentId?: string;
  occurredAt: number;
  rootGoalId: string;
  decomposition: GoalDecompositionPlan;
}): PrometheusEvent[] {
  return params.decomposition.subGoals.map((subGoal, index) => ({
    id: `${params.rootGoalId}-decompose-${index + 1}-${params.occurredAt}`,
    type: "goal.created",
    occurredAt: params.occurredAt + index,
    actorAgentId: params.actorAgentId,
    payload: {
      goalId: subGoal.goalId,
      title: subGoal.title,
      objective: subGoal.objective,
      parentGoalId: params.rootGoalId,
      priority: subGoal.priority,
    },
  }));
}
