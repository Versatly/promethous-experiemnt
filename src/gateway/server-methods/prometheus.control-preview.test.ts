import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";
import { ErrorCodes } from "../protocol/index.js";
import {
  assertPrometheusControlPreviewActionContract,
  PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
  PROMETHEUS_CONTROL_PREVIEW_ACTIONS,
  isPrometheusControlPreviewAction,
  runPrometheusControlPreview,
} from "./prometheus.control-preview.js";

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

describe("prometheus control preview helpers", () => {
  it("exposes a unique action set and matching type guard", () => {
    const actions = [...PROMETHEUS_CONTROL_PREVIEW_ACTIONS];
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual([
      "autarch.gap-detection",
      "helios.trajectory-evaluation",
      "recursion.mutation-evaluation",
    ]);
    expect(actions.every((action) => isPrometheusControlPreviewAction(action))).toBe(true);
    expect(isPrometheusControlPreviewAction("unknown.action")).toBe(false);
    expect(Object.keys(PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA).toSorted()).toEqual(
      [...actions].toSorted(),
    );
    for (const action of actions) {
      expect(PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[action].mutatesState).toBe(false);
    }
    expect(
      PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA["autarch.gap-detection"].requiredParams,
    ).toEqual([]);
    expect(
      PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA["helios.trajectory-evaluation"].requiredParams,
    ).toEqual(["goalId"]);
    expect(
      PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA["recursion.mutation-evaluation"].requiredParams,
    ).toEqual(["proposal", "baseline", "candidate"]);
  });

  it("returns INVALID_REQUEST for missing or unsupported actions", async () => {
    const missingAction = await runPrometheusControlPreview({});
    expect(missingAction).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: "action is required for prometheus.control.preview",
      },
    });

    const unsupportedAction = await runPrometheusControlPreview({
      action: "unknown.action",
    });
    expect(unsupportedAction).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Unsupported control preview action "unknown.action"',
      },
    });
  });

  it("returns AUTARCH gap-detection preview for blocked goals", async () => {
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
          goalId: "goal-autarch",
          title: "AUTARCH goal",
          objective: "Find missing capabilities",
          priority: 90,
        },
      },
      {
        id: "evt-goal-status",
        type: "goal.status-updated",
        occurredAt: 2,
        payload: {
          goalId: "goal-autarch",
          status: "blocked",
        },
      },
    ]);

    const result = await runPrometheusControlPreview({
      stateDir,
      action: "autarch.gap-detection",
      maxItems: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("autarch.gap-detection");
    expect(result.payload.mutatesState).toBe(false);
    expect(result.payload.preview).toEqual(
      expect.objectContaining({
        suggestedGapCount: expect.any(Number),
        suggestions: expect.arrayContaining([
          expect.objectContaining({
            goalId: "goal-autarch",
          }),
        ]),
      }),
    );
  });

  it("returns HELIOS trajectory-evaluation preview with computed snapshot", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    const trajectoryStore = createFileHeliosTrajectoryStore(
      path.join(stateDir, "prometheus", "helios-trajectory.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-helios",
        title: "HELIOS goal",
        objective: "Evaluate trajectory",
        priority: 88,
      },
    });
    await trajectoryStore.append({
      goalId: "goal-helios",
      snapshot: {
        at: 2,
        completionRatio: 0.3,
        blockedRatio: 0.1,
        score: 0.5,
      },
    });

    const result = await runPrometheusControlPreview({
      stateDir,
      action: "helios.trajectory-evaluation",
      goalId: "goal-helios",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("helios.trajectory-evaluation");
    expect(result.payload.preview).toEqual(
      expect.objectContaining({
        goalId: "goal-helios",
        goalStatus: "active",
        priorWindowSize: 1,
        computedSnapshot: expect.objectContaining({
          completionRatio: expect.any(Number),
          score: expect.any(Number),
        }),
      }),
    );
  });

  it("returns recursion mutation-evaluation preview with accepted decision", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-control-preview-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.append({
      id: "evt-goal",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "goal-recursion",
        title: "Recursion goal",
        objective: "Evaluate mutation",
        priority: 91,
      },
    });

    const result = await runPrometheusControlPreview({
      stateDir,
      action: "recursion.mutation-evaluation",
      proposal: {
        mutationId: "mut-1",
        title: "Increase planning horizon",
        hypothesis: "improves objective fit",
        risk: "low",
        expectedGain: 0.09,
      },
      baseline: {
        objectiveFit: 0.5,
        stability: 0.75,
        throughput: 0.55,
      },
      candidate: {
        objectiveFit: 0.66,
        stability: 0.76,
        throughput: 0.57,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.action).toBe("recursion.mutation-evaluation");
    expect(result.payload.preview).toEqual(
      expect.objectContaining({
        evaluation: expect.objectContaining({
          mutationId: "mut-1",
          accepted: expect.any(Boolean),
          scoreDelta: expect.any(Number),
        }),
      }),
    );
  });

  it("returns INVALID_REQUEST when recursion preview is missing required snapshots", async () => {
    const result = await runPrometheusControlPreview({
      action: "recursion.mutation-evaluation",
      proposal: {
        mutationId: "mut-1",
        title: "Incomplete proposal",
        hypothesis: "missing snapshots",
      },
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: "baseline and candidate fitness snapshots are required",
      },
    });
  });

  it("fails fast when action metadata diverges from action list", () => {
    expect(() =>
      assertPrometheusControlPreviewActionContract({
        actions: ["autarch.gap-detection"],
        actionMetadata: {
          "autarch.gap-detection": {
            mutatesState: false,
            requiredParams: [],
          },
          "helios.trajectory-evaluation": {
            mutatesState: false,
            requiredParams: ["goalId"],
          },
        },
      }),
    ).toThrow("action list and metadata keys diverged");
  });
});
