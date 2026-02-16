import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";
import { ErrorCodes } from "../protocol/index.js";
import { PROMETHEUS_GATEWAY_METHOD_METADATA } from "./prometheus-methods.js";
import { assertPrometheusHandlerContract, prometheusHandlers } from "./prometheus.js";

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

describe("prometheusHandlers contract", () => {
  it("keeps handler keys aligned with method metadata", () => {
    expect(() =>
      assertPrometheusHandlerContract({
        handlers: prometheusHandlers,
        methodMetadata: PROMETHEUS_GATEWAY_METHOD_METADATA,
      }),
    ).not.toThrow();
  });

  it("fails fast when handler keys diverge from method metadata", () => {
    expect(() =>
      assertPrometheusHandlerContract({
        handlers: {
          "prometheus.status": async (_opts) => undefined,
        },
        methodMetadata: {
          "prometheus.status": {
            access: "read",
            mutatesState: false,
          },
          "prometheus.control.preview": {
            access: "write",
            mutatesState: false,
          },
        },
      }),
    ).toThrow("handlers and metadata keys diverged");
  });
});

describe("prometheusHandlers.prometheus.status", () => {
  it("returns PROMETHEUS summary and root-goal trajectory status", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-status-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-1",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "root",
          title: "Root objective",
          objective: "ship system",
          priority: 100,
        },
      },
      {
        id: "evt-2",
        type: "goal.status-updated",
        occurredAt: 2,
        payload: {
          goalId: "root",
          status: "blocked",
        },
      },
    ]);
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
    await trajectoryStore.appendBatch([
      {
        goalId: "root",
        snapshot: { at: 1, completionRatio: 0.3, blockedRatio: 0.1, score: 0.6 },
      },
      {
        goalId: "root",
        snapshot: { at: 2, completionRatio: 0.25, blockedRatio: 0.4, score: 0.22 },
      },
    ]);

    const respond = vi.fn();
    await prometheusHandlers["prometheus.status"]({
      req: { type: "req", id: "1", method: "prometheus.status" },
      params: {
        stateDir,
        rootGoalIds: ["root"],
        trajectoryWindowSize: 5,
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        eventCount: 2,
        summary: expect.objectContaining({
          goals: 1,
          blockedGoals: 1,
        }),
        rootGoals: [
          expect.objectContaining({
            goalId: "root",
            snapshotCount: 2,
            divergence: expect.objectContaining({
              severity: "high",
            }),
          }),
        ],
      }),
      undefined,
    );
  });
});

describe("prometheusHandlers.prometheus.trajectory", () => {
  it("returns trajectory window and divergence for requested goal", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-trajectory-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-root",
        title: "Root objective",
        objective: "ship system",
        priority: 100,
      },
    });
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
    await trajectoryStore.appendBatch([
      {
        goalId: "goal-root",
        snapshot: { at: 10, completionRatio: 0.4, blockedRatio: 0.1, score: 0.65 },
      },
      {
        goalId: "goal-root",
        snapshot: { at: 20, completionRatio: 0.35, blockedRatio: 0.4, score: 0.2 },
      },
    ]);

    const respond = vi.fn();
    await prometheusHandlers["prometheus.trajectory"]({
      req: { type: "req", id: "traj-1", method: "prometheus.trajectory" },
      params: {
        stateDir,
        goalId: "goal-root",
        trajectoryWindowSize: 10,
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        goal: expect.objectContaining({
          goalId: "goal-root",
        }),
        snapshotCount: 2,
        divergence: expect.objectContaining({
          severity: "high",
        }),
      }),
      undefined,
    );
  });
});

describe("prometheusHandlers.prometheus.goals", () => {
  it("returns goal tree with capability coverage summaries", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-goals-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-goal-root",
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
        id: "evt-goal-child",
        type: "goal.created",
        occurredAt: 2,
        payload: {
          goalId: "goal-child",
          parentGoalId: "goal-root",
          title: "Child objective",
          objective: "ship child",
          priority: 90,
        },
      },
      {
        id: "evt-gap",
        type: "capability-gap.detected",
        occurredAt: 3,
        payload: {
          gapId: "gap-1",
          goalId: "goal-child",
          description: "missing capability",
          severity: "high",
        },
      },
      {
        id: "evt-capability",
        type: "capability-synthesized.recorded",
        occurredAt: 4,
        payload: {
          capabilityId: "cap-1",
          gapId: "gap-1",
          name: "Planner capability",
          designSpec: "design",
          status: "validated",
        },
      },
    ]);

    const respond = vi.fn();
    await prometheusHandlers["prometheus.goals"]({
      req: { type: "req", id: "2", method: "prometheus.goals" },
      params: {
        stateDir,
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        total: 2,
        goals: expect.arrayContaining([
          expect.objectContaining({
            goalId: "goal-child",
            capabilityCoverage: expect.objectContaining({
              capabilityIds: ["cap-1"],
              provisionalCount: 1,
              unresolvedGapIds: ["gap-1"],
            }),
          }),
        ]),
      }),
      undefined,
    );
  });
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

describe("prometheusHandlers.prometheus.control.catalog", () => {
  it("returns control-surface metadata for method and action contracts", async () => {
    const respond = vi.fn();
    await prometheusHandlers["prometheus.control.catalog"]({
      req: { type: "req", id: "control-catalog-1", method: "prometheus.control.catalog" },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        methods: expect.arrayContaining([
          expect.objectContaining({
            method: "prometheus.control.catalog",
            access: "read",
            mutatesState: false,
          }),
          expect.objectContaining({
            method: "prometheus.control.preview",
            access: "write",
            mutatesState: false,
          }),
        ]),
        controlPreview: expect.objectContaining({
          method: "prometheus.control.preview",
          actions: expect.arrayContaining([
            expect.objectContaining({
              action: "autarch.gap-detection",
              mutatesState: false,
              requiredParams: [],
            }),
            expect.objectContaining({
              action: "helios.trajectory-evaluation",
              mutatesState: false,
              requiredParams: ["goalId"],
            }),
            expect.objectContaining({
              action: "recursion.mutation-evaluation",
              mutatesState: false,
              requiredParams: ["proposal", "baseline", "candidate"],
            }),
          ]),
        }),
      }),
      undefined,
    );
  });
});

describe("prometheusHandlers.prometheus.control.preview", () => {
  it("returns AUTARCH gap-detection preview without mutating state", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
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
        id: "evt-goal-status",
        type: "goal.status-updated",
        occurredAt: 2,
        payload: {
          goalId: "goal-root",
          status: "blocked",
        },
      },
    ]);

    const respond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-1", method: "prometheus.control.preview" },
      params: {
        stateDir,
        action: "autarch.gap-detection",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "autarch.gap-detection",
        mutatesState: false,
        preview: expect.objectContaining({
          suggestedGapCount: 1,
        }),
      }),
      undefined,
    );
  });

  it("returns recursion mutation evaluation preview", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-root",
        title: "Root objective",
        objective: "ship system",
        priority: 100,
      },
    });

    const respond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-2", method: "prometheus.control.preview" },
      params: {
        stateDir,
        action: "recursion.mutation-evaluation",
        proposal: {
          mutationId: "mut-1",
          title: "Increase horizon",
          hypothesis: "better long-range trajectory",
          risk: "low",
          expectedGain: 0.1,
        },
        baseline: {
          objectiveFit: 0.55,
          stability: 0.7,
          throughput: 0.5,
        },
        candidate: {
          objectiveFit: 0.7,
          stability: 0.72,
          throughput: 0.52,
        },
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "recursion.mutation-evaluation",
        mutatesState: false,
        preview: expect.objectContaining({
          evaluation: expect.objectContaining({
            mutationId: "mut-1",
          }),
        }),
      }),
      undefined,
    );
  });

  it("returns HELIOS trajectory evaluation preview for known goal", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-helios",
        title: "Helios goal",
        objective: "Track trajectory",
        priority: 80,
      },
    });
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
    await trajectoryStore.append({
      goalId: "goal-helios",
      snapshot: {
        at: 2,
        completionRatio: 0.3,
        blockedRatio: 0.1,
        score: 0.5,
      },
    });

    const respond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-3", method: "prometheus.control.preview" },
      params: {
        stateDir,
        action: "helios.trajectory-evaluation",
        goalId: "goal-helios",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        action: "helios.trajectory-evaluation",
        mutatesState: false,
        preview: expect.objectContaining({
          goalId: "goal-helios",
          computedSnapshot: expect.objectContaining({
            at: expect.any(Number),
            completionRatio: expect.any(Number),
          }),
        }),
      }),
      undefined,
    );
  });

  it("rejects unsupported control preview action with INVALID_REQUEST", async () => {
    const respond = vi.fn();
    await prometheusHandlers["prometheus.control.preview"]({
      req: { type: "req", id: "control-4", method: "prometheus.control.preview" },
      params: {
        action: "prometheus.unknown-action",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "prometheus.unknown-action"',
      }),
    );
  });

  it("does not mutate event log across preview actions", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-non-mutating",
        title: "Non-mutating goal",
        objective: "Verify preview does not write",
        priority: 75,
      },
    });
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
    await trajectoryStore.append({
      goalId: "goal-non-mutating",
      snapshot: {
        at: 2,
        completionRatio: 0.2,
        blockedRatio: 0.1,
        score: 0.4,
      },
    });

    const beforeCount = (await eventStore.readAll()).length;

    const callControlPreview = async (params: Record<string, unknown>) => {
      const respond = vi.fn();
      await prometheusHandlers["prometheus.control.preview"]({
        req: { type: "req", id: "control-non-mutating", method: "prometheus.control.preview" },
        params: {
          stateDir,
          ...params,
        },
        client: null,
        isWebchatConnect: () => false,
        respond,
        context: {} as GatewayRequestContext,
      });
      expect(respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          mutatesState: false,
        }),
        undefined,
      );
    };

    await callControlPreview({
      action: "autarch.gap-detection",
    });
    await callControlPreview({
      action: "helios.trajectory-evaluation",
      goalId: "goal-non-mutating",
    });
    await callControlPreview({
      action: "recursion.mutation-evaluation",
      proposal: {
        mutationId: "mut-non-mutating",
        title: "Safe mutation",
        hypothesis: "should remain read-only",
        risk: "low",
        expectedGain: 0.05,
      },
      baseline: {
        objectiveFit: 0.51,
        stability: 0.7,
        throughput: 0.49,
      },
      candidate: {
        objectiveFit: 0.6,
        stability: 0.71,
        throughput: 0.5,
      },
    });

    const afterCount = (await eventStore.readAll()).length;
    expect(afterCount).toBe(beforeCount);
  });
});
