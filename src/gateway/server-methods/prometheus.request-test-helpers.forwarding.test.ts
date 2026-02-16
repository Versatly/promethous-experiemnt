import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { createPrometheusHandlers } from "./prometheus.js";
import {
  runPrometheusNodeRequest,
  runPrometheusOperatorRequest,
  runPrometheusReadRequest,
  runPrometheusWriteRequest,
} from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prometheus request test helpers (forwarding and defaults)", () => {
  it("uses write-scope operator defaults for write helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "request-helper-write-defaults",
        method: "prometheus.status",
        params: {},
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.any(Object),
      }),
      undefined,
    );
  });

  it("uses read-scope operator defaults for read helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "request-helper-read-defaults",
        method: "prometheus.control.preview",
        params: {
          action: "autarch.gap-detection",
        },
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("operator.write"),
      }),
    );
  });

  it("uses node-role defaults for node helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusNodeRequest({
      request: {
        id: "request-helper-node-defaults",
        method: "prometheus.status",
        params: {},
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: node"),
      }),
    );
  });

  it("forwards default node role/scopes into extra handlers", async () => {
    const nodeEventHandler = vi.fn(async ({ client, respond }) => {
      expect(client).toEqual({
        connect: {
          role: "node",
          scopes: ["operator.read"],
        },
      });
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusNodeRequest({
      request: {
        id: "request-helper-forwards-node-client",
        method: "node.event",
        params: {},
      },
      respond,
      extraHandlers: {
        "node.event": nodeEventHandler,
      },
    });

    expect(nodeEventHandler).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("applies explicit scopes for operator helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "request-helper-operator-scopes",
        method: "prometheus.status",
        params: {},
      },
      respond,
      scopes: [],
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("operator.read"),
      }),
    );
  });

  it("forwards authOverrides through helper requests", async () => {
    const resolvePrometheusMethodMetadata = vi.fn(() => ({
      access: "read",
      mutatesState: false,
    }));
    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "request-helper-auth-overrides",
        method: "prometheus.status",
        params: {},
      },
      respond,
      authOverrides: {
        resolvePrometheusMethodMetadata,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.any(Object),
      }),
      undefined,
    );
    expect(resolvePrometheusMethodMetadata).toHaveBeenCalledTimes(1);
    expect(resolvePrometheusMethodMetadata).toHaveBeenCalledWith("prometheus.status");
  });

  it("forwards extraHandlers through helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "request-helper-extra-handlers",
        method: "prometheus.control.catalog",
        params: {},
      },
      respond,
      extraHandlers: createPrometheusHandlers({
        buildControlCatalogSnapshot: () => {
          throw new Error("request helper extraHandlers forwarding works");
        },
      }),
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: expect.stringContaining("request helper extraHandlers forwarding works"),
      }),
    );
  });

  it("forwards default write client role/scopes into extra handlers", async () => {
    const statusHandler = vi.fn(async ({ client, respond }) => {
      expect(client).toEqual({
        connect: {
          role: "operator",
          scopes: ["operator.write"],
        },
      });
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusWriteRequest({
      request: {
        id: "request-helper-forwards-write-client",
        method: "prometheus.status",
        params: {},
      },
      respond,
      extraHandlers: {
        "prometheus.status": statusHandler,
      },
    });

    expect(statusHandler).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("forwards default read client scopes into extra handlers", async () => {
    const statusHandler = vi.fn(async ({ client, respond }) => {
      expect(client).toEqual({
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      });
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusReadRequest({
      request: {
        id: "request-helper-forwards-read-client",
        method: "prometheus.status",
        params: {},
      },
      respond,
      extraHandlers: {
        "prometheus.status": statusHandler,
      },
    });

    expect(statusHandler).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("forwards explicit context and custom scopes into extra handlers", async () => {
    const context = { marker: "request-helper-context" } as GatewayRequestContext;
    const statusHandler = vi.fn(async ({ client, context: receivedContext, respond }) => {
      expect(client).toEqual({
        connect: {
          role: "operator",
          scopes: ["operator.read", "operator.write"],
        },
      });
      expect(receivedContext).toBe(context);
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusOperatorRequest({
      request: {
        id: "request-helper-forwards-context",
        method: "prometheus.status",
        params: {},
      },
      respond,
      context,
      scopes: ["operator.read", "operator.write"],
      extraHandlers: {
        "prometheus.status": statusHandler,
      },
    });

    expect(statusHandler).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("forwards custom scopes and context for node helper requests", async () => {
    const context = { marker: "node-helper-context" } as GatewayRequestContext;
    const nodeEventHandler = vi.fn(async ({ client, context: receivedContext, respond }) => {
      expect(client).toEqual({
        connect: {
          role: "node",
          scopes: ["operator.write"],
        },
      });
      expect(receivedContext).toBe(context);
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusNodeRequest({
      request: {
        id: "request-helper-node-custom-scopes",
        method: "node.event",
        params: {},
      },
      respond,
      context,
      scopes: ["operator.write"],
      extraHandlers: {
        "node.event": nodeEventHandler,
      },
    });

    expect(nodeEventHandler).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });
});
