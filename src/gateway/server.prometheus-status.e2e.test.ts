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

  it("returns goal/capability coverage view from prometheus.goals", async () => {
    const stateDir = resolveStateDir();
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-goals-root",
        type: "goal.created",
        occurredAt: 10,
        payload: {
          goalId: "goal-root-2",
          title: "Root 2",
          objective: "Expand system",
          priority: 100,
        },
      },
      {
        id: "evt-goals-child",
        type: "goal.created",
        occurredAt: 11,
        payload: {
          goalId: "goal-child-2",
          parentGoalId: "goal-root-2",
          title: "Child 2",
          objective: "Deliver capability",
          priority: 90,
        },
      },
      {
        id: "evt-gap-2",
        type: "capability-gap.detected",
        occurredAt: 12,
        payload: {
          gapId: "gap-2",
          goalId: "goal-child-2",
          description: "missing delivery capability",
          severity: "high",
        },
      },
      {
        id: "evt-cap-2",
        type: "capability-synthesized.recorded",
        occurredAt: 13,
        payload: {
          capabilityId: "cap-2",
          gapId: "gap-2",
          name: "Delivery capability",
          designSpec: "delivery-spec",
          status: "validated",
        },
      },
    ]);

    const { ws } = await harness.openClient();
    const goalsP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-goals",
      10_000,
    );
    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-goals",
        method: "prometheus.goals",
      }),
    );
    const response = (await goalsP) as {
      ok?: boolean;
      payload?: {
        total?: number;
        goals?: Array<{
          goalId?: string;
          capabilityCoverage?: {
            capabilityIds?: string[];
            provisionalCount?: number;
          };
        }>;
      };
    };

    const childGoal = response.payload?.goals?.find((goal) => goal.goalId === "goal-child-2");
    expect(response.ok).toBe(true);
    expect(response.payload?.total).toBeGreaterThanOrEqual(2);
    expect(childGoal?.capabilityCoverage?.capabilityIds).toContain("cap-2");
    expect(childGoal?.capabilityCoverage?.provisionalCount).toBe(1);
    ws.close();
  });

  it("returns recursion cycle telemetry window from prometheus.recursion", async () => {
    const stateDir = resolveStateDir();
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-rec-goal",
        type: "goal.created",
        occurredAt: 20,
        payload: {
          goalId: "goal-rec",
          title: "Recursion goal",
          objective: "Optimize recursively",
          priority: 95,
        },
      },
      {
        id: "evt-rec-1",
        type: "recursion.cycle-recorded",
        occurredAt: 21,
        payload: {
          cycleId: "cycle-rec-1",
          summary: "accepted mutation",
          mutationId: "mut-rec-1",
          accepted: true,
          evaluationScore: 0.13,
          occurredAt: 21,
        },
      },
      {
        id: "evt-rec-2",
        type: "recursion.cycle-recorded",
        occurredAt: 22,
        payload: {
          cycleId: "cycle-rec-2",
          summary: "rollback",
          rollbackOfCycleId: "cycle-rec-1",
          accepted: true,
          evaluationScore: 0,
          occurredAt: 22,
        },
      },
    ]);

    const { ws } = await harness.openClient();
    const recursionP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-recursion",
      10_000,
    );
    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-recursion",
        method: "prometheus.recursion",
        params: {
          recursionWindowSize: 2,
        },
      }),
    );
    const response = (await recursionP) as {
      ok?: boolean;
      payload?: {
        windowSize?: number;
        totals?: {
          totalCycles?: number;
          rollbackCount?: number;
        };
        cycles?: Array<{ cycleId?: string; rollbackOfCycleId?: string }>;
      };
    };
    expect(response.ok).toBe(true);
    expect(response.payload?.windowSize).toBe(2);
    expect(response.payload?.totals?.totalCycles).toBeGreaterThanOrEqual(2);
    expect(response.payload?.totals?.rollbackCount).toBe(1);
    expect(response.payload?.cycles?.[0]?.cycleId).toBe("cycle-rec-2");
    expect(response.payload?.cycles?.[0]?.rollbackOfCycleId).toBe("cycle-rec-1");
    ws.close();
  });
});
