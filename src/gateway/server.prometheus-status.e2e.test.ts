import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveStateDir } from "../config/paths.js";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../prometheus/index.js";
import { startGatewayServerHarness, type GatewayServerHarness } from "./server.e2e-ws-harness.js";
import { installGatewayTestHooks, onceMessage } from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

let harness: GatewayServerHarness;

beforeAll(async () => {
  harness = await startGatewayServerHarness();
});

afterAll(async () => {
  await harness.close();
});

describe("gateway prometheus.status", () => {
  it("returns promethues read-model summary with divergence signals", async () => {
    const stateDir = resolveStateDir();
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );

    await eventStore.appendBatch([
      {
        id: "evt-root",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-root",
          title: "Root goal",
          objective: "Ship recursive intelligence",
          priority: 100,
        },
      },
      {
        id: "evt-child",
        type: "goal.created",
        occurredAt: 2,
        payload: {
          goalId: "goal-child",
          parentGoalId: "goal-root",
          title: "Child goal",
          objective: "Deliver dependency",
          priority: 90,
        },
      },
      {
        id: "evt-child-status",
        type: "goal.status-updated",
        occurredAt: 3,
        payload: {
          goalId: "goal-child",
          status: "blocked",
        },
      },
    ]);

    await trajectoryStore.appendBatch([
      {
        goalId: "goal-root",
        snapshot: {
          at: 1,
          completionRatio: 0.5,
          blockedRatio: 0,
          score: 0.72,
        },
      },
      {
        goalId: "goal-root",
        snapshot: {
          at: 2,
          completionRatio: 0.4,
          blockedRatio: 0.5,
          score: 0.2,
        },
      },
    ]);

    const { ws } = await harness.openClient();
    const statusP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-status",
      10_000,
    );
    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-status",
        method: "prometheus.status",
        params: {
          rootGoalIds: ["goal-root"],
          trajectoryWindowSize: 10,
        },
      }),
    );
    const response = (await statusP) as {
      ok?: boolean;
      payload?: {
        summary?: {
          goals?: number;
          blockedGoals?: number;
        };
        rootGoals?: Array<{
          goalId?: string;
          divergence?: { severity?: string; reason?: string } | null;
        }>;
      };
    };
    expect(response.ok).toBe(true);
    expect(response.payload?.summary?.goals).toBe(2);
    expect(response.payload?.summary?.blockedGoals).toBe(1);
    expect(response.payload?.rootGoals?.[0]?.goalId).toBe("goal-root");
    expect(response.payload?.rootGoals?.[0]?.divergence?.severity).toBe("high");
    expect(response.payload?.rootGoals?.[0]?.divergence?.reason).toContain("minimum floor");
    ws.close();
  });
});
