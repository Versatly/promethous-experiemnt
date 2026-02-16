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
import {
  hasPrometheusInvalidRequiredParams,
  hasPrometheusInvalidReason,
} from "./prometheus.preflight-guards.js";

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
    typeof candidate.reason === "string" &&
    !hasPrometheusInvalidReason(candidate.reason)
  );
}

function isPrometheusPlannedMethodMetadataEquivalent(
  left: NonNullable<ReturnType<typeof getPrometheusPlannedMutatingMethodMetadata>>,
  right: NonNullable<ReturnType<typeof getPrometheusPlannedMutatingMethodMetadata>>,
): boolean {
  return (
    left.access === right.access &&
    left.mutatesState === right.mutatesState &&
    left.enabled === right.enabled &&
    left.enableEnvVar === right.enableEnvVar &&
    left.reason === right.reason &&
    left.requiredParams.length === right.requiredParams.length &&
    left.requiredParams.every(
      (requiredParam, index) => requiredParam === right.requiredParams[index],
    )
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

function isPrometheusPlannedMethodPreflightEquivalent(
  left: NonNullable<ReturnType<typeof getPrometheusPlannedMutatingMethodPreflight>>,
  right: NonNullable<ReturnType<typeof getPrometheusPlannedMutatingMethodPreflight>>,
): boolean {
  return (
    left.disabledMessage === right.disabledMessage &&
    left.notImplementedMessage === right.notImplementedMessage &&
    left.requiredParamsMessage === right.requiredParamsMessage
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
    typeof candidate.reason === "string" &&
    !hasPrometheusInvalidReason(candidate.reason)
  );
}

function isPrometheusPlannedActionMetadataEquivalent(
  left: NonNullable<ReturnType<typeof getPrometheusPlannedMutatingPreviewActionMetadata>>,
  right: NonNullable<ReturnType<typeof getPrometheusPlannedMutatingPreviewActionMetadata>>,
): boolean {
  return (
    left.mutatesState === right.mutatesState &&
    left.enabled === right.enabled &&
    left.enableEnvVar === right.enableEnvVar &&
    left.reason === right.reason &&
    left.requiredParams.length === right.requiredParams.length &&
    left.requiredParams.every(
      (requiredParam, index) => requiredParam === right.requiredParams[index],
    )
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

function isPrometheusPlannedActionPreflightEquivalent(
  left: NonNullable<ReturnType<typeof getPrometheusPlannedMutatingPreviewActionPreflight>>,
  right: NonNullable<ReturnType<typeof getPrometheusPlannedMutatingPreviewActionPreflight>>,
): boolean {
  return (
    left.disabledMessage === right.disabledMessage &&
    left.notImplementedMessage === right.notImplementedMessage &&
    left.requiredParamsMessage === right.requiredParamsMessage
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
        const canonicalMetadata = getPrometheusPlannedMutatingMethodMetadata(method);
        const canonicalPreflight = getPrometheusPlannedMutatingMethodPreflight(method);
        const metadata = resolvePlannedMethodMetadata(method);
        const validatedMetadata = isPrometheusPlannedMethodMetadataShape(metadata)
          ? metadata
          : undefined;
        const effectiveMetadata =
          canonicalMetadata && validatedMetadata
            ? isPrometheusPlannedMethodMetadataEquivalent(validatedMetadata, canonicalMetadata)
              ? validatedMetadata
              : canonicalMetadata
            : (validatedMetadata ?? canonicalMetadata);
        const resolvedPreflight = resolvePlannedMethodPreflight(method);
        const validatedPreflight = isPrometheusPlannedMethodPreflightShape(resolvedPreflight)
          ? resolvedPreflight
          : undefined;
        const effectivePreflight =
          canonicalPreflight && validatedPreflight
            ? isPrometheusPlannedMethodPreflightEquivalent(validatedPreflight, canonicalPreflight)
              ? validatedPreflight
              : canonicalPreflight
            : (validatedPreflight ?? canonicalPreflight);
        if (!effectiveMetadata) {
          throw new Error(`Missing planned mutating method metadata for "${method}"`);
        }
        const preflight =
          effectivePreflight ??
          buildPrometheusPlannedMutatingMethodPreflight({
            method,
            metadata: effectiveMetadata,
          });
        return {
          method,
          ...effectiveMetadata,
          preflight,
        };
      }),
      plannedMutatingPreviewActions: plannedMutatingPreviewActions.map((action) => {
        const canonicalMetadata = getPrometheusPlannedMutatingPreviewActionMetadata(action);
        const canonicalPreflight = getPrometheusPlannedMutatingPreviewActionPreflight(action);
        const metadata = resolvePlannedActionMetadata(action);
        const validatedMetadata = isPrometheusPlannedActionMetadataShape(metadata)
          ? metadata
          : undefined;
        const effectiveMetadata =
          canonicalMetadata && validatedMetadata
            ? isPrometheusPlannedActionMetadataEquivalent(validatedMetadata, canonicalMetadata)
              ? validatedMetadata
              : canonicalMetadata
            : (validatedMetadata ?? canonicalMetadata);
        const resolvedPreflight = resolvePlannedActionPreflight(action);
        const validatedPreflight = isPrometheusPlannedActionPreflightShape(resolvedPreflight)
          ? resolvedPreflight
          : undefined;
        const effectivePreflight =
          canonicalPreflight && validatedPreflight
            ? isPrometheusPlannedActionPreflightEquivalent(validatedPreflight, canonicalPreflight)
              ? validatedPreflight
              : canonicalPreflight
            : (validatedPreflight ?? canonicalPreflight);
        if (!effectiveMetadata) {
          throw new Error(`Missing planned mutating action metadata for "${action}"`);
        }
        const preflight =
          effectivePreflight ??
          buildPrometheusPlannedMutatingPreviewActionPreflight({
            action,
            metadata: effectiveMetadata,
          });
        return {
          action,
          ...effectiveMetadata,
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
