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

type PrometheusScopedRequestArgs = PrometheusOperatorRequestArgs & {
  role?: string;
};

function resolveRequestMethod(request: PrometheusOperatorRequestArgs["request"]): string {
  const method = request.method;
  if (typeof method !== "string" || method.trim().length === 0) {
    throw new Error("PROMETHEUS request helper requires a non-empty request.method");
  }
  return method;
}

async function runPrometheusScopedRequest(args: PrometheusScopedRequestArgs) {
  const method = resolveRequestMethod(args.request);
  await handleGatewayRequest({
    req: {
      type: "req",
      ...args.request,
      method,
    },
    client: {
      connect: {
        role: args.role ?? "operator",
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

export async function runPrometheusOperatorRequest(args: PrometheusOperatorRequestArgs) {
  await runPrometheusScopedRequest(args);
}

export async function runPrometheusWriteRequest(
  args: Omit<PrometheusOperatorRequestArgs, "scopes">,
) {
  await runPrometheusOperatorRequest(args);
}

export async function runPrometheusReadRequest(
  args: Omit<PrometheusOperatorRequestArgs, "scopes">,
) {
  await runPrometheusOperatorRequest({
    ...args,
    scopes: ["operator.read"],
  });
}

export async function runPrometheusNodeRequest(
  args: Omit<PrometheusOperatorRequestArgs, "scopes"> & { scopes?: string[] },
) {
  await runPrometheusScopedRequest({
    ...args,
    role: "node",
    scopes: args.scopes ?? ["operator.read"],
  });
}

export async function runPrometheusRoleRequest(
  args: Omit<PrometheusOperatorRequestArgs, "scopes"> & { role: string; scopes?: string[] },
) {
  await runPrometheusScopedRequest({
    ...args,
    role: args.role,
    scopes: args.scopes ?? ["operator.read"],
  });
}
