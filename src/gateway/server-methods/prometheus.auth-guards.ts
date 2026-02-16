import { ErrorCodes, errorShape } from "../protocol/index.js";
import {
  arePrometheusMutatingControlsEnabled,
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusGatewayMethodMetadata,
  getPrometheusPlannedMutatingMethodMetadata,
  getPrometheusPlannedMutatingMethodPreflight,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
  type PrometheusGatewayMethodMetadata,
  type PrometheusPlannedMutatingMethodPreflight,
} from "./prometheus-methods.js";
import {
  hasPrometheusInvalidRequiredParams,
  hasPrometheusInvalidReason,
} from "./prometheus.preflight-guards.js";

export type GatewayAuthorizationOverrides = {
  resolvePrometheusMethodMetadata?: (method: string) => PrometheusGatewayMethodMetadata | undefined;
  resolvePrometheusPlannedMethodPreflight?: (
    method: string,
  ) => PrometheusPlannedMutatingMethodPreflight | undefined;
  resolvePrometheusPlannedMethodMetadata?: (
    method: string,
  ) => ReturnType<typeof getPrometheusPlannedMutatingMethodMetadata>;
};

function isPrometheusGatewayMethodMetadataShape(
  value: unknown,
): value is PrometheusGatewayMethodMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<PrometheusGatewayMethodMetadata>;
  return (
    (candidate.access === "read" || candidate.access === "write") &&
    typeof candidate.mutatesState === "boolean"
  );
}

function isPrometheusPlannedMutatingMethodMetadataShape(
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
    Array.isArray(candidate.requiredParams) &&
    !hasPrometheusInvalidRequiredParams(candidate.requiredParams) &&
    typeof candidate.reason === "string" &&
    !hasPrometheusInvalidReason(candidate.reason)
  );
}

function isPrometheusPlannedMutatingMethodPreflightShape(
  value: unknown,
): value is PrometheusPlannedMutatingMethodPreflight {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<PrometheusPlannedMutatingMethodPreflight>;
  return (
    typeof candidate.disabledMessage === "string" &&
    typeof candidate.notImplementedMessage === "string" &&
    typeof candidate.requiredParamsMessage === "string"
  );
}

function isPrometheusPlannedMutatingMethodPreflightEquivalent(
  left: PrometheusPlannedMutatingMethodPreflight,
  right: PrometheusPlannedMutatingMethodPreflight,
): boolean {
  return (
    left.disabledMessage === right.disabledMessage &&
    left.notImplementedMessage === right.notImplementedMessage &&
    left.requiredParamsMessage === right.requiredParamsMessage
  );
}

function mutatingControlsDisabledError() {
  return errorShape(
    ErrorCodes.UNAVAILABLE,
    `prometheus mutating controls are disabled (set ${PROMETHEUS_MUTATING_CONTROLS_ENV}=1 to enable)`,
  );
}

export function getPrometheusMutatingControlGuardError(args: {
  method: string;
  env?: NodeJS.ProcessEnv;
  resolveMethodMetadata?: (method: string) => PrometheusGatewayMethodMetadata | undefined;
}) {
  const {
    method,
    env = process.env,
    resolveMethodMetadata = getPrometheusGatewayMethodMetadata,
  } = args;
  const canonicalMethodMetadata = getPrometheusGatewayMethodMetadata(method);
  if (!canonicalMethodMetadata) {
    return undefined;
  }
  const resolvedMethodMetadata = resolveMethodMetadata(method);
  const methodMetadata = isPrometheusGatewayMethodMetadataShape(resolvedMethodMetadata)
    ? resolvedMethodMetadata
    : undefined;
  const effectiveMethodMetadata = methodMetadata
    ? methodMetadata.access === canonicalMethodMetadata.access &&
      methodMetadata.mutatesState === canonicalMethodMetadata.mutatesState
      ? methodMetadata
      : canonicalMethodMetadata
    : canonicalMethodMetadata;
  if (!effectiveMethodMetadata.mutatesState) {
    return undefined;
  }
  return arePrometheusMutatingControlsEnabled(env) ? undefined : mutatingControlsDisabledError();
}

export function getPrometheusPlannedMutatingMethodGuardError(args: {
  method: string;
  env?: NodeJS.ProcessEnv;
  resolvePlannedMethodPreflight?: (
    method: string,
  ) => PrometheusPlannedMutatingMethodPreflight | undefined;
  resolvePlannedMethodMetadata?: (
    method: string,
  ) => ReturnType<typeof getPrometheusPlannedMutatingMethodMetadata>;
}) {
  const {
    method,
    env = process.env,
    resolvePlannedMethodPreflight = getPrometheusPlannedMutatingMethodPreflight,
    resolvePlannedMethodMetadata = getPrometheusPlannedMutatingMethodMetadata,
  } = args;
  const canonicalMetadata = getPrometheusPlannedMutatingMethodMetadata(method);
  const canonicalPreflight = getPrometheusPlannedMutatingMethodPreflight(method);
  if (!canonicalMetadata && !canonicalPreflight) {
    return undefined;
  }
  const resolvedMetadata = resolvePlannedMethodMetadata(method);
  const metadata = isPrometheusPlannedMutatingMethodMetadataShape(resolvedMetadata)
    ? resolvedMetadata
    : undefined;
  const effectiveMetadata =
    canonicalMetadata && metadata
      ? metadata.access === canonicalMetadata.access &&
        metadata.mutatesState === canonicalMetadata.mutatesState &&
        metadata.enabled === canonicalMetadata.enabled &&
        metadata.enableEnvVar === canonicalMetadata.enableEnvVar &&
        metadata.reason === canonicalMetadata.reason &&
        metadata.requiredParams.length === canonicalMetadata.requiredParams.length &&
        metadata.requiredParams.every(
          (requiredParam, index) => requiredParam === canonicalMetadata.requiredParams[index],
        )
        ? metadata
        : canonicalMetadata
      : canonicalMetadata;
  const resolvedPreflight = resolvePlannedMethodPreflight(method);
  const preflight = isPrometheusPlannedMutatingMethodPreflightShape(resolvedPreflight)
    ? resolvedPreflight
    : undefined;
  const effectivePreflight =
    canonicalPreflight && preflight
      ? isPrometheusPlannedMutatingMethodPreflightEquivalent(preflight, canonicalPreflight)
        ? preflight
        : canonicalPreflight
      : (preflight ?? canonicalPreflight);
  if (!effectivePreflight && !effectiveMetadata) {
    return undefined;
  }
  const resolvedEffectivePreflight =
    effectivePreflight ??
    buildPrometheusPlannedMutatingMethodPreflight({
      method,
      metadata: effectiveMetadata,
    });
  return arePrometheusMutatingControlsEnabled(env)
    ? errorShape(ErrorCodes.UNAVAILABLE, resolvedEffectivePreflight.notImplementedMessage)
    : errorShape(ErrorCodes.UNAVAILABLE, resolvedEffectivePreflight.disabledMessage);
}
