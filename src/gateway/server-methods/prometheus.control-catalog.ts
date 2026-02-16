import {
  buildPrometheusPlannedMutatingMethodPreflight,
  listPrometheusMutatingMethods,
  listPrometheusPlannedMutatingMethods,
  arePrometheusMutatingControlsEnabled,
  getPrometheusPlannedMutatingMethodMetadata,
  getPrometheusPlannedMutatingMethodPreflight,
  PROMETHEUS_GATEWAY_METHOD_METADATA,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./prometheus-methods.js";
import {
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  listPrometheusMutatingPreviewActions,
  listPrometheusPlannedMutatingPreviewActions,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  getPrometheusPlannedMutatingPreviewActionPreflight,
  PROMETHEUS_CONTROL_PREVIEW_ACTIONS,
  PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
} from "./prometheus.control-preview.js";
import { hasPrometheusInvalidRequiredParams } from "./prometheus.preflight-guards.js";

export type PrometheusControlCatalogSnapshot = {
  ts: number;
  summary: {
    totalMethods: number;
    readMethods: number;
    writeMethods: number;
    mutatingMethods: number;
    plannedMutatingMethods: number;
    previewActions: number;
    mutatingPreviewActions: number;
    plannedMutatingPreviewActions: number;
  };
  guardrails: {
    mutationsEnabled: boolean;
    enableEnvVar: string;
    mutatingMethods: string[];
    mutatingPreviewActions: string[];
    plannedMutatingMethods: Array<{
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
    }>;
    plannedMutatingPreviewActions: Array<{
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
    }>;
  };
  methods: Array<{
    method: string;
    access: string;
    mutatesState: boolean;
  }>;
  controlPreview: {
    method: "prometheus.control.preview";
    actions: Array<{
      action: string;
      mutatesState: boolean;
      requiredParams: readonly string[];
    }>;
  };
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPrometheusPlannedMethodMetadataShape(
  value: unknown,
): value is NonNullable<ReturnType<typeof getPrometheusPlannedMutatingMethodMetadata>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<ReturnType<typeof getPrometheusPlannedMutatingMethodMetadata>>;
  return (
    candidate.access === "write" &&
    candidate.mutatesState === true &&
    candidate.enabled === false &&
    typeof candidate.enableEnvVar === "string" &&
    isStringArray(candidate.requiredParams) &&
    !hasPrometheusInvalidRequiredParams(candidate.requiredParams) &&
    typeof candidate.reason === "string"
  );
}

function isPrometheusPlannedMethodPreflightShape(
  value: unknown,
): value is NonNullable<ReturnType<typeof getPrometheusPlannedMutatingMethodPreflight>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<
    ReturnType<typeof getPrometheusPlannedMutatingMethodPreflight>
  >;
  return (
    typeof candidate.disabledMessage === "string" &&
    typeof candidate.notImplementedMessage === "string" &&
    typeof candidate.requiredParamsMessage === "string"
  );
}

function isPrometheusPlannedActionMetadataShape(
  value: unknown,
): value is NonNullable<ReturnType<typeof getPrometheusPlannedMutatingPreviewActionMetadata>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<
    ReturnType<typeof getPrometheusPlannedMutatingPreviewActionMetadata>
  >;
  return (
    candidate.mutatesState === true &&
    candidate.enabled === false &&
    typeof candidate.enableEnvVar === "string" &&
    isStringArray(candidate.requiredParams) &&
    !hasPrometheusInvalidRequiredParams(candidate.requiredParams) &&
    typeof candidate.reason === "string"
  );
}

function isPrometheusPlannedActionPreflightShape(
  value: unknown,
): value is NonNullable<ReturnType<typeof getPrometheusPlannedMutatingPreviewActionPreflight>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<
    ReturnType<typeof getPrometheusPlannedMutatingPreviewActionPreflight>
  >;
  return (
    typeof candidate.disabledMessage === "string" &&
    typeof candidate.notImplementedMessage === "string" &&
    typeof candidate.requiredParamsMessage === "string"
  );
}

export function buildPrometheusControlCatalogSnapshot(args?: {
  env?: NodeJS.ProcessEnv;
  now?: number;
  resolvePlannedMethodMetadata?: (
    method: string,
  ) => ReturnType<typeof getPrometheusPlannedMutatingMethodMetadata>;
  resolvePlannedMethodPreflight?: (
    method: string,
  ) => ReturnType<typeof getPrometheusPlannedMutatingMethodPreflight>;
  resolvePlannedActionMetadata?: (
    action: string,
  ) => ReturnType<typeof getPrometheusPlannedMutatingPreviewActionMetadata>;
  resolvePlannedActionPreflight?: (
    action: string,
  ) => ReturnType<typeof getPrometheusPlannedMutatingPreviewActionPreflight>;
}): PrometheusControlCatalogSnapshot {
  const env = args?.env ?? process.env;
  const now = args?.now ?? Date.now();
  const resolvePlannedMethodMetadata =
    args?.resolvePlannedMethodMetadata ?? getPrometheusPlannedMutatingMethodMetadata;
  const resolvePlannedMethodPreflight =
    args?.resolvePlannedMethodPreflight ?? getPrometheusPlannedMutatingMethodPreflight;
  const resolvePlannedActionMetadata =
    args?.resolvePlannedActionMetadata ?? getPrometheusPlannedMutatingPreviewActionMetadata;
  const resolvePlannedActionPreflight =
    args?.resolvePlannedActionPreflight ?? getPrometheusPlannedMutatingPreviewActionPreflight;

  const methods = Object.entries(PROMETHEUS_GATEWAY_METHOD_METADATA)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([method, metadata]) => ({
      method,
      access: metadata.access,
      mutatesState: metadata.mutatesState,
    }));
  const actions = [...PROMETHEUS_CONTROL_PREVIEW_ACTIONS].map((action) => ({
    action,
    ...PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[action],
  }));
  const mutatingMethods = listPrometheusMutatingMethods();
  const plannedMutatingMethods = listPrometheusPlannedMutatingMethods();
  const mutatingPreviewActions = listPrometheusMutatingPreviewActions();
  const plannedMutatingPreviewActions = listPrometheusPlannedMutatingPreviewActions();
  const mutationsEnabled = arePrometheusMutatingControlsEnabled(env);
  const summary = {
    totalMethods: methods.length,
    readMethods: methods.filter((method) => method.access === "read").length,
    writeMethods: methods.filter((method) => method.access === "write").length,
    mutatingMethods: mutatingMethods.length,
    plannedMutatingMethods: plannedMutatingMethods.length,
    previewActions: actions.length,
    mutatingPreviewActions: mutatingPreviewActions.length,
    plannedMutatingPreviewActions: plannedMutatingPreviewActions.length,
  };

  return {
    ts: now,
    summary,
    guardrails: {
      mutationsEnabled,
      enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
      mutatingMethods,
      mutatingPreviewActions,
      plannedMutatingMethods: plannedMutatingMethods.map((method) => {
        const metadata = resolvePlannedMethodMetadata(method);
        const validatedMetadata = isPrometheusPlannedMethodMetadataShape(metadata)
          ? metadata
          : undefined;
        const resolvedPreflight = resolvePlannedMethodPreflight(method);
        const validatedPreflight = isPrometheusPlannedMethodPreflightShape(resolvedPreflight)
          ? resolvedPreflight
          : undefined;
        if (!validatedMetadata) {
          throw new Error(`Missing planned mutating method metadata for "${method}"`);
        }
        const preflight =
          validatedPreflight ??
          buildPrometheusPlannedMutatingMethodPreflight({
            method,
            metadata: validatedMetadata,
          });
        return {
          method,
          ...validatedMetadata,
          preflight,
        };
      }),
      plannedMutatingPreviewActions: plannedMutatingPreviewActions.map((action) => {
        const metadata = resolvePlannedActionMetadata(action);
        const validatedMetadata = isPrometheusPlannedActionMetadataShape(metadata)
          ? metadata
          : undefined;
        const resolvedPreflight = resolvePlannedActionPreflight(action);
        const validatedPreflight = isPrometheusPlannedActionPreflightShape(resolvedPreflight)
          ? resolvedPreflight
          : undefined;
        if (!validatedMetadata) {
          throw new Error(`Missing planned mutating action metadata for "${action}"`);
        }
        const preflight =
          validatedPreflight ??
          buildPrometheusPlannedMutatingPreviewActionPreflight({
            action,
            metadata: validatedMetadata,
          });
        return {
          action,
          ...validatedMetadata,
          preflight,
        };
      }),
    },
    methods,
    controlPreview: {
      method: "prometheus.control.preview",
      actions,
    },
  };
}
