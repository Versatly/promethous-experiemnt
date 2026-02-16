import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createFileHeliosTrajectoryStore,
  createFilePrometheusEventStore,
} from "../../prometheus/index.js";

export function resolvePrometheusEventLogPath(stateDir: string): string {
  return path.join(stateDir, "prometheus", "events.jsonl");
}

export function resolvePrometheusTrajectoryLogPath(stateDir: string): string {
  return path.join(stateDir, "prometheus", "helios-trajectory.jsonl");
}

export function createPrometheusEventStoreForStateDir(stateDir: string) {
  return createFilePrometheusEventStore(resolvePrometheusEventLogPath(stateDir));
}

export function createPrometheusTrajectoryStoreForStateDir(stateDir: string) {
  return createFileHeliosTrajectoryStore(resolvePrometheusTrajectoryLogPath(stateDir));
}

export function createPrometheusTempDirHarness() {
  const cleanupDirs = new Set<string>();

  const makeTempDir = async (prefix: string): Promise<string> => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    cleanupDirs.add(dir);
    return dir;
  };

  const cleanupTempDirs = async (): Promise<void> => {
    for (const dir of cleanupDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    cleanupDirs.clear();
  };

  return {
    makeTempDir,
    cleanupTempDirs,
  };
}
