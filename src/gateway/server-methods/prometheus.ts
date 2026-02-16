import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { resolveStateDir } from "../../config/paths.js";
import {
  buildCapabilityGraph,
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
  detectTrajectoryDivergence,
  evaluateAlignmentGuardrails,
  evaluateInstitutionAction,
  planCapitalAllocations,
  replayPrometheusEvents,
} from "../../prometheus/index.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";

function resolveObserverStateDir(params: Record<string, unknown>): string {
  const rawStateDir = params.stateDir;
  if (typeof rawStateDir === "string" && rawStateDir.trim()) {
    return path.resolve(rawStateDir);
  }
  return resolveStateDir();
}

function resolveRootGoalIds(
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

function resolveTrajectoryWindowSize(params: Record<string, unknown>): number {
  const raw = params.trajectoryWindowSize;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 10;
  }
  return Math.max(2, Math.floor(raw));
}

function resolveSinceAt(params: Record<string, unknown>): number | undefined {
  const raw = params.sinceAt;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  return raw;
}

function resolveRecursionWindowSize(params: Record<string, unknown>): number {
  const raw = params.recursionWindowSize;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 10;
  }
  return Math.max(1, Math.floor(raw));
}

const CAPITAL_FORMS = ["money", "compute", "materials", "labor", "political", "data"] as const;
type CapitalForm = (typeof CAPITAL_FORMS)[number];
const GAP_SEVERITIES = ["low", "medium", "high", "critical"] as const;
type GapSeverity = (typeof GAP_SEVERITIES)[number];

function isCapitalForm(value: unknown): value is CapitalForm {
  return typeof value === "string" && CAPITAL_FORMS.includes(value as CapitalForm);
}

function isGapSeverity(value: unknown): value is GapSeverity {
  return typeof value === "string" && GAP_SEVERITIES.includes(value as GapSeverity);
}

function resolveMaxItems(params: Record<string, unknown>, fallback = 50): number {
  const raw = params.maxItems;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(1, Math.min(500, Math.floor(raw)));
}

function resolveCapitalDemands(params: Record<string, unknown>) {
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

export const prometheusHandlers: GatewayRequestHandlers = {
  "prometheus.status": async ({ respond, params }) => {
    try {
      const stateDir = resolveObserverStateDir(params);
      const eventLogPath = path.join(stateDir, "prometheus", "events.jsonl");
      const trajectoryLogPath = path.join(stateDir, "prometheus", "helios-trajectory.jsonl");
      const eventStore = createFilePrometheusEventStore(eventLogPath);
      const trajectoryStore = createFileHeliosTrajectoryStore(trajectoryLogPath);
      const events = await eventStore.readAll();
      const state = replayPrometheusEvents(events);
      const rootGoalDefaults = Object.values(state.goals)
        .filter((goal) => !goal.parentGoalId)
        .map((goal) => goal.id);
      const rootGoalIds = resolveRootGoalIds(params, rootGoalDefaults).filter((goalId) =>
        Boolean(state.goals[goalId]),
      );
      const trajectoryWindowSize = resolveTrajectoryWindowSize(params);

      const rootGoals = await Promise.all(
        rootGoalIds.map(async (goalId) => {
          const goal = state.goals[goalId];
          const snapshots = await trajectoryStore.readWindow({
            goalId,
            maxSnapshots: trajectoryWindowSize,
          });
          const latest = snapshots[snapshots.length - 1] ?? null;
          const divergence = detectTrajectoryDivergence({ snapshots });
          return {
            goalId,
            title: goal?.title,
            status: goal?.status,
            latestTrajectory: latest,
            divergence,
            snapshotCount: snapshots.length,
          };
        }),
      );

      const alignment = evaluateAlignmentGuardrails({ state });
      const unresolvedGapCount = Object.values(state.capabilityGaps).filter(
        (gap) => !gap.resolvedAt,
      ).length;

      respond(
        true,
        {
          ts: Date.now(),
          eventCount: events.length,
          summary: {
            goals: Object.keys(state.goals).length,
            blockedGoals: Object.values(state.goals).filter((goal) => goal.status === "blocked")
              .length,
            capabilityGaps: Object.keys(state.capabilityGaps).length,
            unresolvedCapabilityGaps: unresolvedGapCount,
            synthesizedCapabilities: Object.keys(state.synthesizedCapabilities).length,
            institutions: Object.keys(state.institutions).length,
            capitalAllocations: Object.keys(state.capitalLedger).length,
            recursionCycles: state.recursionCycles.length,
          },
          rootGoals,
          alignment,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, formatForLog(error)));
    }
  },
  "prometheus.trajectory": async ({ respond, params }) => {
    try {
      const stateDir = resolveObserverStateDir(params);
      const goalId =
        typeof params.goalId === "string" && params.goalId.trim().length > 0
          ? params.goalId.trim()
          : null;
      if (!goalId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "goalId is required for prometheus.trajectory"),
        );
        return;
      }
      const trajectoryWindowSize = resolveTrajectoryWindowSize(params);
      const sinceAt = resolveSinceAt(params);
      const eventStore = createFilePrometheusEventStore(
        path.join(stateDir, "prometheus", "events.jsonl"),
      );
      const trajectoryStore = createFileHeliosTrajectoryStore(
        path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
      );
      const events = await eventStore.readAll();
      const state = replayPrometheusEvents(events);
      const goal = state.goals[goalId];
      if (!goal) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Unknown goalId "${goalId}"`),
        );
        return;
      }

      const snapshots = await trajectoryStore.readWindow({
        goalId,
        maxSnapshots: trajectoryWindowSize,
        ...(sinceAt !== undefined ? { sinceAt } : {}),
      });
      const divergence = detectTrajectoryDivergence({
        snapshots,
      });
      const latest = snapshots[snapshots.length - 1] ?? null;
      const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
      const delta = latest && previous ? latest.score - previous.score : null;

      respond(
        true,
        {
          ts: Date.now(),
          goal: {
            goalId: goal.id,
            title: goal.title,
            status: goal.status,
            priority: goal.priority,
          },
          windowSize: trajectoryWindowSize,
          sinceAt: sinceAt ?? null,
          snapshotCount: snapshots.length,
          latest,
          scoreDeltaFromPrevious: delta,
          divergence,
          snapshots,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, formatForLog(error)));
    }
  },
  "prometheus.goals": async ({ respond, params }) => {
    try {
      const stateDir = resolveObserverStateDir(params);
      const eventStore = createFilePrometheusEventStore(
        path.join(stateDir, "prometheus", "events.jsonl"),
      );
      const events = await eventStore.readAll();
      const state = replayPrometheusEvents(events);
      const graph = buildCapabilityGraph({ state });
      const goals = Object.values(state.goals)
        .toSorted((left, right) => right.priority - left.priority)
        .map((goal) => ({
          goalId: goal.id,
          title: goal.title,
          status: goal.status,
          priority: goal.priority,
          parentGoalId: goal.parentGoalId,
          childGoalIds: goal.childGoalIds,
          capabilityCoverage: graph.coverageByGoal[goal.id] ?? {
            goalId: goal.id,
            capabilityIds: [],
            integratedCount: 0,
            provisionalCount: 0,
            unresolvedGapIds: [],
          },
        }));
      respond(
        true,
        {
          ts: Date.now(),
          total: goals.length,
          goals,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, formatForLog(error)));
    }
  },
  "prometheus.recursion": async ({ respond, params }) => {
    try {
      const stateDir = resolveObserverStateDir(params);
      const eventStore = createFilePrometheusEventStore(
        path.join(stateDir, "prometheus", "events.jsonl"),
      );
      const events = await eventStore.readAll();
      const state = replayPrometheusEvents(events);
      const recursionWindowSize = resolveRecursionWindowSize(params);
      const cycles = state.recursionCycles
        .slice(-recursionWindowSize)
        .toReversed()
        .map((cycle) => ({
          cycleId: cycle.cycleId,
          occurredAt: cycle.occurredAt,
          summary: cycle.summary,
          mutationId: cycle.mutationId,
          accepted: cycle.accepted,
          evaluationScore: cycle.evaluationScore,
          rollbackOfCycleId: cycle.rollbackOfCycleId,
          rationale: cycle.rationale,
        }));
      const accepted = cycles.filter((cycle) => cycle.accepted === true).length;
      const rejected = cycles.filter((cycle) => cycle.accepted === false).length;
      const rollbackCount = cycles.filter(
        (cycle) => typeof cycle.rollbackOfCycleId === "string",
      ).length;
      const acceptanceRatio = cycles.length === 0 ? 0 : accepted / cycles.length;

      respond(
        true,
        {
          ts: Date.now(),
          windowSize: recursionWindowSize,
          totals: {
            totalCycles: state.recursionCycles.length,
            accepted,
            rejected,
            rollbackCount,
            acceptanceRatio,
          },
          cycles,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, formatForLog(error)));
    }
  },
  "prometheus.autarch": async ({ respond, params }) => {
    try {
      const stateDir = resolveObserverStateDir(params);
      const eventStore = createFilePrometheusEventStore(
        path.join(stateDir, "prometheus", "events.jsonl"),
      );
      const events = await eventStore.readAll();
      const state = replayPrometheusEvents(events);
      const graph = buildCapabilityGraph({ state });
      const severityFilter = isGapSeverity(params.severity) ? params.severity : null;
      const includeResolved = params.includeResolved === true;
      const maxItems = resolveMaxItems(params, 100);

      const gaps = Object.values(state.capabilityGaps)
        .filter((gap) => (includeResolved ? true : !gap.resolvedAt))
        .filter((gap) => (severityFilter ? gap.severity === severityFilter : true))
        .toSorted((left, right) => {
          if (left.createdAt === right.createdAt) {
            return left.id.localeCompare(right.id);
          }
          return right.createdAt - left.createdAt;
        })
        .slice(0, maxItems)
        .map((gap) => ({
          gapId: gap.id,
          goalId: gap.goalId,
          goalTitle: state.goals[gap.goalId]?.title,
          severity: gap.severity,
          description: gap.description,
          createdAt: gap.createdAt,
          resolvedAt: gap.resolvedAt,
          hasSynthesizedCapability: Object.values(state.synthesizedCapabilities).some(
            (capability) => capability.gapId === gap.id,
          ),
        }));

      const capabilities = Object.values(state.synthesizedCapabilities)
        .toSorted((left, right) => {
          if (left.updatedAt === right.updatedAt) {
            return left.id.localeCompare(right.id);
          }
          return right.updatedAt - left.updatedAt;
        })
        .slice(0, maxItems)
        .map((capability) => {
          const gap = state.capabilityGaps[capability.gapId];
          return {
            capabilityId: capability.id,
            name: capability.name,
            status: capability.status,
            gapId: capability.gapId,
            goalId: gap?.goalId,
            goalTitle: gap ? state.goals[gap.goalId]?.title : undefined,
            createdAt: capability.createdAt,
            updatedAt: capability.updatedAt,
          };
        });

      const statusCounts = Object.values(state.synthesizedCapabilities).reduce(
        (accumulator, capability) => {
          accumulator[capability.status] += 1;
          return accumulator;
        },
        {
          proposed: 0,
          validated: 0,
          integrated: 0,
          rejected: 0,
        } as Record<"proposed" | "validated" | "integrated" | "rejected", number>,
      );

      const unresolvedGaps = Object.values(state.capabilityGaps).filter((gap) => !gap.resolvedAt);
      const criticalUnresolved = unresolvedGaps.filter((gap) => gap.severity === "critical");
      const goalsWithUnresolvedGaps = Array.from(new Set(unresolvedGaps.map((gap) => gap.goalId)));

      respond(
        true,
        {
          ts: Date.now(),
          summary: {
            capabilityGaps: Object.keys(state.capabilityGaps).length,
            unresolvedCapabilityGaps: unresolvedGaps.length,
            criticalUnresolvedCapabilityGaps: criticalUnresolved.length,
            synthesizedCapabilities: Object.keys(state.synthesizedCapabilities).length,
            synthesizedByStatus: statusCounts,
            goalsWithUnresolvedGaps: goalsWithUnresolvedGaps.length,
          },
          graph: {
            capabilityNodes: Object.keys(graph.capabilities).length,
            edgeCount: graph.edges.length,
          },
          goalsWithUnresolvedGaps,
          gaps,
          capabilities,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, formatForLog(error)));
    }
  },
  "prometheus.monolith": async ({ respond, params }) => {
    try {
      const stateDir = resolveObserverStateDir(params);
      const eventStore = createFilePrometheusEventStore(
        path.join(stateDir, "prometheus", "events.jsonl"),
      );
      const events = await eventStore.readAll();
      const state = replayPrometheusEvents(events);
      const demands = resolveCapitalDemands(params);
      const capitalByInstitution = Object.values(state.capitalLedger).reduce(
        (accumulator, entry) => {
          const byForm = accumulator[entry.institutionId] ?? {
            money: 0,
            compute: 0,
            materials: 0,
            labor: 0,
            political: 0,
            data: 0,
          };
          byForm[entry.form] += entry.amount;
          accumulator[entry.institutionId] = byForm;
          return accumulator;
        },
        {} as Record<string, Record<CapitalForm, number>>,
      );
      const totalsByForm = Object.values(capitalByInstitution).reduce(
        (totals, capital) => {
          for (const form of CAPITAL_FORMS) {
            totals[form] += capital[form] ?? 0;
          }
          return totals;
        },
        {
          money: 0,
          compute: 0,
          materials: 0,
          labor: 0,
          political: 0,
          data: 0,
        } as Record<CapitalForm, number>,
      );

      const institutions = Object.values(state.institutions)
        .toSorted((left, right) => left.name.localeCompare(right.name))
        .map((institution) => ({
          institutionId: institution.id,
          name: institution.name,
          status: institution.status,
          mandate: institution.mandate,
          authorityModel: institution.authorityModel,
          capital: capitalByInstitution[institution.id] ?? {
            money: 0,
            compute: 0,
            materials: 0,
            labor: 0,
            political: 0,
            data: 0,
          },
        }));

      const allocationPreview =
        demands.length > 0
          ? (() => {
              const plan = planCapitalAllocations({
                state,
                demands,
              });
              const governanceChecks = plan.allocations.map((allocation) => ({
                ...allocation,
                decision: evaluateInstitutionAction({
                  state,
                  request: {
                    institutionId: allocation.institutionId,
                    type: "capital.allocate",
                    form: allocation.form,
                    amount: allocation.amount,
                  },
                }),
              }));
              return {
                requestedDemands: demands.length,
                allocations: plan.allocations,
                unmetDemands: plan.unmetDemands,
                governanceChecks,
              };
            })()
          : null;

      respond(
        true,
        {
          ts: Date.now(),
          summary: {
            institutions: institutions.length,
            activeInstitutions: institutions.filter(
              (institution) => institution.status === "active",
            ).length,
            dormantInstitutions: institutions.filter(
              (institution) => institution.status === "dormant",
            ).length,
            dissolvedInstitutions: institutions.filter(
              (institution) => institution.status === "dissolved",
            ).length,
          },
          totalsByForm,
          institutions,
          allocationPreview,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, formatForLog(error)));
    }
  },
};
