export const PROMETHEUS_GATEWAY_READ_METHODS = [
  "prometheus.status",
  "prometheus.trajectory",
  "prometheus.goals",
  "prometheus.recursion",
  "prometheus.autarch",
  "prometheus.monolith",
] as const;

// Reserved for future state-mutating/control APIs.
// Keeping this explicit prevents accidental method-scope drift when writes are introduced.
export const PROMETHEUS_GATEWAY_WRITE_METHODS = [] as const;

export const PROMETHEUS_GATEWAY_METHODS = [
  ...PROMETHEUS_GATEWAY_READ_METHODS,
  ...PROMETHEUS_GATEWAY_WRITE_METHODS,
] as const;

export type PrometheusGatewayReadMethod = (typeof PROMETHEUS_GATEWAY_READ_METHODS)[number];
export type PrometheusGatewayWriteMethod = (typeof PROMETHEUS_GATEWAY_WRITE_METHODS)[number];
export type PrometheusGatewayMethod = (typeof PROMETHEUS_GATEWAY_METHODS)[number];
