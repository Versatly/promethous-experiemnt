import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";

export const CAPITAL_FORMS = [
  "money",
  "compute",
  "materials",
  "labor",
  "political",
  "data",
] as const;

export type CapitalForm = (typeof CAPITAL_FORMS)[number];

const GAP_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type GapSeverity = (typeof GAP_SEVERITIES)[number];

export function isGapSeverity(value: unknown): value is GapSeverity {
  return typeof value === "string" && GAP_SEVERITIES.includes(value as GapSeverity);
}

export function resolveObserverStateDir(params: Record<string, unknown>): string {
  const rawStateDir = params.stateDir;
  if (typeof rawStateDir === "string" && rawStateDir.trim()) {
    return path.resolve(rawStateDir);
  }
  return resolveStateDir();
}

export function resolveRootGoalIds(
  params: Record<string, unknown>,
  fallbackGoalIds: readonly string[],
): string[] {
  const rawRootGoalIds = params.rootGoalIds;
  if (!Array.isArray(rawRootGoalIds)) {
    return [...fallbackGoalIds];
  }
  const parsed = rawRootGoalIds
    .filter((goalId): goalId is string => typeof goalId === "string")
    .map((goalId) => goalId.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallbackGoalIds];
}

export function resolveTrajectoryWindowSize(params: Record<string, unknown>): number {
  const raw = params.trajectoryWindowSize;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 10;
  }
  return Math.max(2, Math.floor(raw));
}

export function resolveSinceAt(params: Record<string, unknown>): number | undefined {
  const raw = params.sinceAt;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  return raw;
}

export function resolveRecursionWindowSize(params: Record<string, unknown>): number {
  const raw = params.recursionWindowSize;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 10;
  }
  return Math.max(1, Math.floor(raw));
}

function isCapitalForm(value: unknown): value is CapitalForm {
  return typeof value === "string" && CAPITAL_FORMS.includes(value as CapitalForm);
}

export function resolveMaxItems(params: Record<string, unknown>, fallback = 50): number {
  const raw = params.maxItems;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(1, Math.min(500, Math.floor(raw)));
}

export function resolveCapitalDemands(params: Record<string, unknown>) {
  const rawDemands = params.demands;
  if (!Array.isArray(rawDemands)) {
    return [];
  }
  const demands: Array<{
    goalId: string;
    form: CapitalForm;
    requiredAmount: number;
    priority: number;
  }> = [];
  for (const demand of rawDemands) {
    if (!demand || typeof demand !== "object") {
      continue;
    }
    const candidate = demand as Record<string, unknown>;
    if (typeof candidate.goalId !== "string" || !candidate.goalId.trim()) {
      continue;
    }
    if (!isCapitalForm(candidate.form)) {
      continue;
    }
    if (
      typeof candidate.requiredAmount !== "number" ||
      !Number.isFinite(candidate.requiredAmount)
    ) {
      continue;
    }
    const priorityRaw = candidate.priority;
    const priority =
      typeof priorityRaw === "number" && Number.isFinite(priorityRaw)
        ? Math.max(0, Math.floor(priorityRaw))
        : 0;
    demands.push({
      goalId: candidate.goalId,
      form: candidate.form,
      requiredAmount: Math.max(0, candidate.requiredAmount),
      priority,
    });
  }
  return demands;
}
