import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PrometheusEvent } from "./events.js";
import { createFilePrometheusEventStore } from "./event-store.js";

const cleanupDirs = new Set<string>();

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  cleanupDirs.add(dir);
  return dir;
}

function buildEvent(id: string, occurredAt: number): PrometheusEvent {
  return {
    id,
    type: "goal.created",
    occurredAt,
    payload: {
      goalId: `goal-${id}`,
      title: `Goal ${id}`,
      objective: "Persist event stream",
    },
  };
}

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  cleanupDirs.clear();
});

describe("createFilePrometheusEventStore", () => {
  it("appends and reads events from newline-delimited log", async () => {
    const dir = await makeTempDir("prometheus-store-");
    const logFile = path.join(dir, "events.jsonl");
    const store = createFilePrometheusEventStore(logFile);
    const first = buildEvent("1", 1);
    const second = buildEvent("2", 2);

    await store.append(first);
    await store.append(second);

    const loaded = await store.readAll();
    expect(loaded).toEqual([first, second]);
  });

  it("supports batch append and empty store reads", async () => {
    const dir = await makeTempDir("prometheus-store-");
    const logFile = path.join(dir, "events.jsonl");
    const store = createFilePrometheusEventStore(logFile);

    expect(await store.readAll()).toEqual([]);

    const batch = [buildEvent("1", 1), buildEvent("2", 2), buildEvent("3", 3)];
    await store.appendBatch(batch);

    const loaded = await store.readAll();
    expect(loaded).toEqual(batch);
  });

  it("throws a precise parse error for malformed lines", async () => {
    const dir = await makeTempDir("prometheus-store-");
    const logFile = path.join(dir, "events.jsonl");
    const store = createFilePrometheusEventStore(logFile);

    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await fs.writeFile(
      logFile,
      `{"id":"ok","type":"goal.created","occurredAt":1,"payload":{}}\n{`,
      "utf8",
    );

    await expect(store.readAll()).rejects.toThrow("line 2");
  });
});
