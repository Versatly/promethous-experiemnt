import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { createFilePrometheusEventStore } from "../../prometheus/index.js";
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

describe("prometheusHandlers.prometheus.recursion", () => {
  it("returns recursion cycle telemetry window and acceptance ratios", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-recursion-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-goal",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-root",
          title: "Root objective",
          objective: "ship system",
          priority: 100,
        },
      },
      {
        id: "evt-cycle-1",
        type: "recursion.cycle-recorded",
        occurredAt: 5,
        payload: {
          cycleId: "cycle-1",
          summary: "accepted mutation",
          mutationId: "mut-1",
          accepted: true,
          evaluationScore: 0.12,
          occurredAt: 5,
        },
      },
      {
        id: "evt-cycle-2",
        type: "recursion.cycle-recorded",
        occurredAt: 6,
        payload: {
          cycleId: "cycle-2",
          summary: "rejected mutation",
          mutationId: "mut-2",
          accepted: false,
          evaluationScore: -0.05,
          occurredAt: 6,
        },
      },
      {
        id: "evt-cycle-3",
        type: "recursion.cycle-recorded",
        occurredAt: 7,
        payload: {
          cycleId: "cycle-3",
          summary: "rollback",
          rollbackOfCycleId: "cycle-1",
          accepted: true,
          evaluationScore: 0,
          occurredAt: 7,
        },
      },
    ]);

    const respond = vi.fn();
    await prometheusHandlers["prometheus.recursion"]({
      req: { type: "req", id: "3", method: "prometheus.recursion" },
      params: {
        stateDir,
        recursionWindowSize: 2,
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        windowSize: 2,
        totals: expect.objectContaining({
          totalCycles: 3,
          accepted: 1,
          rejected: 1,
          rollbackCount: 1,
          acceptanceRatio: 0.5,
        }),
        cycles: [
          expect.objectContaining({
            cycleId: "cycle-3",
            rollbackOfCycleId: "cycle-1",
          }),
          expect.objectContaining({
            cycleId: "cycle-2",
            accepted: false,
          }),
        ],
      }),
      undefined,
    );
  });
});

describe("prometheusHandlers.prometheus.autarch", () => {
  it("returns capability synthesis telemetry and filtered gap views", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-autarch-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-goal",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-root",
          title: "Root objective",
          objective: "ship system",
          priority: 100,
        },
      },
      {
        id: "evt-gap-critical",
        type: "capability-gap.detected",
        occurredAt: 2,
        payload: {
          gapId: "gap-critical",
          goalId: "goal-root",
          description: "critical missing capability",
          severity: "critical",
        },
      },
      {
        id: "evt-gap-medium",
        type: "capability-gap.detected",
        occurredAt: 3,
        payload: {
          gapId: "gap-medium",
          goalId: "goal-root",
          description: "medium missing capability",
          severity: "medium",
        },
      },
      {
        id: "evt-capability",
        type: "capability-synthesized.recorded",
        occurredAt: 4,
        payload: {
          capabilityId: "cap-1",
          gapId: "gap-medium",
          name: "Planner capability",
          designSpec: "design",
          status: "validated",
        },
      },
    ]);

    const respond = vi.fn();
    await prometheusHandlers["prometheus.autarch"]({
      req: { type: "req", id: "autarch-1", method: "prometheus.autarch" },
      params: {
        stateDir,
        severity: "critical",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.objectContaining({
          capabilityGaps: 2,
          unresolvedCapabilityGaps: 2,
          criticalUnresolvedCapabilityGaps: 1,
          synthesizedCapabilities: 1,
          synthesizedByStatus: expect.objectContaining({
            validated: 1,
          }),
        }),
        graph: expect.objectContaining({
          capabilityNodes: 1,
        }),
        goalsWithUnresolvedGaps: ["goal-root"],
        gaps: [
          expect.objectContaining({
            gapId: "gap-critical",
            severity: "critical",
          }),
        ],
        capabilities: [expect.objectContaining({ capabilityId: "cap-1", status: "validated" })],
      }),
      undefined,
    );
  });
});

describe("prometheusHandlers.prometheus.monolith", () => {
  it("returns institution capital telemetry and allocation preview", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-monolith-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-goal",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-root",
          title: "Root objective",
          objective: "ship system",
          priority: 100,
        },
      },
      {
        id: "evt-inst-1",
        type: "institution.created",
        occurredAt: 2,
        payload: {
          institutionId: "inst-1",
          name: "Prometheus Lab",
          mandate: "scale recursive intelligence",
          authorityModel: "council",
        },
      },
      {
        id: "evt-inst-2",
        type: "institution.created",
        occurredAt: 3,
        payload: {
          institutionId: "inst-2",
          name: "Dormant Lab",
          mandate: "archive",
          authorityModel: "council",
        },
      },
      {
        id: "evt-inst-2-status",
        type: "institution.status-updated",
        occurredAt: 4,
        payload: {
          institutionId: "inst-2",
          status: "dormant",
        },
      },
      {
        id: "evt-cap-1",
        type: "capital.allocated",
        occurredAt: 5,
        payload: {
          capitalId: "capital-1",
          institutionId: "inst-1",
          form: "compute",
          amount: 100,
          unit: "gpu-hours",
        },
      },
      {
        id: "evt-cap-2",
        type: "capital.allocated",
        occurredAt: 6,
        payload: {
          capitalId: "capital-2",
          institutionId: "inst-1",
          form: "money",
          amount: 250,
          unit: "USD",
        },
      },
    ]);

    const respond = vi.fn();
    await prometheusHandlers["prometheus.monolith"]({
      req: { type: "req", id: "4", method: "prometheus.monolith" },
      params: {
        stateDir,
        demands: [
          {
            goalId: "goal-root",
            form: "compute",
            requiredAmount: 80,
            priority: 90,
          },
        ],
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.objectContaining({
          institutions: 2,
          activeInstitutions: 1,
          dormantInstitutions: 1,
        }),
        totalsByForm: expect.objectContaining({
          compute: 100,
          money: 250,
        }),
        institutions: expect.arrayContaining([
          expect.objectContaining({
            institutionId: "inst-1",
            capital: expect.objectContaining({
              compute: 100,
              money: 250,
            }),
          }),
        ]),
        allocationPreview: expect.objectContaining({
          requestedDemands: 1,
          allocations: [
            expect.objectContaining({
              goalId: "goal-root",
              institutionId: "inst-1",
              form: "compute",
              amount: 80,
            }),
          ],
          governanceChecks: [
            expect.objectContaining({
              decision: expect.objectContaining({
                allowed: true,
                requiredApprovals: expect.arrayContaining(["treasury-council"]),
              }),
            }),
          ],
        }),
      }),
      undefined,
    );
  });
});
