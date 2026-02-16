import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileHeliosTrajectoryStore } from "./trajectory-store.js";

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

describe("createFileHeliosTrajectoryStore", () => {
  it("persists snapshots and returns windowed series", async () => {
    const dir = await makeTempDir("prometheus-helios-trajectory-");
    const filePath = path.join(dir, "trajectory.jsonl");
    const store = createFileHeliosTrajectoryStore(filePath);

    await store.appendBatch([
      {
        goalId: "goal-a",
        snapshot: { at: 1, completionRatio: 0.2, blockedRatio: 0.1, score: 0.5 },
      },
      {
        goalId: "goal-a",
        snapshot: { at: 2, completionRatio: 0.25, blockedRatio: 0.1, score: 0.53 },
      },
      {
        goalId: "goal-a",
        snapshot: { at: 3, completionRatio: 0.2, blockedRatio: 0.3, score: 0.34 },
      },
      { goalId: "goal-b", snapshot: { at: 4, completionRatio: 0.8, blockedRatio: 0, score: 0.9 } },
    ]);

    const window = await store.readWindow({
      goalId: "goal-a",
      maxSnapshots: 2,
    });
    expect(window).toEqual([
      { at: 2, completionRatio: 0.25, blockedRatio: 0.1, score: 0.53 },
      { at: 3, completionRatio: 0.2, blockedRatio: 0.3, score: 0.34 },
    ]);
  });

  it("throws precise parse errors for malformed lines", async () => {
    const dir = await makeTempDir("prometheus-helios-trajectory-");
    const filePath = path.join(dir, "trajectory.jsonl");
    const store = createFileHeliosTrajectoryStore(filePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      `${JSON.stringify({ goalId: "goal-a", snapshot: { at: 1, completionRatio: 0.4, blockedRatio: 0, score: 0.7 } })}\n{`,
      "utf8",
    );

    await expect(store.readWindow({ goalId: "goal-a" })).rejects.toThrow("line 2");
  });
});
