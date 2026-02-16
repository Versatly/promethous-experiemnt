import type { PrometheusControlCatalogSnapshot } from "./prometheus.control-catalog.js";
import { ErrorCodes } from "../protocol/index.js";
import {
  PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
  getPrometheusPlannedMutatingMethodMetadata,
  getPrometheusPlannedMutatingMethodPreflight,
  PROMETHEUS_GATEWAY_METHOD_METADATA,
} from "./prometheus-methods.js";
import {
  PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
  PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  getPrometheusPlannedMutatingPreviewActionPreflight,
  isPrometheusControlPreviewAction,
  type PrometheusControlPreviewResult,
} from "./prometheus.control-preview.js";

const PROMETHEUS_VALID_ERROR_CODES = new Set(Object.values(ErrorCodes));

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isUnitInterval(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function areSameCanonicalStringLists(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  const actualSorted = [...actual].toSorted();
  const expectedSorted = [...expected].toSorted();
  return (
    new Set(actualSorted).size === actualSorted.length &&
    actualSorted.length === expectedSorted.length &&
    actualSorted.every((entry, index) => entry === expectedSorted[index])
  );
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

function isPrometheusPlannedPreflightEquivalent(
  left: {
    disabledMessage: string;
    notImplementedMessage: string;
    requiredParamsMessage: string;
  },
  right: {
    disabledMessage: string;
    notImplementedMessage: string;
    requiredParamsMessage: string;
  },
): boolean {
  return (
    left.disabledMessage === right.disabledMessage &&
    left.notImplementedMessage === right.notImplementedMessage &&
    left.requiredParamsMessage === right.requiredParamsMessage
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
  if (typeof candidate.method !== "string") {
    return false;
  }
  const expectedMetadata = getPrometheusPlannedMutatingMethodMetadata(candidate.method);
  if (!expectedMetadata) {
    return false;
  }
  const expectedPreflight = getPrometheusPlannedMutatingMethodPreflight(candidate.method);
  if (!expectedPreflight) {
    return false;
  }
  return (
    typeof candidate.access === "string" &&
    typeof candidate.mutatesState === "boolean" &&
    typeof candidate.enabled === "boolean" &&
    typeof candidate.enableEnvVar === "string" &&
    isStringArray(candidate.requiredParams) &&
    typeof candidate.reason === "string" &&
    candidate.access === expectedMetadata.access &&
    candidate.mutatesState === expectedMetadata.mutatesState &&
    candidate.enabled === expectedMetadata.enabled &&
    candidate.enableEnvVar === expectedMetadata.enableEnvVar &&
    candidate.reason === expectedMetadata.reason &&
    candidate.requiredParams.length === expectedMetadata.requiredParams.length &&
    candidate.requiredParams.every(
      (requiredParam, index) => requiredParam === expectedMetadata.requiredParams[index],
    ) &&
    isPrometheusPlannedPreflightShape(candidate.preflight) &&
    isPrometheusPlannedPreflightEquivalent(candidate.preflight, expectedPreflight)
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
  if (typeof candidate.action !== "string") {
    return false;
  }
  const expectedMetadata = getPrometheusPlannedMutatingPreviewActionMetadata(candidate.action);
  if (!expectedMetadata) {
    return false;
  }
  const expectedPreflight = getPrometheusPlannedMutatingPreviewActionPreflight(candidate.action);
  if (!expectedPreflight) {
    return false;
  }
  return (
    typeof candidate.mutatesState === "boolean" &&
    typeof candidate.enabled === "boolean" &&
    typeof candidate.enableEnvVar === "string" &&
    isStringArray(candidate.requiredParams) &&
    typeof candidate.reason === "string" &&
    candidate.mutatesState === expectedMetadata.mutatesState &&
    candidate.enabled === expectedMetadata.enabled &&
    candidate.enableEnvVar === expectedMetadata.enableEnvVar &&
    candidate.reason === expectedMetadata.reason &&
    candidate.requiredParams.length === expectedMetadata.requiredParams.length &&
    candidate.requiredParams.every(
      (requiredParam, index) => requiredParam === expectedMetadata.requiredParams[index],
    ) &&
    isPrometheusPlannedPreflightShape(candidate.preflight) &&
    isPrometheusPlannedPreflightEquivalent(candidate.preflight, expectedPreflight)
  );
}

export function isPrometheusControlCatalogSnapshot(
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
  const methodNames = methods?.map((method) => method.method);
  const previewActionNames = controlPreviewActions?.map((action) => action.action);
  const plannedMutatingMethodNames = Array.isArray(guardrails?.plannedMutatingMethods)
    ? guardrails.plannedMutatingMethods.map((method) => method.method)
    : null;
  const plannedMutatingActionNames = Array.isArray(guardrails?.plannedMutatingPreviewActions)
    ? guardrails.plannedMutatingPreviewActions.map((action) => action.action)
    : null;
  const expectedMethodNames = Object.keys(PROMETHEUS_GATEWAY_METHOD_METADATA);
  const expectedPreviewActionNames = Object.keys(PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA);
  const expectedPlannedMethodNames = Object.keys(PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA);
  const expectedPlannedActionNames = Object.keys(
    PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
  );
  return (
    isFiniteNumber(candidate.ts) &&
    !!summary &&
    isNonNegativeInteger(summary.totalMethods) &&
    isNonNegativeInteger(summary.readMethods) &&
    isNonNegativeInteger(summary.writeMethods) &&
    isNonNegativeInteger(summary.mutatingMethods) &&
    isNonNegativeInteger(summary.plannedMutatingMethods) &&
    isNonNegativeInteger(summary.previewActions) &&
    isNonNegativeInteger(summary.mutatingPreviewActions) &&
    isNonNegativeInteger(summary.plannedMutatingPreviewActions) &&
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
    summary.readMethods === methods.filter((method) => method.access === "read").length &&
    summary.writeMethods === methods.filter((method) => method.access === "write").length &&
    summary.readMethods + summary.writeMethods === summary.totalMethods &&
    summary.mutatingMethods === mutatingMethodsFromMethods?.length &&
    summary.plannedMutatingMethods === guardrails.plannedMutatingMethods.length &&
    summary.previewActions === controlPreviewActions.length &&
    summary.mutatingPreviewActions === mutatingActionsFromControlPreview?.length &&
    summary.plannedMutatingPreviewActions === guardrails.plannedMutatingPreviewActions.length &&
    Array.isArray(guardrails.mutatingMethods) &&
    !!methodNames &&
    !!previewActionNames &&
    !!plannedMutatingMethodNames &&
    !!plannedMutatingActionNames &&
    areSameCanonicalStringLists(methodNames, expectedMethodNames) &&
    areSameCanonicalStringLists(previewActionNames, expectedPreviewActionNames) &&
    areSameCanonicalStringLists(plannedMutatingMethodNames, expectedPlannedMethodNames) &&
    areSameCanonicalStringLists(plannedMutatingActionNames, expectedPlannedActionNames) &&
    guardrails.mutatingMethods.toSorted().join("|") ===
      (mutatingMethodsFromMethods ?? []).toSorted().join("|") &&
    Array.isArray(guardrails.mutatingPreviewActions) &&
    guardrails.mutatingPreviewActions.toSorted().join("|") ===
      (mutatingActionsFromControlPreview ?? []).toSorted().join("|")
  );
}

function isPrometheusAutarchGapDetectionPreview(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const suggestions = value.suggestions;
  return (
    isNonNegativeInteger(value.suggestedGapCount) &&
    Array.isArray(suggestions) &&
    suggestions.length === value.suggestedGapCount &&
    suggestions.every((entry) => {
      if (!isRecord(entry)) {
        return false;
      }
      return (
        typeof entry.suggestionId === "string" &&
        typeof entry.goalId === "string" &&
        typeof entry.severity === "string" &&
        typeof entry.description === "string"
      );
    })
  );
}

function isPrometheusHeliosTrajectoryPreview(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.computedSnapshot)) {
    return false;
  }
  const divergence = value.divergence;
  const isValidDivergence =
    divergence === null ||
    (isRecord(divergence) &&
      (divergence.severity === "low" ||
        divergence.severity === "medium" ||
        divergence.severity === "high") &&
      typeof divergence.reason === "string" &&
      isFiniteNumber(divergence.scoreDrop) &&
      isUnitInterval(divergence.latestScore));
  return (
    typeof value.goalId === "string" &&
    typeof value.goalStatus === "string" &&
    isNonNegativeInteger(value.priorWindowSize) &&
    isFiniteNumber(value.computedSnapshot.at) &&
    isUnitInterval(value.computedSnapshot.completionRatio) &&
    isUnitInterval(value.computedSnapshot.blockedRatio) &&
    value.computedSnapshot.completionRatio + value.computedSnapshot.blockedRatio <= 1 &&
    isUnitInterval(value.computedSnapshot.score) &&
    isValidDivergence
  );
}

function isPrometheusRecursionMutationEvaluationPreview(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.evaluation)) {
    return false;
  }
  return (
    typeof value.evaluation.mutationId === "string" &&
    typeof value.evaluation.accepted === "boolean" &&
    isFiniteNumber(value.evaluation.scoreDelta) &&
    value.evaluation.scoreDelta >= -1 &&
    value.evaluation.scoreDelta <= 1 &&
    isUnitInterval(value.evaluation.baselineScore) &&
    isUnitInterval(value.evaluation.candidateScore) &&
    typeof value.evaluation.rationale === "string"
  );
}

export function isPrometheusControlPreviewResult(
  value: unknown,
): value is PrometheusControlPreviewResult {
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
    const isValidPreview =
      payload.action === "autarch.gap-detection"
        ? isPrometheusAutarchGapDetectionPreview(payload.preview)
        : payload.action === "helios.trajectory-evaluation"
          ? isPrometheusHeliosTrajectoryPreview(payload.preview)
          : isPrometheusRecursionMutationEvaluationPreview(payload.preview);
    return (
      isFiniteNumber(payload.ts) &&
      payload.mutatesState === expectedMetadata.mutatesState &&
      "preview" in payload &&
      isValidPreview
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
