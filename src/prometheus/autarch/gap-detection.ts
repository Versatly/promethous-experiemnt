import type { CapabilityGapDetectedEvent } from "../events.js";
import type { PrometheusState } from "../state.js";
import type { CapabilityGapSeverity } from "../types.js";
import type { GoalCapabilityCoverage } from "./registry.js";
import { buildCapabilityGraph } from "./registry.js";

export type CapabilityGapSuggestion = {
  suggestionId: string;
  goalId: string;
  severity: CapabilityGapSeverity;
  description: string;
  rationale: string;
};

function resolveSeverity(params: {
  goalStatus: PrometheusState["goals"][string]["status"];
  integratedCount: number;
  provisionalCount: number;
}): CapabilityGapSeverity {
  if (
    params.goalStatus === "blocked" &&
    params.integratedCount === 0 &&
    params.provisionalCount === 0
  ) {
    return "critical";
  }
  if (params.goalStatus === "blocked" && params.integratedCount === 0) {
    return "high";
  }
  if (params.integratedCount === 0) {
    return "medium";
  }
  return "low";
}

function orderedFailureGoalIds(params: {
  state: PrometheusState;
  failedGoalIds?: readonly string[];
}): string[] {
  const candidates =
    params.failedGoalIds && params.failedGoalIds.length > 0
      ? params.failedGoalIds
      : Object.values(params.state.goals)
          .filter((goal) => goal.status === "blocked")
          .map((goal) => goal.id);
  return [...new Set(candidates)]
    .map((goalId) => params.state.goals[goalId])
    .filter((goal): goal is NonNullable<typeof goal> => Boolean(goal))
    .toSorted((left, right) => right.priority - left.priority)
    .map((goal) => goal.id);
}

export function detectCapabilityGapsFromFailedPaths(params: {
  state: PrometheusState;
  failedGoalIds?: readonly string[];
  coverageByGoal?: Record<string, GoalCapabilityCoverage>;
  now: number;
  maxSuggestions?: number;
}): CapabilityGapSuggestion[] {
  const maxSuggestions =
    typeof params.maxSuggestions === "number" ? Math.max(1, Math.floor(params.maxSuggestions)) : 10;
  const coverageByGoal =
    params.coverageByGoal ?? buildCapabilityGraph({ state: params.state }).coverageByGoal;
  const unresolvedGapGoalIds = new Set(
    Object.values(params.state.capabilityGaps)
      .filter((gap) => !gap.resolvedAt)
      .map((gap) => gap.goalId),
  );

  const suggestions: CapabilityGapSuggestion[] = [];
  const goalIds = orderedFailureGoalIds({
    state: params.state,
    failedGoalIds: params.failedGoalIds,
  });
  for (const goalId of goalIds) {
    if (suggestions.length >= maxSuggestions) {
      break;
    }
    if (unresolvedGapGoalIds.has(goalId)) {
      continue;
    }
    const goal = params.state.goals[goalId];
    if (!goal) {
      continue;
    }
    const coverage = coverageByGoal[goalId];
    const integratedCount = coverage?.integratedCount ?? 0;
    const provisionalCount = coverage?.provisionalCount ?? 0;
    const severity = resolveSeverity({
      goalStatus: goal.status,
      integratedCount,
      provisionalCount,
    });
    if (severity === "low" && goal.status !== "blocked") {
      continue;
    }

    const suggestionIndex = suggestions.length + 1;
    const suggestionId = `gap-suggested:${goalId}:${params.now}:${suggestionIndex}`;
    const description = `Capability gap detected for objective "${goal.title}"`;
    const rationale = `Goal status=${goal.status}; integrated=${integratedCount}; provisional=${provisionalCount}.`;

    suggestions.push({
      suggestionId,
      goalId,
      severity,
      description,
      rationale,
    });
  }

  return suggestions;
}

export function buildCapabilityGapDetectedEvents(params: {
  suggestions: readonly CapabilityGapSuggestion[];
  occurredAt: number;
  actorAgentId?: string;
}): CapabilityGapDetectedEvent[] {
  return params.suggestions.map((suggestion, index) => ({
    id: `evt:gap-detected:${suggestion.suggestionId}`,
    type: "capability-gap.detected",
    occurredAt: params.occurredAt + index,
    actorAgentId: params.actorAgentId,
    payload: {
      gapId: suggestion.suggestionId,
      goalId: suggestion.goalId,
      description: `${suggestion.description}. ${suggestion.rationale}`,
      severity: suggestion.severity,
    },
  }));
}
