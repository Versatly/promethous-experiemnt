import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFilePrometheusEventStore } from "../../prometheus/index.js";
import { runPrometheusHandler } from "./prometheus.handler-test-helpers.js";
import { createPrometheusTempDirHarness } from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheusHandlers.prometheus.autarch", () => {
  it("returns capability synthesis telemetry and filtered gap views", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-autarch-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-goal",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-root",
          title: "Root objective",
          objective: "ship system",
          priority: 100,
        },
      },
      {
        id: "evt-gap-critical",
        type: "capability-gap.detected",
        occurredAt: 2,
        payload: {
          gapId: "gap-critical",
          goalId: "goal-root",
          description: "critical missing capability",
          severity: "critical",
        },
      },
      {
        id: "evt-gap-medium",
        type: "capability-gap.detected",
        occurredAt: 3,
        payload: {
          gapId: "gap-medium",
          goalId: "goal-root",
          description: "medium missing capability",
          severity: "medium",
        },
      },
      {
        id: "evt-capability",
        type: "capability-synthesized.recorded",
        occurredAt: 4,
        payload: {
          capabilityId: "cap-1",
          gapId: "gap-medium",
          name: "Planner capability",
          designSpec: "design",
          status: "validated",
        },
      },
    ]);

    const respond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.autarch",
      requestId: "autarch-1",
      params: {
        stateDir,
        severity: "critical",
      },
      respond,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.objectContaining({
          capabilityGaps: 2,
          unresolvedCapabilityGaps: 2,
          criticalUnresolvedCapabilityGaps: 1,
          synthesizedCapabilities: 1,
          synthesizedByStatus: expect.objectContaining({
            validated: 1,
          }),
        }),
        graph: expect.objectContaining({
          capabilityNodes: 1,
        }),
        goalsWithUnresolvedGaps: ["goal-root"],
        gaps: [
          expect.objectContaining({
            gapId: "gap-critical",
            severity: "critical",
          }),
        ],
        capabilities: [expect.objectContaining({ capabilityId: "cap-1", status: "validated" })],
      }),
      undefined,
    );
  });
});
