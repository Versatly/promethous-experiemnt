import path from "node:path";
import {
  computeGoalTrajectorySnapshot,
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
  detectCapabilityGapsFromFailedPaths,
  detectTrajectoryDivergence,
  evaluateMutationProposal,
  replayPrometheusEvents,
} from "../../prometheus/index.js";
import { type ErrorCode, ErrorCodes } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import { PROMETHEUS_MUTATING_CONTROLS_ENV } from "./prometheus-methods.js";
import {
  resolveMaxItems,
  resolveObserverStateDir,
  resolveTrajectoryWindowSize,
} from "./prometheus.params.js";

export const PROMETHEUS_CONTROL_PREVIEW_ACTIONS = [
  "autarch.gap-detection",
  "helios.trajectory-evaluation",
  "recursion.mutation-evaluation",
] as const;

export type PrometheusControlPreviewAction = (typeof PROMETHEUS_CONTROL_PREVIEW_ACTIONS)[number];

type PrometheusControlPreviewActionMetadata = {
  mutatesState: false;
  requiredParams: readonly string[];
};

export const PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA = {
  "autarch.gap-detection": {
    mutatesState: false,
    requiredParams: [],
  },
  "helios.trajectory-evaluation": {
    mutatesState: false,
    requiredParams: ["goalId"],
  },
  "recursion.mutation-evaluation": {
    mutatesState: false,
    requiredParams: ["proposal", "baseline", "candidate"],
  },
} as const satisfies Record<PrometheusControlPreviewAction, PrometheusControlPreviewActionMetadata>;

type PrometheusPlannedMutatingPreviewActionMetadata = {
  mutatesState: true;
  enabled: false;
  enableEnvVar: typeof PROMETHEUS_MUTATING_CONTROLS_ENV;
  requiredParams: readonly string[];
  reason: string;
};

export const PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA = {
  "autarch.gap-detection.commit": {
    mutatesState: true,
    enabled: false,
    enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
    requiredParams: ["goalId"],
    reason: "Reserved for future gap-event commit flow after control cutover.",
  },
  "helios.trajectory-evaluation.commit": {
    mutatesState: true,
    enabled: false,
    enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
    requiredParams: ["goalId"],
    reason: "Reserved for future trajectory snapshot persistence flow.",
  },
  "recursion.mutation-evaluation.commit": {
    mutatesState: true,
    enabled: false,
    enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
    requiredParams: ["proposal", "baseline", "candidate"],
    reason: "Reserved for future recursion decision commit flow.",
  },
} as const satisfies Record<string, PrometheusPlannedMutatingPreviewActionMetadata>;

export function listPrometheusMutatingPreviewActions(
  actionMetadata: Record<
    string,
    PrometheusControlPreviewActionMetadata
  > = PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
): string[] {
  return Object.entries(actionMetadata)
    .filter(([, metadata]) => metadata.mutatesState)
    .map(([action]) => action)
    .toSorted();
}

export function listPrometheusPlannedMutatingPreviewActions(
  actionMetadata: Record<
    string,
    PrometheusPlannedMutatingPreviewActionMetadata
  > = PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
): string[] {
  return Object.entries(actionMetadata)
    .filter(([, metadata]) => !metadata.enabled && metadata.mutatesState)
    .map(([action]) => action)
    .toSorted();
}

export function assertPrometheusControlPreviewActionContract(args: {
  actions: readonly string[];
  actionMetadata: Record<string, PrometheusControlPreviewActionMetadata>;
}): void {
  const { actions, actionMetadata } = args;
  if (new Set(actions).size !== actions.length) {
    throw new Error("PROMETHEUS control action contract mismatch: duplicate actions detected");
  }
  const metadataActions = Object.keys(actionMetadata);
  if (new Set(metadataActions).size !== metadataActions.length) {
    throw new Error(
      "PROMETHEUS control action contract mismatch: duplicate metadata actions detected",
    );
  }
  const actionsSorted = [...actions].toSorted();
  const metadataSorted = [...metadataActions].toSorted();
  if (
    actionsSorted.length !== metadataSorted.length ||
    actionsSorted.some((action, index) => metadataSorted[index] !== action)
  ) {
    throw new Error(
      "PROMETHEUS control action contract mismatch: action list and metadata keys diverged",
    );
  }
  for (const action of actions) {
    if (typeof actionMetadata[action]?.mutatesState !== "boolean") {
      throw new Error(`PROMETHEUS control action contract mismatch: ${action} missing mutability`);
    }
    if (!Array.isArray(actionMetadata[action]?.requiredParams)) {
      throw new Error(
        `PROMETHEUS control action contract mismatch: ${action} missing required params`,
      );
    }
  }
}

export function assertPrometheusPlannedMutatingPreviewActionContract(args: {
  activeActions: readonly string[];
  plannedMutatingActionMetadata: Record<string, PrometheusPlannedMutatingPreviewActionMetadata>;
}): void {
  const { activeActions, plannedMutatingActionMetadata } = args;
  const plannedActions = Object.keys(plannedMutatingActionMetadata);
  if (new Set(plannedActions).size !== plannedActions.length) {
    throw new Error(
      "PROMETHEUS planned control action contract mismatch: duplicate planned actions detected",
    );
  }
  for (const action of plannedActions) {
    if (activeActions.includes(action)) {
      throw new Error(
        `PROMETHEUS planned control action contract mismatch: ${action} overlaps active actions`,
      );
    }
    const metadata = plannedMutatingActionMetadata[action];
    if (metadata.enabled || !metadata.mutatesState) {
      throw new Error(
        `PROMETHEUS planned control action contract mismatch: ${action} must be disabled mutating`,
      );
    }
    if (!Array.isArray(metadata.requiredParams)) {
      throw new Error(
        `PROMETHEUS planned control action contract mismatch: ${action} missing required params`,
      );
    }
    if (metadata.enableEnvVar !== PROMETHEUS_MUTATING_CONTROLS_ENV) {
      throw new Error(
        `PROMETHEUS planned control action contract mismatch: ${action} invalid env guard`,
      );
    }
  }
}

assertPrometheusControlPreviewActionContract({
  actions: PROMETHEUS_CONTROL_PREVIEW_ACTIONS,
  actionMetadata: PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
});

assertPrometheusPlannedMutatingPreviewActionContract({
  activeActions: PROMETHEUS_CONTROL_PREVIEW_ACTIONS,
  plannedMutatingActionMetadata: PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
});

type MutationFitnessSnapshotInput = {
  objectiveFit: number;
  stability: number;
  throughput: number;
};

type PrometheusControlPreviewError = {
  code: ErrorCode;
  message: string;
};

type PrometheusControlPreviewSuccess = {
  ok: true;
  payload: {
    ts: number;
    action: PrometheusControlPreviewAction;
    mutatesState: false;
    preview: unknown;
  };
};

type PrometheusControlPreviewFailure = {
  ok: false;
  error: PrometheusControlPreviewError;
};

export type PrometheusControlPreviewResult =
  | PrometheusControlPreviewSuccess
  | PrometheusControlPreviewFailure;

function isMutationFitnessSnapshotInput(value: unknown): value is MutationFitnessSnapshotInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<MutationFitnessSnapshotInput>;
  return (
    typeof candidate.objectiveFit === "number" &&
    Number.isFinite(candidate.objectiveFit) &&
    typeof candidate.stability === "number" &&
    Number.isFinite(candidate.stability) &&
    typeof candidate.throughput === "number" &&
    Number.isFinite(candidate.throughput)
  );
}

function resolveMutationRisk(value: unknown): "low" | "medium" | "high" {
  if (value === "low" || value === "high") {
    return value;
  }
  return "medium";
}

function invalidRequest(message: string): PrometheusControlPreviewFailure {
  return {
    ok: false,
    error: {
      code: ErrorCodes.INVALID_REQUEST,
      message,
    },
  };
}

function unavailableError(error: unknown): PrometheusControlPreviewFailure {
  return {
    ok: false,
    error: {
      code: ErrorCodes.UNAVAILABLE,
      message: formatForLog(error),
    },
  };
}

export function isPrometheusControlPreviewAction(
  value: unknown,
): value is PrometheusControlPreviewAction {
  return (
    typeof value === "string" &&
    PROMETHEUS_CONTROL_PREVIEW_ACTIONS.includes(value as PrometheusControlPreviewAction)
  );
}

export async function runPrometheusControlPreview(
  params: Record<string, unknown>,
): Promise<PrometheusControlPreviewResult> {
  try {
    const rawAction =
      typeof params.action === "string" && params.action.trim().length > 0
        ? params.action.trim()
        : null;
    if (!rawAction) {
      return invalidRequest("action is required for prometheus.control.preview");
    }
    if (!isPrometheusControlPreviewAction(rawAction)) {
      return invalidRequest(`Unsupported control preview action "${rawAction}"`);
    }
    const actionMetadata = PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[rawAction];

    const stateDir = resolveObserverStateDir(params);
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    const events = await eventStore.readAll();
    const state = replayPrometheusEvents(events);
    const now = Date.now();

    if (rawAction === "autarch.gap-detection") {
      const suggestions = detectCapabilityGapsFromFailedPaths({
        state,
        now,
        maxSuggestions: resolveMaxItems(params, 10),
      });
      return {
        ok: true,
        payload: {
          ts: now,
          action: rawAction,
          mutatesState: actionMetadata.mutatesState,
          preview: {
            suggestedGapCount: suggestions.length,
            suggestions: suggestions.map((suggestion) => ({
              suggestionId: suggestion.suggestionId,
              goalId: suggestion.goalId,
              severity: suggestion.severity,
              description: suggestion.description,
            })),
          },
        },
      };
    }

    if (rawAction === "helios.trajectory-evaluation") {
      const goalId =
        typeof params.goalId === "string" && params.goalId.trim().length > 0
          ? params.goalId.trim()
          : null;
      if (!goalId) {
        return invalidRequest("goalId is required for HELIOS preview");
      }
      const goal = state.goals[goalId];
      if (!goal) {
        return invalidRequest(`Unknown goalId "${goalId}"`);
      }
      const snapshot = computeGoalTrajectorySnapshot({
        state,
        rootGoalId: goalId,
        at: now,
      });
      const trajectoryStore = createFileHeliosTrajectoryStore(
        path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
      );
      const snapshots = await trajectoryStore.readWindow({
        goalId,
        maxSnapshots: resolveTrajectoryWindowSize(params),
      });
      const divergence = detectTrajectoryDivergence({ snapshots });
      return {
        ok: true,
        payload: {
          ts: now,
          action: rawAction,
          mutatesState: actionMetadata.mutatesState,
          preview: {
            goalId,
            goalStatus: goal.status,
            computedSnapshot: snapshot,
            priorWindowSize: snapshots.length,
            divergence,
          },
        },
      };
    }

    const proposal = params.proposal;
    const baseline = params.baseline;
    const candidate = params.candidate;
    if (!proposal || typeof proposal !== "object") {
      return invalidRequest("proposal object is required");
    }
    if (!isMutationFitnessSnapshotInput(baseline) || !isMutationFitnessSnapshotInput(candidate)) {
      return invalidRequest("baseline and candidate fitness snapshots are required");
    }
    const proposalRecord = proposal as Record<string, unknown>;
    const mutationId =
      typeof proposalRecord.mutationId === "string" && proposalRecord.mutationId.trim()
        ? proposalRecord.mutationId.trim()
        : null;
    const title =
      typeof proposalRecord.title === "string" && proposalRecord.title.trim()
        ? proposalRecord.title.trim()
        : null;
    const hypothesis =
      typeof proposalRecord.hypothesis === "string" && proposalRecord.hypothesis.trim()
        ? proposalRecord.hypothesis.trim()
        : null;
    const expectedGain =
      typeof proposalRecord.expectedGain === "number" &&
      Number.isFinite(proposalRecord.expectedGain)
        ? proposalRecord.expectedGain
        : 0;
    if (!mutationId || !title || !hypothesis) {
      return invalidRequest("proposal requires mutationId, title, and hypothesis");
    }
    const evaluation = evaluateMutationProposal({
      proposal: {
        mutationId,
        title,
        hypothesis,
        risk: resolveMutationRisk(proposalRecord.risk),
        expectedGain,
      },
      baseline,
      candidate,
    });
    return {
      ok: true,
      payload: {
        ts: now,
        action: rawAction,
        mutatesState: actionMetadata.mutatesState,
        preview: {
          evaluation,
        },
      },
    };
  } catch (error) {
    return unavailableError(error);
  }
}
