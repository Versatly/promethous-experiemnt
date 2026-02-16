import type { GatewayRequestHandlers, GatewayRequestOptions } from "./server-methods/types.js";
import { ErrorCodes, errorShape } from "./protocol/index.js";
import { agentHandlers } from "./server-methods/agent.js";
import { agentsHandlers } from "./server-methods/agents.js";
import { browserHandlers } from "./server-methods/browser.js";
import { channelsHandlers } from "./server-methods/channels.js";
import { chatHandlers } from "./server-methods/chat.js";
import { configHandlers } from "./server-methods/config.js";
import { connectHandlers } from "./server-methods/connect.js";
import { cronHandlers } from "./server-methods/cron.js";
import { deviceHandlers } from "./server-methods/devices.js";
import { execApprovalsHandlers } from "./server-methods/exec-approvals.js";
import { healthHandlers } from "./server-methods/health.js";
import { logsHandlers } from "./server-methods/logs.js";
import { modelsHandlers } from "./server-methods/models.js";
import { nodeHandlers } from "./server-methods/nodes.js";
import {
  arePrometheusMutatingControlsEnabled,
  buildPrometheusPlannedMutatingMethodPreflight,
  getPrometheusGatewayMethodMetadata,
  getPrometheusPlannedMutatingMethodMetadata,
  getPrometheusPlannedMutatingMethodPreflight,
  type PrometheusPlannedMutatingMethodPreflight,
  type PrometheusGatewayMethodMetadata,
  PROMETHEUS_GATEWAY_METHOD_METADATA,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./server-methods/prometheus-methods.js";
import { prometheusHandlers } from "./server-methods/prometheus.js";
import { hasPrometheusInvalidRequiredParams } from "./server-methods/prometheus.preflight-guards.js";
import { sendHandlers } from "./server-methods/send.js";
import { sessionsHandlers } from "./server-methods/sessions.js";
import { skillsHandlers } from "./server-methods/skills.js";
import { systemHandlers } from "./server-methods/system.js";
import { talkHandlers } from "./server-methods/talk.js";
import { ttsHandlers } from "./server-methods/tts.js";
import { updateHandlers } from "./server-methods/update.js";
import { usageHandlers } from "./server-methods/usage.js";
import { voicewakeHandlers } from "./server-methods/voicewake.js";
import { webHandlers } from "./server-methods/web.js";
import { wizardHandlers } from "./server-methods/wizard.js";
import { formatForLog } from "./ws-log.js";

const ADMIN_SCOPE = "operator.admin";
const READ_SCOPE = "operator.read";
const WRITE_SCOPE = "operator.write";
const APPROVALS_SCOPE = "operator.approvals";
const PAIRING_SCOPE = "operator.pairing";

const APPROVAL_METHODS = new Set([
  "exec.approval.request",
  "exec.approval.waitDecision",
  "exec.approval.resolve",
]);
const NODE_ROLE_METHODS = new Set(["node.invoke.result", "node.event", "skills.bins"]);
const PAIRING_METHODS = new Set([
  "node.pair.request",
  "node.pair.list",
  "node.pair.approve",
  "node.pair.reject",
  "node.pair.verify",
  "device.pair.list",
  "device.pair.approve",
  "device.pair.reject",
  "device.token.rotate",
  "device.token.revoke",
  "node.rename",
]);
const ADMIN_METHOD_PREFIXES = ["exec.approvals."];
const PROMETHEUS_READ_METHODS = Object.entries(PROMETHEUS_GATEWAY_METHOD_METADATA)
  .filter(([, metadata]) => metadata.access === "read")
  .map(([method]) => method);
const PROMETHEUS_WRITE_METHODS = Object.entries(PROMETHEUS_GATEWAY_METHOD_METADATA)
  .filter(([, metadata]) => metadata.access === "write")
  .map(([method]) => method);
const READ_METHODS = new Set([
  "health",
  "logs.tail",
  "channels.status",
  "status",
  "usage.status",
  "usage.cost",
  "tts.status",
  "tts.providers",
  "models.list",
  "agents.list",
  "agent.identity.get",
  "skills.status",
  "voicewake.get",
  "sessions.list",
  "sessions.preview",
  "cron.list",
  "cron.status",
  "cron.runs",
  "system-presence",
  "last-heartbeat",
  "node.list",
  "node.describe",
  "chat.history",
  "config.get",
  "talk.config",
  ...PROMETHEUS_READ_METHODS,
]);
const WRITE_METHODS = new Set([
  "send",
  "agent",
  "agent.wait",
  "wake",
  "talk.mode",
  "tts.enable",
  "tts.disable",
  "tts.convert",
  "tts.setProvider",
  "voicewake.set",
  "node.invoke",
  "chat.send",
  "chat.abort",
  "browser.request",
  ...PROMETHEUS_WRITE_METHODS,
]);

type GatewayAuthorizationOverrides = {
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
    typeof candidate.reason === "string"
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
  if (!effectiveMethodMetadata?.mutatesState) {
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

function authorizeGatewayMethod(
  method: string,
  client: GatewayRequestOptions["client"],
  overrides?: GatewayAuthorizationOverrides,
) {
  if (!client?.connect) {
    return null;
  }
  const role = client.connect.role ?? "operator";
  const scopes = client.connect.scopes ?? [];
  if (NODE_ROLE_METHODS.has(method)) {
    if (role === "node") {
      return null;
    }
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (role === "node") {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (role !== "operator") {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  const mutatingControlGuardError = getPrometheusMutatingControlGuardError({
    method,
    resolveMethodMetadata: overrides?.resolvePrometheusMethodMetadata,
  });
  if (mutatingControlGuardError) {
    return mutatingControlGuardError;
  }
  const plannedMutatingMethodGuardError = getPrometheusPlannedMutatingMethodGuardError({
    method,
    resolvePlannedMethodPreflight: overrides?.resolvePrometheusPlannedMethodPreflight,
    resolvePlannedMethodMetadata: overrides?.resolvePrometheusPlannedMethodMetadata,
  });
  if (plannedMutatingMethodGuardError) {
    return plannedMutatingMethodGuardError;
  }
  if (scopes.includes(ADMIN_SCOPE)) {
    return null;
  }
  if (APPROVAL_METHODS.has(method) && !scopes.includes(APPROVALS_SCOPE)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.approvals");
  }
  if (PAIRING_METHODS.has(method) && !scopes.includes(PAIRING_SCOPE)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.pairing");
  }
  if (READ_METHODS.has(method) && !(scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE))) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.read");
  }
  if (WRITE_METHODS.has(method) && !scopes.includes(WRITE_SCOPE)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.write");
  }
  if (APPROVAL_METHODS.has(method)) {
    return null;
  }
  if (PAIRING_METHODS.has(method)) {
    return null;
  }
  if (READ_METHODS.has(method)) {
    return null;
  }
  if (WRITE_METHODS.has(method)) {
    return null;
  }
  if (ADMIN_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix))) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
  }
  if (
    method.startsWith("config.") ||
    method.startsWith("wizard.") ||
    method.startsWith("update.") ||
    method === "channels.logout" ||
    method === "agents.create" ||
    method === "agents.update" ||
    method === "agents.delete" ||
    method === "skills.install" ||
    method === "skills.update" ||
    method === "cron.add" ||
    method === "cron.update" ||
    method === "cron.remove" ||
    method === "cron.run" ||
    method === "sessions.patch" ||
    method === "sessions.reset" ||
    method === "sessions.delete" ||
    method === "sessions.compact"
  ) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
  }
  return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
}

export const coreGatewayHandlers: GatewayRequestHandlers = {
  ...connectHandlers,
  ...logsHandlers,
  ...voicewakeHandlers,
  ...healthHandlers,
  ...channelsHandlers,
  ...chatHandlers,
  ...cronHandlers,
  ...deviceHandlers,
  ...execApprovalsHandlers,
  ...webHandlers,
  ...modelsHandlers,
  ...configHandlers,
  ...wizardHandlers,
  ...talkHandlers,
  ...ttsHandlers,
  ...skillsHandlers,
  ...sessionsHandlers,
  ...systemHandlers,
  ...updateHandlers,
  ...nodeHandlers,
  ...sendHandlers,
  ...usageHandlers,
  ...agentHandlers,
  ...agentsHandlers,
  ...browserHandlers,
  ...prometheusHandlers,
};

export async function handleGatewayRequest(
  opts: GatewayRequestOptions & {
    extraHandlers?: GatewayRequestHandlers;
    authOverrides?: GatewayAuthorizationOverrides;
  },
): Promise<void> {
  const { req, respond, client, isWebchatConnect, context } = opts;
  let authError;
  try {
    authError = authorizeGatewayMethod(req.method, client, opts.authOverrides);
  } catch (error) {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)));
    return;
  }
  if (authError) {
    respond(false, undefined, authError);
    return;
  }
  const handler = opts.extraHandlers?.[req.method] ?? coreGatewayHandlers[req.method];
  if (!handler) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${req.method}`),
    );
    return;
  }
  await handler({
    req,
    params: (req.params ?? {}) as Record<string, unknown>,
    client,
    isWebchatConnect,
    respond,
    context,
  });
}
