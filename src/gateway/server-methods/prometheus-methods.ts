import {
  formatPrometheusRequiredParamsMessage,
  formatPlannedMutatingMethodDisabledMessage,
  formatPlannedMutatingMethodNotImplementedMessage,
} from "./prometheus.preflight-guards.js";

export const PROMETHEUS_GATEWAY_READ_METHODS = [
  "prometheus.status",
  "prometheus.control.catalog",
  "prometheus.trajectory",
  "prometheus.goals",
  "prometheus.recursion",
  "prometheus.autarch",
  "prometheus.monolith",
] as const;

// Reserved for future state-mutating/control APIs.
// Keeping this explicit prevents accidental method-scope drift when writes are introduced.
export const PROMETHEUS_GATEWAY_WRITE_METHODS = ["prometheus.control.preview"] as const;

export const PROMETHEUS_GATEWAY_METHODS = [
  ...PROMETHEUS_GATEWAY_READ_METHODS,
  ...PROMETHEUS_GATEWAY_WRITE_METHODS,
] as const;

export type PrometheusGatewayReadMethod = (typeof PROMETHEUS_GATEWAY_READ_METHODS)[number];
export type PrometheusGatewayWriteMethod = (typeof PROMETHEUS_GATEWAY_WRITE_METHODS)[number];
export type PrometheusGatewayMethod = (typeof PROMETHEUS_GATEWAY_METHODS)[number];

export type PrometheusGatewayMethodAccess = "read" | "write";

export type PrometheusGatewayMethodMetadata = {
  access: PrometheusGatewayMethodAccess;
  mutatesState: boolean;
};

export const PROMETHEUS_MUTATING_CONTROLS_ENV = "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS";

export type PrometheusPlannedMutatingMethodMetadata = {
  access: "write";
  mutatesState: true;
  enabled: false;
  enableEnvVar: typeof PROMETHEUS_MUTATING_CONTROLS_ENV;
  requiredParams: readonly string[];
  reason: string;
};

export type PrometheusPlannedMutatingMethodPreflight = {
  disabledMessage: string;
  notImplementedMessage: string;
  requiredParamsMessage: string;
};

export const PROMETHEUS_GATEWAY_METHOD_METADATA: Record<
  PrometheusGatewayMethod,
  PrometheusGatewayMethodMetadata
> = {
  "prometheus.status": {
    access: "read",
    mutatesState: false,
  },
  "prometheus.control.catalog": {
    access: "read",
    mutatesState: false,
  },
  "prometheus.trajectory": {
    access: "read",
    mutatesState: false,
  },
  "prometheus.goals": {
    access: "read",
    mutatesState: false,
  },
  "prometheus.recursion": {
    access: "read",
    mutatesState: false,
  },
  "prometheus.autarch": {
    access: "read",
    mutatesState: false,
  },
  "prometheus.monolith": {
    access: "read",
    mutatesState: false,
  },
  "prometheus.control.preview": {
    access: "write",
    mutatesState: false,
  },
};

export const PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA = {
  "prometheus.control.execute": {
    access: "write",
    mutatesState: true,
    enabled: false,
    enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
    requiredParams: ["action"],
    reason: "Reserved for future state-mutating control command execution.",
  },
  "prometheus.control.autarch.commit": {
    access: "write",
    mutatesState: true,
    enabled: false,
    enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
    requiredParams: ["goalId"],
    reason: "Reserved for AUTARCH capability-gap commit flow.",
  },
  "prometheus.control.recursion.commit": {
    access: "write",
    mutatesState: true,
    enabled: false,
    enableEnvVar: PROMETHEUS_MUTATING_CONTROLS_ENV,
    requiredParams: ["proposal", "baseline", "candidate"],
    reason: "Reserved for recursion cycle commit flow.",
  },
} as const satisfies Record<string, PrometheusPlannedMutatingMethodMetadata>;

export function listPrometheusMutatingMethods(
  methodMetadata: Record<
    string,
    PrometheusGatewayMethodMetadata
  > = PROMETHEUS_GATEWAY_METHOD_METADATA,
): string[] {
  return Object.entries(methodMetadata)
    .filter(([, metadata]) => metadata.mutatesState)
    .map(([method]) => method)
    .toSorted();
}

export function listPrometheusPlannedMutatingMethods(
  methodMetadata: Record<
    string,
    PrometheusPlannedMutatingMethodMetadata
  > = PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
): string[] {
  return Object.entries(methodMetadata)
    .filter(([, metadata]) => !metadata.enabled && metadata.mutatesState)
    .map(([method]) => method)
    .toSorted();
}

export function getPrometheusPlannedMutatingMethodMetadata(
  method: string,
): PrometheusPlannedMutatingMethodMetadata | undefined {
  if (!(method in PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA)) {
    return undefined;
  }
  return PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA[method];
}

export function buildPrometheusPlannedMutatingMethodPreflight(args: {
  method: string;
  metadata: PrometheusPlannedMutatingMethodMetadata;
}): PrometheusPlannedMutatingMethodPreflight {
  const { method, metadata } = args;
  return {
    disabledMessage: formatPlannedMutatingMethodDisabledMessage(method, metadata.enableEnvVar),
    notImplementedMessage: formatPlannedMutatingMethodNotImplementedMessage(method),
    requiredParamsMessage: formatPrometheusRequiredParamsMessage({
      kind: "method",
      name: method,
      requiredParams: metadata.requiredParams,
    }),
  };
}

export function arePrometheusMutatingControlsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[PROMETHEUS_MUTATING_CONTROLS_ENV] === "1";
}

export function getPrometheusGatewayMethodMetadata(
  method: string,
): PrometheusGatewayMethodMetadata | undefined {
  if (!(method in PROMETHEUS_GATEWAY_METHOD_METADATA)) {
    return undefined;
  }
  return PROMETHEUS_GATEWAY_METHOD_METADATA[method as PrometheusGatewayMethod];
}

export function assertPrometheusGatewayMethodMetadataContract(args: {
  readMethods: readonly string[];
  writeMethods: readonly string[];
  methodMetadata: Record<string, PrometheusGatewayMethodMetadata>;
}): void {
  const { readMethods, writeMethods, methodMetadata } = args;
  const listedMethods = [...readMethods, ...writeMethods];
  if (new Set(listedMethods).size !== listedMethods.length) {
    throw new Error("PROMETHEUS method contract mismatch: duplicate methods detected");
  }
  const metadataMethods = Object.keys(methodMetadata);
  if (new Set(metadataMethods).size !== metadataMethods.length) {
    throw new Error("PROMETHEUS method contract mismatch: duplicate metadata entries detected");
  }
  const listedSorted = [...listedMethods].toSorted();
  const metadataSorted = [...metadataMethods].toSorted();
  if (
    listedSorted.length !== metadataSorted.length ||
    listedSorted.some((method, index) => metadataSorted[index] !== method)
  ) {
    throw new Error("PROMETHEUS method contract mismatch: methods and metadata keys diverged");
  }
  for (const method of readMethods) {
    if (methodMetadata[method]?.access !== "read") {
      throw new Error(`PROMETHEUS method contract mismatch: ${method} must be read access`);
    }
  }
  for (const method of writeMethods) {
    if (methodMetadata[method]?.access !== "write") {
      throw new Error(`PROMETHEUS method contract mismatch: ${method} must be write access`);
    }
  }
}

export function assertPrometheusPlannedMutatingMethodContract(args: {
  activeMethods: readonly string[];
  plannedMutatingMethodMetadata: Record<string, PrometheusPlannedMutatingMethodMetadata>;
}): void {
  const { activeMethods, plannedMutatingMethodMetadata } = args;
  const plannedMethods = Object.keys(plannedMutatingMethodMetadata);
  if (new Set(plannedMethods).size !== plannedMethods.length) {
    throw new Error(
      "PROMETHEUS planned method contract mismatch: duplicate planned methods detected",
    );
  }
  for (const method of plannedMethods) {
    if (activeMethods.includes(method)) {
      throw new Error(
        `PROMETHEUS planned method contract mismatch: ${method} overlaps active methods`,
      );
    }
    const metadata = plannedMutatingMethodMetadata[method];
    if (metadata.access !== "write" || metadata.enabled || !metadata.mutatesState) {
      throw new Error(
        `PROMETHEUS planned method contract mismatch: ${method} must be disabled mutating write`,
      );
    }
    if (metadata.enableEnvVar !== PROMETHEUS_MUTATING_CONTROLS_ENV) {
      throw new Error(
        `PROMETHEUS planned method contract mismatch: ${method} has invalid env guard`,
      );
    }
    const params = [...metadata.requiredParams];
    if (params.some((param) => param.length === 0) || new Set(params).size !== params.length) {
      throw new Error(
        `PROMETHEUS planned method contract mismatch: ${method} has invalid required params`,
      );
    }
  }
}

assertPrometheusGatewayMethodMetadataContract({
  readMethods: PROMETHEUS_GATEWAY_READ_METHODS,
  writeMethods: PROMETHEUS_GATEWAY_WRITE_METHODS,
  methodMetadata: PROMETHEUS_GATEWAY_METHOD_METADATA,
});

assertPrometheusPlannedMutatingMethodContract({
  activeMethods: PROMETHEUS_GATEWAY_METHODS,
  plannedMutatingMethodMetadata: PROMETHEUS_PLANNED_MUTATING_METHOD_METADATA,
});
