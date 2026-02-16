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

  it("returns HELIOS trajectory window for a specific goal", async () => {
    const stateDir = resolveStateDir();
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
    await eventStore.append({
      id: "evt-traj-goal",
      type: "goal.created",
      occurredAt: 8,
      payload: {
        goalId: "goal-traj",
        title: "Trajectory goal",
        objective: "Track trajectory",
        priority: 85,
      },
    });
    await trajectoryStore.appendBatch([
      {
        goalId: "goal-traj",
        snapshot: {
          at: 9,
          completionRatio: 0.4,
          blockedRatio: 0.1,
          score: 0.66,
        },
      },
      {
        goalId: "goal-traj",
        snapshot: {
          at: 10,
          completionRatio: 0.35,
          blockedRatio: 0.45,
          score: 0.18,
        },
      },
    ]);

    const { ws } = await harness.openClient();
    const trajectoryP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-trajectory",
      10_000,
    );
    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-trajectory",
        method: "prometheus.trajectory",
        params: {
          goalId: "goal-traj",
          trajectoryWindowSize: 10,
        },
      }),
    );
    const response = (await trajectoryP) as {
      ok?: boolean;
      payload?: {
        goal?: { goalId?: string };
        snapshotCount?: number;
        divergence?: { severity?: string } | null;
      };
    };
    expect(response.ok).toBe(true);
    expect(response.payload?.goal?.goalId).toBe("goal-traj");
    expect(response.payload?.snapshotCount).toBe(2);
    expect(response.payload?.divergence?.severity).toBe("high");
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

  it("returns AUTARCH capability and gap telemetry from prometheus.autarch", async () => {
    const stateDir = resolveStateDir();
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-autarch-goal",
        type: "goal.created",
        occurredAt: 24,
        payload: {
          goalId: "goal-autarch",
          title: "Autarch goal",
          objective: "Synthesize missing capability",
          priority: 90,
        },
      },
      {
        id: "evt-autarch-gap",
        type: "capability-gap.detected",
        occurredAt: 25,
        payload: {
          gapId: "gap-autarch",
          goalId: "goal-autarch",
          description: "missing synthesis capability",
          severity: "critical",
        },
      },
      {
        id: "evt-autarch-cap",
        type: "capability-synthesized.recorded",
        occurredAt: 26,
        payload: {
          capabilityId: "cap-autarch",
          gapId: "gap-autarch",
          name: "Synthesis capability",
          designSpec: "autarch-spec",
          status: "validated",
        },
      },
    ]);

    const { ws } = await harness.openClient();
    const autarchP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-autarch",
      10_000,
    );
    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-autarch",
        method: "prometheus.autarch",
        params: {
          severity: "critical",
        },
      }),
    );
    const response = (await autarchP) as {
      ok?: boolean;
      payload?: {
        summary?: {
          unresolvedCapabilityGaps?: number;
          synthesizedCapabilities?: number;
        };
        gaps?: Array<{ gapId?: string; severity?: string }>;
        capabilities?: Array<{ capabilityId?: string; status?: string }>;
      };
    };
    expect(response.ok).toBe(true);
    expect(response.payload?.summary?.unresolvedCapabilityGaps).toBeGreaterThanOrEqual(1);
    expect(response.payload?.summary?.synthesizedCapabilities).toBeGreaterThanOrEqual(1);
    expect(response.payload?.gaps?.[0]?.severity).toBe("critical");
    expect(
      response.payload?.capabilities?.some(
        (capability) => capability.capabilityId === "cap-autarch",
      ),
    ).toBe(true);
    ws.close();
  });

  it("returns monolith institutional capital telemetry and allocation preview", async () => {
    const stateDir = resolveStateDir();
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-monolith-goal",
        type: "goal.created",
        occurredAt: 30,
        payload: {
          goalId: "goal-mono",
          title: "Institutional objective",
          objective: "Allocate capital",
          priority: 95,
        },
      },
      {
        id: "evt-monolith-inst",
        type: "institution.created",
        occurredAt: 31,
        payload: {
          institutionId: "inst-mono",
          name: "Monolith Institute",
          mandate: "scale recursive intelligence",
          authorityModel: "council",
        },
      },
      {
        id: "evt-monolith-cap",
        type: "capital.allocated",
        occurredAt: 32,
        payload: {
          capitalId: "capital-mono",
          institutionId: "inst-mono",
          form: "compute",
          amount: 120,
          unit: "gpu-hours",
        },
      },
    ]);

    const { ws } = await harness.openClient();
    const monolithP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-monolith",
      10_000,
    );
    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-monolith",
        method: "prometheus.monolith",
        params: {
          demands: [
            {
              goalId: "goal-mono",
              form: "compute",
              requiredAmount: 90,
              priority: 100,
            },
          ],
        },
      }),
    );
    const response = (await monolithP) as {
      ok?: boolean;
      payload?: {
        totalsByForm?: {
          compute?: number;
        };
        institutions?: Array<{
          institutionId?: string;
          capital?: { compute?: number };
        }>;
        allocationPreview?: {
          allocations?: Array<{ amount?: number; institutionId?: string }>;
          governanceChecks?: Array<{
            decision?: { allowed?: boolean; requiredApprovals?: string[] };
          }>;
        } | null;
      };
    };

    expect(response.ok).toBe(true);
    expect(response.payload?.totalsByForm?.compute).toBeGreaterThanOrEqual(120);
    expect(
      response.payload?.institutions?.some(
        (institution) => institution.institutionId === "inst-mono",
      ),
    ).toBe(true);
    expect(response.payload?.allocationPreview?.allocations?.[0]?.institutionId).toBe("inst-mono");
    expect(response.payload?.allocationPreview?.allocations?.[0]?.amount).toBe(90);
    expect(response.payload?.allocationPreview?.governanceChecks?.[0]?.decision?.allowed).toBe(
      true,
    );
    ws.close();
  });

  it("rejects node-role access to prometheus methods", async () => {
    const { ws } = await harness.openClient({
      role: "node",
      scopes: ["operator.read"],
    });
    const responseP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-node-deny",
      10_000,
    );
    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-node-deny",
        method: "prometheus.status",
      }),
    );
    const response = (await responseP) as {
      ok?: boolean;
      error?: { message?: string };
    };
    expect(response.ok).toBe(false);
    expect(response.error?.message).toContain("unauthorized role: node");
    ws.close();
  });

  it("allows operator.write scope for prometheus.status", async () => {
    const { ws } = await harness.openClient({
      role: "operator",
      scopes: ["operator.write"],
    });
    const responseP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-write-allow",
      10_000,
    );
    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-write-allow",
        method: "prometheus.status",
      }),
    );
    const response = (await responseP) as {
      ok?: boolean;
      payload?: { summary?: { goals?: number } };
      error?: { message?: string };
    };
    expect(response.ok).toBe(true);
    expect(response.payload?.summary?.goals).toBeGreaterThanOrEqual(0);
    expect(response.error).toBeUndefined();
    ws.close();
  });

  it("keeps status and autarch summary counts consistent in e2e flow", async () => {
    const stateDir = resolveStateDir();
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-consistency-goal",
        type: "goal.created",
        occurredAt: 40,
        payload: {
          goalId: "goal-consistency",
          title: "Consistency goal",
          objective: "Verify parity",
          priority: 88,
        },
      },
      {
        id: "evt-consistency-gap",
        type: "capability-gap.detected",
        occurredAt: 41,
        payload: {
          gapId: "gap-consistency",
          goalId: "goal-consistency",
          description: "missing parity capability",
          severity: "high",
        },
      },
      {
        id: "evt-consistency-cap",
        type: "capability-synthesized.recorded",
        occurredAt: 42,
        payload: {
          capabilityId: "cap-consistency",
          gapId: "gap-consistency",
          name: "Parity capability",
          designSpec: "parity-spec",
          status: "validated",
        },
      },
    ]);

    const { ws } = await harness.openClient();
    const statusP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-consistency-status",
      10_000,
    );
    const autarchP = onceMessage(
      ws,
      (obj) => obj.type === "res" && obj.id === "prometheus-consistency-autarch",
      10_000,
    );

    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-consistency-status",
        method: "prometheus.status",
      }),
    );
    ws.send(
      JSON.stringify({
        type: "req",
        id: "prometheus-consistency-autarch",
        method: "prometheus.autarch",
      }),
    );

    const statusRes = (await statusP) as {
      ok?: boolean;
      payload?: {
        summary?: {
          capabilityGaps?: number;
          unresolvedCapabilityGaps?: number;
          synthesizedCapabilities?: number;
        };
      };
    };
    const autarchRes = (await autarchP) as {
      ok?: boolean;
      payload?: {
        summary?: {
          capabilityGaps?: number;
          unresolvedCapabilityGaps?: number;
          synthesizedCapabilities?: number;
        };
      };
    };

    expect(statusRes.ok).toBe(true);
    expect(autarchRes.ok).toBe(true);
    expect(statusRes.payload?.summary?.capabilityGaps).toBe(
      autarchRes.payload?.summary?.capabilityGaps,
    );
    expect(statusRes.payload?.summary?.unresolvedCapabilityGaps).toBe(
      autarchRes.payload?.summary?.unresolvedCapabilityGaps,
    );
    expect(statusRes.payload?.summary?.synthesizedCapabilities).toBe(
      autarchRes.payload?.summary?.synthesizedCapabilities,
    );
    ws.close();
  });
});
