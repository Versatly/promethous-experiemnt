import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { createFilePrometheusEventStore } from "../../prometheus/index.js";
import { ErrorCodes } from "../protocol/index.js";
import { prometheusHandlers } from "./prometheus.js";

const cleanupDirs = new Set<string>();

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  cleanupDirs.add(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  cleanupDirs.clear();
});

describe("prometheus handler error shape parity", () => {
  it("uses consistent internal error code for malformed event logs", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-errors-");
    const eventLogPath = path.join(stateDir, "prometheus", "events.jsonl");
    await fs.mkdir(path.dirname(eventLogPath), { recursive: true });
    await fs.writeFile(eventLogPath, "{", "utf8");

    const methods: Array<{
      method: keyof typeof prometheusHandlers;
      params: Record<string, unknown>;
    }> = [
      { method: "prometheus.status", params: { stateDir } },
      { method: "prometheus.trajectory", params: { stateDir, goalId: "goal-root" } },
      { method: "prometheus.goals", params: { stateDir } },
      { method: "prometheus.recursion", params: { stateDir } },
      { method: "prometheus.autarch", params: { stateDir } },
      {
        method: "prometheus.control.preview",
        params: { stateDir, action: "autarch.gap-detection" },
      },
      { method: "prometheus.monolith", params: { stateDir } },
    ];

    const codes: string[] = [];
    for (const method of methods) {
      const respond = vi.fn();
      await prometheusHandlers[method.method]({
        req: { type: "req", id: method.method, method: method.method },
        params: method.params,
        client: null,
        isWebchatConnect: () => false,
        respond,
        context: {} as GatewayRequestContext,
      });
      const call = respond.mock.calls[0] as [boolean, unknown, { code?: string; message?: string }];
      expect(call[0]).toBe(false);
      expect(typeof call[2]?.message).toBe("string");
      codes.push(call[2]?.code ?? "__undefined__");
    }

    expect(codes.length).toBe(methods.length);
    expect(new Set(codes).size).toBe(1);
    expect(codes[0]).toBe(ErrorCodes.UNAVAILABLE);
  });

  it("uses INVALID_REQUEST for trajectory validation failures", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-errors-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-1",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "known-goal",
        title: "Known goal",
        objective: "Objective",
      },
    });

    const missingGoalRespond = vi.fn();
    await prometheusHandlers["prometheus.trajectory"]({
      req: { type: "req", id: "missing-goal", method: "prometheus.trajectory" },
      params: { stateDir },
      client: null,
      isWebchatConnect: () => false,
      respond: missingGoalRespond,
      context: {} as GatewayRequestContext,
    });
    expect(missingGoalRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: ErrorCodes.INVALID_REQUEST }),
    );

    const unknownGoalRespond = vi.fn();
    await prometheusHandlers["prometheus.trajectory"]({
      req: { type: "req", id: "unknown-goal", method: "prometheus.trajectory" },
      params: { stateDir, goalId: "missing-goal" },
      client: null,
      isWebchatConnect: () => false,
      respond: unknownGoalRespond,
      context: {} as GatewayRequestContext,
    });
    expect(unknownGoalRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: ErrorCodes.INVALID_REQUEST }),
    );
  });

  it("uses INVALID_REQUEST for control preview validation failures", async () => {
    const missingActionRespond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-missing-action", method: "prometheus.control.preview" },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond: missingActionRespond,
      context: {} as GatewayRequestContext,
    });
    expect(missingActionRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: "action is required for prometheus.control.preview",
      }),
    );

    const unsupportedActionRespond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-unsupported", method: "prometheus.control.preview" },
      params: { action: "unsupported.action" },
      client: null,
      isWebchatConnect: () => false,
      respond: unsupportedActionRespond,
      context: {} as GatewayRequestContext,
    });
    expect(unsupportedActionRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "unsupported.action"',
      }),
    );

    const stateDir = await makeTempDir("gateway-prometheus-errors-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-rec-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-rec",
        title: "Recursion goal",
        objective: "Evaluate mutation",
      },
    });

    const incompleteRecursionRespond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-rec-invalid", method: "prometheus.control.preview" },
      params: {
        stateDir,
        action: "recursion.mutation-evaluation",
        proposal: {
          mutationId: "mut-1",
          title: "Invalid proposal",
          hypothesis: "missing snapshots",
        },
      },
      client: null,
      isWebchatConnect: () => false,
      respond: incompleteRecursionRespond,
      context: {} as GatewayRequestContext,
    });
    expect(incompleteRecursionRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: "baseline and candidate fitness snapshots are required",
      }),
    );
  });

  it("uses UNAVAILABLE for planned mutating preview actions before rollout", async () => {
    const plannedActionRespond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-planned-disabled", method: "prometheus.control.preview" },
      params: {
        action: "autarch.gap-detection.commit",
        goalId: "goal-1",
      },
      client: null,
      isWebchatConnect: () => false,
      respond: plannedActionRespond,
      context: {} as GatewayRequestContext,
    });
    expect(plannedActionRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: expect.stringContaining(
          'Planned mutating action "autarch.gap-detection.commit" is disabled',
        ),
      }),
    );
  });
});
