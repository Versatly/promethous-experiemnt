import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";
import { handleGatewayRequest } from "../server-methods.js";
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

describe("prometheus.status gateway authorization", () => {
  it("allows operator.read scope", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: { type: "req", id: "read-1", method: "prometheus.status", params: {} },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(true, expect.any(Object), undefined);
  });

  it("rejects calls without read or write scope", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: { type: "req", id: "read-2", method: "prometheus.status", params: {} },
      client: {
        connect: {
          role: "operator",
          scopes: [],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("operator.read"),
      }),
    );
  });
});

describe("prometheus.goals gateway authorization", () => {
  it("allows operator.read scope", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: { type: "req", id: "goals-read-1", method: "prometheus.goals", params: {} },
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(true, expect.any(Object), undefined);
  });

  it("rejects calls without read or write scope", async () => {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: { type: "req", id: "goals-read-2", method: "prometheus.goals", params: {} },
      client: {
        connect: {
          role: "operator",
          scopes: [],
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("operator.read"),
      }),
    );
  });
});
