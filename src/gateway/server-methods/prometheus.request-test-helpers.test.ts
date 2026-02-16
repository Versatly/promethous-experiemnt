import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runPrometheusNodeRequest,
  runPrometheusOperatorRequest,
  runPrometheusReadRequest,
  runPrometheusRoleRequest,
  runPrometheusWriteRequest,
} from "./prometheus.request-test-helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prometheus request test helpers", () => {
  it("uses custom-role defaults for role helper requests", async () => {
    const respond = vi.fn();
    await runPrometheusRoleRequest({
      role: "auditor",
      request: {
        id: "request-helper-custom-role-defaults",
        method: "prometheus.status",
        params: {},
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: auditor"),
      }),
    );
  });

  it("handles non-string custom role values at runtime with canonical denial", async () => {
    const respond = vi.fn();
    await runPrometheusRoleRequest({
      role: 7 as never,
      request: {
        id: "request-helper-custom-role-non-string-runtime",
        method: "prometheus.status",
        params: {},
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: 7"),
      }),
    );
  });

  it("does not invoke extra handlers for custom roles denied before dispatch", async () => {
    const statusHandler = vi.fn(async ({ respond }) => {
      respond(true, { ok: true }, undefined);
    });
    const respond = vi.fn();
    await runPrometheusRoleRequest({
      role: "auditor",
      request: {
        id: "request-helper-custom-role-short-circuit-before-handler",
        method: "prometheus.status",
        params: {},
      },
      respond,
      extraHandlers: {
        "prometheus.status": statusHandler,
      },
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("unauthorized role: auditor"),
      }),
    );
    expect(statusHandler).not.toHaveBeenCalled();
  });

  it("throws descriptive error when operator helper request method is blank", async () => {
    await expect(
      runPrometheusOperatorRequest({
        request: {
          id: "request-helper-invalid-blank-method-operator",
          method: " ",
          params: {},
        },
        respond: vi.fn(),
      }),
    ).rejects.toThrow("PROMETHEUS request helper requires a non-empty request.method");
  });

  it("throws descriptive error when write helper request method is blank", async () => {
    await expect(
      runPrometheusWriteRequest({
        request: {
          id: "request-helper-invalid-blank-method-write",
          method: "",
          params: {},
        },
        respond: vi.fn(),
      }),
    ).rejects.toThrow("PROMETHEUS request helper requires a non-empty request.method");
  });

  it("throws descriptive error when read helper request method is blank", async () => {
    await expect(
      runPrometheusReadRequest({
        request: {
          id: "request-helper-invalid-blank-method-read",
          method: " ",
          params: {},
        },
        respond: vi.fn(),
      }),
    ).rejects.toThrow("PROMETHEUS request helper requires a non-empty request.method");
  });

  it("throws descriptive error when node helper request method is blank", async () => {
    await expect(
      runPrometheusNodeRequest({
        request: {
          id: "request-helper-invalid-blank-method-node",
          method: "",
          params: {},
        },
        respond: vi.fn(),
      }),
    ).rejects.toThrow("PROMETHEUS request helper requires a non-empty request.method");
  });

  it("throws descriptive error when custom-role helper request method is blank", async () => {
    await expect(
      runPrometheusRoleRequest({
        role: "auditor",
        request: {
          id: "request-helper-invalid-blank-method-custom-role",
          method: "",
          params: {},
        },
        respond: vi.fn(),
      }),
    ).rejects.toThrow("PROMETHEUS request helper requires a non-empty request.method");
  });

  it("throws descriptive error when helper request method is non-string at runtime", async () => {
    await expect(
      runPrometheusOperatorRequest({
        request: {
          id: "request-helper-invalid-non-string-method",
          method: 123 as never,
          params: {},
        },
        respond: vi.fn(),
      }),
    ).rejects.toThrow("PROMETHEUS request helper requires a non-empty request.method");
  });
});
