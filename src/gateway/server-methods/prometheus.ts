import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
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
import {
  PROMETHEUS_GATEWAY_METHOD_METADATA,
  type PrometheusGatewayMethodMetadata,
} from "./prometheus-methods.js";
import {
  buildPrometheusControlCatalogSnapshot,
  type PrometheusControlCatalogSnapshot,
} from "./prometheus.control-catalog.js";
import {
  PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
  isPrometheusControlPreviewAction,
  runPrometheusControlPreview,
  type PrometheusControlPreviewResult,
  type PrometheusControlPreviewDeps,
} from "./prometheus.control-preview.js";
import {
  CAPITAL_FORMS,
  type CapitalForm,
  isGapSeverity,
  resolveCapitalDemands,
  resolveMaxItems,
  resolveObserverStateDir,
  resolveRecursionWindowSize,
  resolveRootGoalIds,
  resolveSinceAt,
  resolveTrajectoryWindowSize,
} from "./prometheus.params.js";

const PROMETHEUS_VALID_ERROR_CODES = new Set(Object.values(ErrorCodes));

export function assertPrometheusHandlerContract(args: {
  handlers: GatewayRequestHandlers;
  methodMetadata: Record<string, PrometheusGatewayMethodMetadata>;
}): void {
  const { handlers, methodMetadata } = args;
  const handlerMethods = Object.keys(handlers).toSorted();
  const metadataMethods = Object.keys(methodMetadata).toSorted();
  if (
    handlerMethods.length !== metadataMethods.length ||
    handlerMethods.some((method, index) => metadataMethods[index] !== method)
  ) {
    throw new Error("PROMETHEUS handler contract mismatch: handlers and metadata keys diverged");
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPrometheusPlannedPreflightShape(value: unknown): value is {
  disabledMessage: string;
  notImplementedMessage: string;
  requiredParamsMessage: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as {
    disabledMessage?: unknown;
    notImplementedMessage?: unknown;
    requiredParamsMessage?: unknown;
  };
  return (
    typeof candidate.disabledMessage === "string" &&
    typeof candidate.notImplementedMessage === "string" &&
    typeof candidate.requiredParamsMessage === "string"
  );
}

function isPrometheusCatalogMethodEntry(
  value: unknown,
): value is { method: string; access: string; mutatesState: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { method?: unknown; access?: unknown; mutatesState?: unknown };
  if (typeof candidate.method !== "string") {
    return false;
  }
  const expectedMetadata = PROMETHEUS_GATEWAY_METHOD_METADATA[candidate.method];
  if (!expectedMetadata) {
    return false;
  }
  return (
    typeof candidate.access === "string" &&
    typeof candidate.mutatesState === "boolean" &&
    candidate.access === expectedMetadata.access &&
    candidate.mutatesState === expectedMetadata.mutatesState
  );
}

function isPrometheusCatalogPreviewActionEntry(
  value: unknown,
): value is { action: string; mutatesState: boolean; requiredParams: readonly string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as {
    action?: unknown;
    mutatesState?: unknown;
    requiredParams?: unknown;
  };
  if (typeof candidate.action !== "string" || !isPrometheusControlPreviewAction(candidate.action)) {
    return false;
  }
  const expectedMetadata = PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[candidate.action];
  return (
    typeof candidate.mutatesState === "boolean" &&
    candidate.mutatesState === expectedMetadata.mutatesState &&
    isStringArray(candidate.requiredParams) &&
    candidate.requiredParams.length === expectedMetadata.requiredParams.length &&
    candidate.requiredParams.every(
      (param, index) => expectedMetadata.requiredParams[index] === param,
    )
  );
}

function isPrometheusCatalogPlannedMethodEntry(value: unknown): value is {
  method: string;
  access: string;
  mutatesState: boolean;
  enabled: boolean;
  enableEnvVar: string;
  requiredParams: readonly string[];
  reason: string;
  preflight: {
    disabledMessage: string;
    notImplementedMessage: string;
    requiredParamsMessage: string;
  };
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as {
    method?: unknown;
    access?: unknown;
    mutatesState?: unknown;
    enabled?: unknown;
    enableEnvVar?: unknown;
    requiredParams?: unknown;
    reason?: unknown;
    preflight?: unknown;
  };
  return (
    typeof candidate.method === "string" &&
    typeof candidate.access === "string" &&
    typeof candidate.mutatesState === "boolean" &&
    typeof candidate.enabled === "boolean" &&
    typeof candidate.enableEnvVar === "string" &&
    isStringArray(candidate.requiredParams) &&
    typeof candidate.reason === "string" &&
    isPrometheusPlannedPreflightShape(candidate.preflight)
  );
}

function isPrometheusCatalogPlannedActionEntry(value: unknown): value is {
  action: string;
  mutatesState: boolean;
  enabled: boolean;
  enableEnvVar: string;
  requiredParams: readonly string[];
  reason: string;
  preflight: {
    disabledMessage: string;
    notImplementedMessage: string;
    requiredParamsMessage: string;
  };
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as {
    action?: unknown;
    mutatesState?: unknown;
    enabled?: unknown;
    enableEnvVar?: unknown;
    requiredParams?: unknown;
    reason?: unknown;
    preflight?: unknown;
  };
  return (
    typeof candidate.action === "string" &&
    typeof candidate.mutatesState === "boolean" &&
    typeof candidate.enabled === "boolean" &&
    typeof candidate.enableEnvVar === "string" &&
    isStringArray(candidate.requiredParams) &&
    typeof candidate.reason === "string" &&
    isPrometheusPlannedPreflightShape(candidate.preflight)
  );
}

function isPrometheusControlCatalogSnapshot(
  value: unknown,
): value is PrometheusControlCatalogSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<PrometheusControlCatalogSnapshot>;
  const summary = candidate.summary as
    | Partial<PrometheusControlCatalogSnapshot["summary"]>
    | undefined;
  const guardrails = candidate.guardrails as
    | Partial<PrometheusControlCatalogSnapshot["guardrails"]>
    | undefined;
  const controlPreview = candidate.controlPreview as
    | Partial<PrometheusControlCatalogSnapshot["controlPreview"]>
    | undefined;
  const methods = Array.isArray(candidate.methods) ? candidate.methods : null;
  const controlPreviewActions = Array.isArray(controlPreview?.actions)
    ? controlPreview.actions
    : null;
  const mutatingMethodsFromMethods = methods
    ?.filter((method) => method.mutatesState)
    .map((method) => method.method);
  const mutatingActionsFromControlPreview = controlPreviewActions
    ?.filter((action) => action.mutatesState)
    .map((action) => action.action);
  return (
    isFiniteNumber(candidate.ts) &&
    !!summary &&
    isFiniteNumber(summary.totalMethods) &&
    isFiniteNumber(summary.readMethods) &&
    isFiniteNumber(summary.writeMethods) &&
    isFiniteNumber(summary.mutatingMethods) &&
    isFiniteNumber(summary.plannedMutatingMethods) &&
    isFiniteNumber(summary.previewActions) &&
    isFiniteNumber(summary.mutatingPreviewActions) &&
    isFiniteNumber(summary.plannedMutatingPreviewActions) &&
    !!guardrails &&
    typeof guardrails.mutationsEnabled === "boolean" &&
    typeof guardrails.enableEnvVar === "string" &&
    isStringArray(guardrails.mutatingMethods) &&
    isStringArray(guardrails.mutatingPreviewActions) &&
    Array.isArray(guardrails.plannedMutatingMethods) &&
    guardrails.plannedMutatingMethods.every(isPrometheusCatalogPlannedMethodEntry) &&
    Array.isArray(guardrails.plannedMutatingPreviewActions) &&
    guardrails.plannedMutatingPreviewActions.every(isPrometheusCatalogPlannedActionEntry) &&
    !!methods &&
    methods.every(isPrometheusCatalogMethodEntry) &&
    !!controlPreview &&
    controlPreview.method === "prometheus.control.preview" &&
    !!controlPreviewActions &&
    controlPreviewActions.every(isPrometheusCatalogPreviewActionEntry) &&
    summary.totalMethods === methods.length &&
    summary.readMethods + summary.writeMethods === summary.totalMethods &&
    summary.mutatingMethods === mutatingMethodsFromMethods?.length &&
    summary.plannedMutatingMethods === guardrails.plannedMutatingMethods.length &&
    summary.previewActions === controlPreviewActions.length &&
    summary.mutatingPreviewActions === mutatingActionsFromControlPreview?.length &&
    summary.plannedMutatingPreviewActions === guardrails.plannedMutatingPreviewActions.length &&
    Array.isArray(guardrails.mutatingMethods) &&
    guardrails.mutatingMethods.toSorted().join("|") ===
      (mutatingMethodsFromMethods ?? []).toSorted().join("|") &&
    Array.isArray(guardrails.mutatingPreviewActions) &&
    guardrails.mutatingPreviewActions.toSorted().join("|") ===
      (mutatingActionsFromControlPreview ?? []).toSorted().join("|")
  );
}

function isPrometheusControlPreviewResult(value: unknown): value is PrometheusControlPreviewResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<PrometheusControlPreviewResult>;
  if (candidate.ok === true) {
    const payload = candidate.payload as
      | {
          ts?: unknown;
          action?: unknown;
          mutatesState?: unknown;
          preview?: unknown;
        }
      | undefined;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return false;
    }
    if (typeof payload.action !== "string" || !isPrometheusControlPreviewAction(payload.action)) {
      return false;
    }
    const expectedMetadata = PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[payload.action];
    return (
      isFiniteNumber(payload.ts) &&
      payload.mutatesState === expectedMetadata.mutatesState &&
      "preview" in payload
    );
  }
  if (candidate.ok === false) {
    return (
      !!candidate.error &&
      typeof candidate.error === "object" &&
      typeof candidate.error.code === "string" &&
      PROMETHEUS_VALID_ERROR_CODES.has(candidate.error.code) &&
      typeof candidate.error.message === "string"
    );
  }
  return false;
}

type PrometheusHandlersDeps = {
  buildControlCatalogSnapshot?: typeof buildPrometheusControlCatalogSnapshot;
  runControlPreview?: (
    params: Record<string, unknown>,
    deps?: PrometheusControlPreviewDeps,
  ) => ReturnType<typeof runPrometheusControlPreview>;
  controlPreviewDeps?: PrometheusControlPreviewDeps;
};

export function createPrometheusHandlers(deps?: PrometheusHandlersDeps): GatewayRequestHandlers {
  const buildControlCatalogSnapshot =
    deps?.buildControlCatalogSnapshot ?? buildPrometheusControlCatalogSnapshot;
  const runControlPreview = deps?.runControlPreview ?? runPrometheusControlPreview;
  const controlPreviewDeps = deps?.controlPreviewDeps;
  return {
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
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)));
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
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)));
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
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)));
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
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)));
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
        const goalsWithUnresolvedGaps = Array.from(
          new Set(unresolvedGaps.map((gap) => gap.goalId)),
        );

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
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)));
      }
    },
    "prometheus.control.catalog": async ({ respond }) => {
      try {
        const catalog = buildControlCatalogSnapshot();
        if (!isPrometheusControlCatalogSnapshot(catalog)) {
          throw new Error("Invalid control catalog snapshot shape from handler dependency");
        }
        respond(true, catalog, undefined);
      } catch (error) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)));
      }
    },
    "prometheus.control.preview": async ({ respond, params }) => {
      try {
        const result = await runControlPreview(params, controlPreviewDeps);
        if (!isPrometheusControlPreviewResult(result)) {
          throw new Error("Invalid control preview result shape from handler dependency");
        }
        if (!result.ok) {
          respond(false, undefined, errorShape(result.error.code, result.error.message));
          return;
        }
        respond(true, result.payload, undefined);
      } catch (error) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)));
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
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)));
      }
    },
  };
}

export const prometheusHandlers: GatewayRequestHandlers = createPrometheusHandlers();

assertPrometheusHandlerContract({
  handlers: prometheusHandlers,
  methodMetadata: PROMETHEUS_GATEWAY_METHOD_METADATA,
});
