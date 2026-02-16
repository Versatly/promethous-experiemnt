import fs from "node:fs/promises";
import path from "node:path";
import type { GoalTrajectorySnapshot } from "./trajectory.js";

export type GoalTrajectoryRecord = {
  goalId: string;
  snapshot: GoalTrajectorySnapshot;
};

export type GoalTrajectoryWindowQuery = {
  goalId: string;
  maxSnapshots?: number;
  sinceAt?: number;
};

export type HeliosTrajectoryStore = {
  append: (record: GoalTrajectoryRecord) => Promise<void>;
  appendBatch: (records: readonly GoalTrajectoryRecord[]) => Promise<void>;
  readWindow: (query: GoalTrajectoryWindowQuery) => Promise<GoalTrajectorySnapshot[]>;
};

function serializeRecord(record: GoalTrajectoryRecord): string {
  return `${JSON.stringify(record)}\n`;
}

function assertGoalTrajectoryRecord(value: unknown): asserts value is GoalTrajectoryRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid trajectory record shape.");
  }
  const candidate = value as Partial<GoalTrajectoryRecord>;
  if (typeof candidate.goalId !== "string" || !candidate.goalId.trim()) {
    throw new Error("Trajectory record goalId is required.");
  }
  if (!candidate.snapshot || typeof candidate.snapshot !== "object") {
    throw new Error("Trajectory record snapshot is required.");
  }
  const snapshot = candidate.snapshot as Partial<GoalTrajectorySnapshot>;
  if (
    typeof snapshot.at !== "number" ||
    typeof snapshot.completionRatio !== "number" ||
    typeof snapshot.blockedRatio !== "number" ||
    typeof snapshot.score !== "number"
  ) {
    throw new Error("Trajectory snapshot has invalid numeric fields.");
  }
}

async function ensureDirForFile(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function createFileHeliosTrajectoryStore(filePath: string): HeliosTrajectoryStore {
  const absolutePath = path.resolve(filePath);

  async function readAllRecords(): Promise<GoalTrajectoryRecord[]> {
    let raw = "";
    try {
      raw = await fs.readFile(absolutePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const records: GoalTrajectoryRecord[] = [];
    const lines = raw.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]?.trim();
      if (!line) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(
          `Failed to parse HELIOS trajectory log line ${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
      assertGoalTrajectoryRecord(parsed);
      records.push(parsed);
    }
    return records;
  }

  return {
    append: async (record) => {
      assertGoalTrajectoryRecord(record);
      await ensureDirForFile(absolutePath);
      await fs.appendFile(absolutePath, serializeRecord(record), "utf8");
    },

    appendBatch: async (records) => {
      if (records.length === 0) {
        return;
      }
      for (const record of records) {
        assertGoalTrajectoryRecord(record);
      }
      await ensureDirForFile(absolutePath);
      const payload = records.map(serializeRecord).join("");
      await fs.appendFile(absolutePath, payload, "utf8");
    },

    readWindow: async (query) => {
      const records = await readAllRecords();
      const maxSnapshots =
        typeof query.maxSnapshots === "number" ? Math.max(1, Math.floor(query.maxSnapshots)) : 100;
      const sinceAt =
        typeof query.sinceAt === "number" && Number.isFinite(query.sinceAt) ? query.sinceAt : 0;
      const filtered = records
        .filter((record) => record.goalId === query.goalId && record.snapshot.at >= sinceAt)
        .map((record) => record.snapshot)
        .toSorted((left, right) => left.at - right.at);
      if (filtered.length <= maxSnapshots) {
        return filtered;
      }
      return filtered.slice(filtered.length - maxSnapshots);
    },
  };
}
