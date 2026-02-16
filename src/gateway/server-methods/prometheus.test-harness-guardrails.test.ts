import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SERVER_METHODS_DIR = fileURLToPath(new URL(".", import.meta.url));
const HARNESS_GUARDRAIL_TEST_BASENAME = "prometheus.test-harness-guardrails.test.ts";
const OBSERVER_STORE_WIRING_EXEMPT_FILES = new Set(["prometheus.test-temp-dir.test.ts"]);
const GOAL_FIXTURE_EXEMPT_FILES = new Set([
  "prometheus.test-events.test.ts",
  "prometheus.test-temp-dir.test.ts",
]);

async function listPrometheusTestFiles(targetDir: string): Promise<string[]> {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        return listPrometheusTestFiles(fullPath);
      }
      if (!entry.isFile()) {
        return [];
      }
      if (!entry.name.startsWith("prometheus") || !entry.name.endsWith(".test.ts")) {
        return [];
      }
      if (entry.name === HARNESS_GUARDRAIL_TEST_BASENAME) {
        return [];
      }
      return [fullPath];
    }),
  );
  return nested.flat();
}

async function listFilesContainingNeedles(args: {
  files: string[];
  needles: readonly string[];
}): Promise<string[]> {
  const violations: string[] = [];
  for (const filePath of args.files) {
    const content = await fs.readFile(filePath, "utf8");
    if (args.needles.some((needle) => content.includes(needle))) {
      violations.push(path.basename(filePath));
    }
  }
  return violations.toSorted();
}

describe("prometheus test harness guardrails", () => {
  it("avoids direct handleGatewayRequest calls in prometheus test files", async () => {
    const files = await listPrometheusTestFiles(SERVER_METHODS_DIR);
    const violations = await listFilesContainingNeedles({
      files,
      needles: ["handleGatewayRequest("],
    });

    expect(violations).toEqual([]);
  });

  it("avoids direct control handler invocation in prometheus test files", async () => {
    const files = await listPrometheusTestFiles(SERVER_METHODS_DIR);
    const violations = await listFilesContainingNeedles({
      files,
      needles: [
        'prometheusHandlers["prometheus.control.catalog"](',
        'handlers["prometheus.control.catalog"](',
        'prometheusHandlers["prometheus.control.preview"](',
        'handlers["prometheus.control.preview"](',
      ],
    });

    expect(violations).toEqual([]);
  });

  it("avoids direct observer store path wiring in prometheus test files", async () => {
    const files = (await listPrometheusTestFiles(SERVER_METHODS_DIR)).filter(
      (filePath) => !OBSERVER_STORE_WIRING_EXEMPT_FILES.has(path.basename(filePath)),
    );
    const violations = await listFilesContainingNeedles({
      files,
      needles: [
        "createFilePrometheusEventStore(",
        "createFileHeliosTrajectoryStore(",
        'path.join(stateDir, "prometheus", "events.jsonl")',
        'path.join(stateDir, "prometheus", "helios-trajectory.jsonl")',
      ],
    });

    expect(violations).toEqual([]);
  });

  it("uses shared goal fixtures instead of inline goal.created payload blocks", async () => {
    const files = (await listPrometheusTestFiles(SERVER_METHODS_DIR)).filter(
      (filePath) => !GOAL_FIXTURE_EXEMPT_FILES.has(path.basename(filePath)),
    );
    const violations = await listFilesContainingNeedles({
      files,
      needles: ['type: "goal.created"'],
    });

    expect(violations).toEqual([]);
  });
});
