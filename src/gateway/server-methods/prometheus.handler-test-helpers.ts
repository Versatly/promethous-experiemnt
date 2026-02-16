import type { GatewayRequestContext, GatewayRequestHandlers, RespondFn } from "./types.js";
import { prometheusHandlers } from "./prometheus.js";

type PrometheusHandlerRequestArgs = {
  handlers?: GatewayRequestHandlers;
  params?: Record<string, unknown>;
  respond: RespondFn;
  requestId: string;
  context?: GatewayRequestContext;
};

type PrometheusGenericHandlerRequestArgs = PrometheusHandlerRequestArgs & {
  method: keyof GatewayRequestHandlers;
};

function resolvePrometheusHandlers(handlers?: GatewayRequestHandlers): GatewayRequestHandlers {
  return handlers ?? prometheusHandlers;
}

function resolvePrometheusHandler(
  handlers: GatewayRequestHandlers,
  method: keyof GatewayRequestHandlers,
) {
  const handler = handlers[method];
  if (!handler) {
    throw new Error(`Missing PROMETHEUS handler for method "${method}"`);
  }
  return handler;
}

export async function runPrometheusHandler(args: PrometheusGenericHandlerRequestArgs) {
  await resolvePrometheusHandler(
    resolvePrometheusHandlers(args.handlers),
    args.method,
  )({
    req: {
      type: "req",
      id: args.requestId,
      method: args.method,
    },
    params: args.params ?? {},
    client: null,
    isWebchatConnect: () => false,
    respond: args.respond,
    context: args.context ?? ({} as GatewayRequestContext),
  });
}

export async function runPrometheusControlCatalogHandler(args: PrometheusHandlerRequestArgs) {
  await runPrometheusHandler({
    ...args,
    method: "prometheus.control.catalog",
  });
}

export async function runPrometheusControlPreviewHandler(args: PrometheusHandlerRequestArgs) {
  await runPrometheusHandler({
    ...args,
    method: "prometheus.control.preview",
  });
}
