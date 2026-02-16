import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { resolveStateDir } from "../../config/paths.js";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
  detectTrajectoryDivergence,
  evaluateAlignmentGuardrails,
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
};
