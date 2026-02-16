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
