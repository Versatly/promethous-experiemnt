export function formatPlannedMutatingMethodDisabledMessage(
  method: string,
  enableEnvVar: string,
): string {
  return `planned mutating method "${method}" is disabled (set ${enableEnvVar}=1 to enable guardrail preflight)`;
}

export function formatPlannedMutatingMethodNotImplementedMessage(method: string): string {
  return `planned mutating method "${method}" is not implemented yet`;
}

export function formatPlannedMutatingActionDisabledMessage(
  action: string,
  enableEnvVar: string,
): string {
  return `Planned mutating action "${action}" is disabled (set ${enableEnvVar}=1 to enable guardrail preflight)`;
}

export function formatPlannedMutatingActionNotImplementedMessage(action: string): string {
  return `Planned mutating action "${action}" is not implemented yet`;
}

type PrometheusControlSurfaceKind = "method" | "action";

export function resolvePrometheusMissingRequiredParams(args: {
  params: Record<string, unknown>;
  requiredParams: readonly string[];
}): string[] {
  const { params, requiredParams } = args;
  return requiredParams.filter((param) => {
    const value = params[param];
    if (typeof value === "string") {
      return value.trim().length === 0;
    }
    return value === undefined || value === null;
  });
}

export function hasPrometheusInvalidRequiredParams(requiredParams: readonly string[]): boolean {
  if (requiredParams.some((param) => param.trim().length === 0)) {
    return true;
  }
  return new Set(requiredParams).size !== requiredParams.length;
}

export function hasPrometheusInvalidReason(reason: string): boolean {
  return reason.trim().length === 0;
}

export function formatPrometheusRequiredParamsMessage(args: {
  kind: PrometheusControlSurfaceKind;
  name: string;
  requiredParams: readonly string[];
}): string {
  const { kind, name, requiredParams } = args;
  const paramWord = requiredParams.length === 1 ? "param" : "params";
  return `${kind} "${name}" requires ${paramWord}: ${requiredParams.join(", ")}`;
}

export function formatPrometheusMissingRequiredParamsMessage(args: {
  kind: PrometheusControlSurfaceKind;
  name: string;
  missingParams: readonly string[];
}): string {
  const { kind, name, missingParams } = args;
  const paramWord = missingParams.length === 1 ? "param" : "params";
  return `${kind} "${name}" is missing required ${paramWord}: ${missingParams.join(", ")}`;
}
