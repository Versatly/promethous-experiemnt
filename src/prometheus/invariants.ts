import type { PrometheusState } from "./state.js";

function detectGoalCycles(state: PrometheusState): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const issues: string[] = [];

  const dfs = (goalId: string) => {
    if (visiting.has(goalId)) {
      issues.push(`Goal cycle detected at "${goalId}".`);
      return;
    }
    if (visited.has(goalId)) {
      return;
    }
    visiting.add(goalId);
    const goal = state.goals[goalId];
    if (goal) {
      for (const child of goal.childGoalIds) {
        dfs(child);
      }
    }
    visiting.delete(goalId);
    visited.add(goalId);
  };

  for (const goalId of Object.keys(state.goals)) {
    dfs(goalId);
  }

  return issues;
}

export function validatePrometheusState(state: PrometheusState): string[] {
  const issues: string[] = [];

  for (const [goalId, goal] of Object.entries(state.goals)) {
    if (goal.parentGoalId && !state.goals[goal.parentGoalId]) {
      issues.push(`Goal "${goalId}" has missing parent "${goal.parentGoalId}".`);
    }
    for (const childGoalId of goal.childGoalIds) {
      const child = state.goals[childGoalId];
      if (!child) {
        issues.push(`Goal "${goalId}" references missing child "${childGoalId}".`);
        continue;
      }
      if (child.parentGoalId !== goalId) {
        issues.push(
          `Goal "${goalId}" child "${childGoalId}" points to parent "${child.parentGoalId ?? "none"}".`,
        );
      }
    }
    if (goal.priority < 0 || goal.priority > 100) {
      issues.push(`Goal "${goalId}" has invalid priority "${goal.priority}".`);
    }
  }

  for (const [gapId, gap] of Object.entries(state.capabilityGaps)) {
    if (!state.goals[gap.goalId]) {
      issues.push(`Capability gap "${gapId}" references missing goal "${gap.goalId}".`);
    }
    if (gap.resolvedAt && gap.resolvedAt < gap.createdAt) {
      issues.push(`Capability gap "${gapId}" has resolvedAt earlier than createdAt.`);
    }
  }

  for (const [capabilityId, capability] of Object.entries(state.synthesizedCapabilities)) {
    if (!state.capabilityGaps[capability.gapId]) {
      issues.push(
        `Synthesized capability "${capabilityId}" references missing gap "${capability.gapId}".`,
      );
    }
    if (capability.updatedAt < capability.createdAt) {
      issues.push(`Synthesized capability "${capabilityId}" has updatedAt earlier than createdAt.`);
    }
  }

  for (const [capitalId, capital] of Object.entries(state.capitalLedger)) {
    if (!state.institutions[capital.institutionId]) {
      issues.push(
        `Capital allocation "${capitalId}" references missing institution "${capital.institutionId}".`,
      );
    }
    if (!Number.isFinite(capital.amount) || capital.amount < 0) {
      issues.push(`Capital allocation "${capitalId}" has invalid amount "${capital.amount}".`);
    }
  }

  issues.push(...detectGoalCycles(state));
  return issues;
}

export function assertPrometheusInvariants(state: PrometheusState): void {
  const issues = validatePrometheusState(state);
  if (issues.length === 0) {
    return;
  }
  throw new Error(`PROMETHEUS invariant violation:\n- ${issues.join("\n- ")}`);
}
