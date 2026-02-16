import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SERVER_METHODS_DIR = fileURLToPath(new URL(".", import.meta.url));
const HARNESS_GUARDRAIL_TEST_BASENAME = "prometheus.test-harness-guardrails.test.ts";

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

describe("prometheus test harness guardrails", () => {
  it("avoids direct handleGatewayRequest calls in prometheus test files", async () => {
    const files = await listPrometheusTestFiles(SERVER_METHODS_DIR);
    const violations: string[] = [];
    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8");
      if (content.includes("handleGatewayRequest(")) {
        violations.push(path.basename(filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("avoids direct control handler invocation in prometheus test files", async () => {
    const files = await listPrometheusTestFiles(SERVER_METHODS_DIR);
    const violations: string[] = [];
    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8");
      const hasControlCatalogDirectCall =
        content.includes('prometheusHandlers["prometheus.control.catalog"](') ||
        content.includes('handlers["prometheus.control.catalog"](');
      const hasControlPreviewDirectCall =
        content.includes('prometheusHandlers["prometheus.control.preview"](') ||
        content.includes('handlers["prometheus.control.preview"](');
      if (hasControlCatalogDirectCall || hasControlPreviewDirectCall) {
        violations.push(path.basename(filePath));
      }
    }

    expect(violations).toEqual([]);
  });
});
