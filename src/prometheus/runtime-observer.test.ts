import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentEventPayload } from "../infra/agent-events.js";
import { createFilePrometheusEventStore } from "./event-store.js";
import { createFileHeliosTrajectoryStore } from "./helios/trajectory-store.js";
import { startPrometheusRuntimeObserver } from "./runtime-observer.js";

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

describe("startPrometheusRuntimeObserver", () => {
  it("stays disabled unless explicitly enabled", () => {
    const subscribe = vi.fn(() => () => {});
    const observer = startPrometheusRuntimeObserver({
      enabled: false,
      subscribe,
    });
    expect(observer.enabled).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
    observer.stop();
  });

  it("evaluates trajectories and runs AUTARCH gap detection on lifecycle errors", async () => {
    const dir = await makeTempDir("prometheus-runtime-observer-");
    const eventLogPath = path.join(dir, "events.jsonl");
    const trajectoryLogPath = path.join(dir, "trajectory.jsonl");
    const eventStore = createFilePrometheusEventStore(eventLogPath);
    await eventStore.append({
      id: "e1",
      type: "goal.created",
      occurredAt: 1,
      payload: {
        goalId: "root",
        title: "Root goal",
        objective: "Persist and evaluate trajectory",
      },
    });

    let listener: ((evt: AgentEventPayload) => void) | undefined;
    const subscribe = vi.fn((callback: (evt: AgentEventPayload) => void) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    });
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const observer = startPrometheusRuntimeObserver({
      enabled: true,
      enableAutarchGapDetection: true,
      subscribe,
      eventLogPath,
      trajectoryLogPath,
      rootGoalIds: ["root"],
      logger,
    });

    listener?.({
      runId: "run-1",
      seq: 1,
      stream: "lifecycle",
      ts: 10,
      data: { phase: "end" },
    });
    await observer.flush();

    await eventStore.append({
      id: "e2",
      type: "goal.status-updated",
      occurredAt: 20,
      payload: {
        goalId: "root",
        status: "blocked",
      },
    });
    listener?.({
      runId: "run-2",
      seq: 1,
      stream: "lifecycle",
      ts: 30,
      data: { phase: "error" },
    });
    await observer.flush();

    const trajectoryStore = createFileHeliosTrajectoryStore(trajectoryLogPath);
    const snapshots = await trajectoryStore.readWindow({ goalId: "root" });
    const events = await eventStore.readAll();
    const gapEvents = events.filter((event) => event.type === "capability-gap.detected");
    expect(snapshots).toHaveLength(2);
    expect(gapEvents).toHaveLength(1);
    expect(logger.error).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "AUTARCH gap detection emitted capability gaps.",
      expect.objectContaining({ appendedEventCount: 1 }),
    );
    observer.stop();
  });
});
