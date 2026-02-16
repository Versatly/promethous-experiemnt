import type { GatewayRequestContext } from "./types.js";
import { handleGatewayRequest } from "../server-methods.js";

type GatewayRequestInvocation = Parameters<typeof handleGatewayRequest>[0];

type PrometheusOperatorRequestArgs = {
  request: Omit<GatewayRequestInvocation["req"], "type">;
  respond: GatewayRequestInvocation["respond"];
  context?: GatewayRequestContext;
  scopes?: string[];
  authOverrides?: GatewayRequestInvocation["authOverrides"];
  extraHandlers?: GatewayRequestInvocation["extraHandlers"];
};

export async function runPrometheusOperatorRequest(args: PrometheusOperatorRequestArgs) {
  await handleGatewayRequest({
    req: {
      type: "req",
      ...args.request,
    },
    client: {
      connect: {
        role: "operator",
        scopes: args.scopes ?? ["operator.write"],
      },
    },
    isWebchatConnect: () => false,
    respond: args.respond,
    context: args.context ?? ({} as GatewayRequestContext),
    authOverrides: args.authOverrides,
    extraHandlers: args.extraHandlers,
  });
}

export async function runPrometheusWriteRequest(
  args: Omit<PrometheusOperatorRequestArgs, "scopes">,
) {
  await runPrometheusOperatorRequest(args);
}
