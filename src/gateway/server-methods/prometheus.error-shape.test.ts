import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFilePrometheusEventStore } from "../../prometheus/index.js";
import { ErrorCodes } from "../protocol/index.js";
import { runPrometheusHandler } from "./prometheus.handler-test-helpers.js";
import { createPrometheusTempDirHarness } from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheus handler error shape parity", () => {
  it("uses consistent internal error code for malformed event logs", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-errors-");
    const eventLogPath = path.join(stateDir, "prometheus", "events.jsonl");
    await fs.mkdir(path.dirname(eventLogPath), { recursive: true });
    await fs.writeFile(eventLogPath, "{", "utf8");

    const methods: Array<{
      method: Parameters<typeof runPrometheusHandler>[0]["method"];
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
      await runPrometheusHandler({
        method: method.method,
        requestId: method.method,
        params: method.params,
        respond,
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
    await runPrometheusHandler({
      method: "prometheus.trajectory",
      requestId: "missing-goal",
      params: { stateDir },
      respond: missingGoalRespond,
    });
    expect(missingGoalRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: ErrorCodes.INVALID_REQUEST }),
    );

    const unknownGoalRespond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.trajectory",
      requestId: "unknown-goal",
      params: { stateDir, goalId: "missing-goal" },
      respond: unknownGoalRespond,
    });
    expect(unknownGoalRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: ErrorCodes.INVALID_REQUEST }),
    );
  });
});
