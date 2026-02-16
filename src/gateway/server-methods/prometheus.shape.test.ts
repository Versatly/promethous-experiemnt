import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";
import { prometheusHandlers } from "./prometheus.js";
import { createPrometheusTempDirHarness } from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

async function seedPrometheusState(stateDir: string) {
  const eventStore = createFilePrometheusEventStore(
    path.join(stateDir, "prometheus", "events.jsonl"),
  );
  const trajectoryStore = createFileHeliosTrajectoryStore(
    path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
  );
  await eventStore.appendBatch([
    {
      id: "evt-goal-root",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-root",
        title: "Root objective",
        objective: "Ship recursive system",
        priority: 100,
      },
    },
    {
      id: "evt-goal-status",
      type: "goal.status-updated",
      occurredAt: 2,
      payload: {
        goalId: "goal-root",
        status: "blocked",
      },
    },
    {
      id: "evt-inst",
      type: "institution.created",
      occurredAt: 3,
      payload: {
        institutionId: "inst-1",
        name: "Prometheus Lab",
        mandate: "scale recursive intelligence",
        authorityModel: "council",
      },
    },
    {
      id: "evt-capital",
      type: "capital.allocated",
      occurredAt: 4,
      payload: {
        capitalId: "cap-1",
        institutionId: "inst-1",
        form: "compute",
        amount: 120,
        unit: "gpu-hours",
      },
    },
    {
      id: "evt-cycle",
      type: "recursion.cycle-recorded",
      occurredAt: 5,
      payload: {
        cycleId: "cycle-1",
        summary: "baseline recursion cycle",
        accepted: true,
        occurredAt: 5,
      },
    },
  ]);
  await trajectoryStore.appendBatch([
    {
      goalId: "goal-root",
      snapshot: { at: 1, completionRatio: 0.4, blockedRatio: 0.1, score: 0.62 },
    },
    {
      goalId: "goal-root",
      snapshot: { at: 2, completionRatio: 0.35, blockedRatio: 0.4, score: 0.2 },
    },
  ]);
}

function payloadTopKeys(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  return Object.keys(payload as Record<string, unknown>).toSorted();
}

describe("prometheus handlers response shape", () => {
  it("keeps stable top-level payload keys for compatibility methods", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-shape-");
    await seedPrometheusState(stateDir);
    const context = {} as GatewayRequestContext;

    const call = async (
      method: keyof typeof prometheusHandlers,
      params: Record<string, unknown>,
    ) => {
      const respond = vi.fn();
      await prometheusHandlers[method]({
        req: { type: "req", id: method, method },
        params,
        client: null,
        isWebchatConnect: () => false,
        respond,
        context,
      });
      return respond.mock.calls[0]?.[1];
    };

    const statusPayload = await call("prometheus.status", { stateDir });
    const trajectoryPayload = await call("prometheus.trajectory", {
      stateDir,
      goalId: "goal-root",
    });
    const goalsPayload = await call("prometheus.goals", { stateDir });
    const recursionPayload = await call("prometheus.recursion", { stateDir });
    const autarchPayload = await call("prometheus.autarch", { stateDir });
    const controlCatalogPayload = await call("prometheus.control.catalog", {
      stateDir,
    });
    const controlPreviewPayload = await call("prometheus.control.preview", {
      stateDir,
      action: "autarch.gap-detection",
    });
    const monolithPayload = await call("prometheus.monolith", { stateDir });

    expect(payloadTopKeys(statusPayload)).toEqual([
      "alignment",
      "eventCount",
      "rootGoals",
      "summary",
      "ts",
    ]);
    expect(payloadTopKeys(trajectoryPayload)).toEqual([
      "divergence",
      "goal",
      "latest",
      "scoreDeltaFromPrevious",
      "sinceAt",
      "snapshotCount",
      "snapshots",
      "ts",
      "windowSize",
    ]);
    expect(payloadTopKeys(goalsPayload)).toEqual(["goals", "total", "ts"]);
    expect(payloadTopKeys(recursionPayload)).toEqual(["cycles", "totals", "ts", "windowSize"]);
    expect(payloadTopKeys(autarchPayload)).toEqual([
      "capabilities",
      "gaps",
      "goalsWithUnresolvedGaps",
      "graph",
      "summary",
      "ts",
    ]);
    expect(payloadTopKeys(controlCatalogPayload)).toEqual([
      "controlPreview",
      "guardrails",
      "methods",
      "summary",
      "ts",
    ]);
    expect(payloadTopKeys(controlPreviewPayload)).toEqual([
      "action",
      "mutatesState",
      "preview",
      "ts",
    ]);
    expect(payloadTopKeys(monolithPayload)).toEqual([
      "allocationPreview",
      "institutions",
      "summary",
      "totalsByForm",
      "ts",
    ]);
  });
});
