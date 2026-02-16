import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
