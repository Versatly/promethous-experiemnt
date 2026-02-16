import type { GatewayRequestContext, GatewayRequestHandlers, RespondFn } from "./types.js";
import { prometheusHandlers } from "./prometheus.js";

type PrometheusHandlerRequestArgs = {
  handlers?: GatewayRequestHandlers;
  params?: Record<string, unknown>;
  respond: RespondFn;
  requestId: string;
  context?: GatewayRequestContext;
};

function resolvePrometheusHandlers(handlers?: GatewayRequestHandlers): GatewayRequestHandlers {
  return handlers ?? prometheusHandlers;
}

export async function runPrometheusControlCatalogHandler(args: PrometheusHandlerRequestArgs) {
  await resolvePrometheusHandlers(args.handlers)["prometheus.control.catalog"]({
    req: {
      type: "req",
      id: args.requestId,
      method: "prometheus.control.catalog",
    },
    params: args.params ?? {},
    client: null,
    isWebchatConnect: () => false,
    respond: args.respond,
    context: args.context ?? ({} as GatewayRequestContext),
  });
}

export async function runPrometheusControlPreviewHandler(args: PrometheusHandlerRequestArgs) {
  await resolvePrometheusHandlers(args.handlers)["prometheus.control.preview"]({
    req: {
      type: "req",
      id: args.requestId,
      method: "prometheus.control.preview",
    },
    params: args.params ?? {},
    client: null,
    isWebchatConnect: () => false,
    respond: args.respond,
    context: args.context ?? ({} as GatewayRequestContext),
  });
}
