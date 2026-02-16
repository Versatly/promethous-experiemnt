import {
  listPrometheusMutatingMethods,
  listPrometheusPlannedMutatingMethods,
  arePrometheusMutatingControlsEnabled,
  getPrometheusPlannedMutatingMethodMetadata,
  getPrometheusPlannedMutatingMethodPreflight,
  PROMETHEUS_GATEWAY_METHOD_METADATA,
  PROMETHEUS_MUTATING_CONTROLS_ENV,
} from "./prometheus-methods.js";
import {
  listPrometheusMutatingPreviewActions,
  listPrometheusPlannedMutatingPreviewActions,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  getPrometheusPlannedMutatingPreviewActionPreflight,
  PROMETHEUS_CONTROL_PREVIEW_ACTIONS,
  PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
} from "./prometheus.control-preview.js";

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

export function buildPrometheusControlCatalogSnapshot(args?: {
  env?: NodeJS.ProcessEnv;
  now?: number;
}): PrometheusControlCatalogSnapshot {
  const env = args?.env ?? process.env;
  const now = args?.now ?? Date.now();

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
        const metadata = getPrometheusPlannedMutatingMethodMetadata(method);
        if (!metadata) {
          throw new Error(`Missing planned mutating method metadata for "${method}"`);
        }
        const preflight = getPrometheusPlannedMutatingMethodPreflight(method);
        if (!preflight) {
          throw new Error(`Missing planned mutating method preflight for "${method}"`);
        }
        return {
          method,
          ...metadata,
          preflight,
        };
      }),
      plannedMutatingPreviewActions: plannedMutatingPreviewActions.map((action) => {
        const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(action);
        if (!metadata) {
          throw new Error(`Missing planned mutating action metadata for "${action}"`);
        }
        const preflight = getPrometheusPlannedMutatingPreviewActionPreflight(action);
        if (!preflight) {
          throw new Error(`Missing planned mutating action preflight for "${action}"`);
        }
        return {
          action,
          ...metadata,
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
