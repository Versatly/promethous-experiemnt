import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFilePrometheusEventStore } from "../event-store.js";
import { runAutarchGapDetectionCycle } from "./cycle.js";

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

describe("runAutarchGapDetectionCycle", () => {
  it("appends new capability-gap events for blocked failed paths", async () => {
    const dir = await makeTempDir("prometheus-autarch-cycle-");
    const store = createFilePrometheusEventStore(path.join(dir, "events.jsonl"));
    await store.appendBatch([
      {
        id: "evt-1",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-root",
          title: "Root goal",
          objective: "Ship recursive planner",
          priority: 100,
        },
      },
      {
        id: "evt-2",
        type: "goal.status-updated",
        occurredAt: 2,
        payload: {
          goalId: "goal-root",
          status: "blocked",
        },
      },
    ]);

    const first = await runAutarchGapDetectionCycle({
      eventStore: store,
      now: 100,
      actorAgentId: "agent-main",
    });
    expect(first.appendedEventCount).toBe(1);
    expect(first.suggestions[0]?.goalId).toBe("goal-root");

    const second = await runAutarchGapDetectionCycle({
      eventStore: store,
      now: 110,
      actorAgentId: "agent-main",
    });
    expect(second.appendedEventCount).toBe(0);
  });
});
