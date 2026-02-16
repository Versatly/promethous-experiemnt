import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { createFilePrometheusEventStore } from "../../prometheus/index.js";
import { prometheusHandlers } from "./prometheus.js";
import { createPrometheusTempDirHarness } from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheusHandlers.prometheus.monolith", () => {
  it("returns institution capital telemetry and allocation preview", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-monolith-");
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
        id: "evt-inst-1",
        type: "institution.created",
        occurredAt: 2,
        payload: {
          institutionId: "inst-1",
          name: "Prometheus Lab",
          mandate: "scale recursive intelligence",
          authorityModel: "council",
        },
      },
      {
        id: "evt-inst-2",
        type: "institution.created",
        occurredAt: 3,
        payload: {
          institutionId: "inst-2",
          name: "Dormant Lab",
          mandate: "archive",
          authorityModel: "council",
        },
      },
      {
        id: "evt-inst-2-status",
        type: "institution.status-updated",
        occurredAt: 4,
        payload: {
          institutionId: "inst-2",
          status: "dormant",
        },
      },
      {
        id: "evt-cap-1",
        type: "capital.allocated",
        occurredAt: 5,
        payload: {
          capitalId: "capital-1",
          institutionId: "inst-1",
          form: "compute",
          amount: 100,
          unit: "gpu-hours",
        },
      },
      {
        id: "evt-cap-2",
        type: "capital.allocated",
        occurredAt: 6,
        payload: {
          capitalId: "capital-2",
          institutionId: "inst-1",
          form: "money",
          amount: 250,
          unit: "USD",
        },
      },
    ]);

    const respond = vi.fn();
    await prometheusHandlers["prometheus.monolith"]({
      req: { type: "req", id: "4", method: "prometheus.monolith" },
      params: {
        stateDir,
        demands: [
          {
            goalId: "goal-root",
            form: "compute",
            requiredAmount: 80,
            priority: 90,
          },
        ],
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        summary: expect.objectContaining({
          institutions: 2,
          activeInstitutions: 1,
          dormantInstitutions: 1,
        }),
        totalsByForm: expect.objectContaining({
          compute: 100,
          money: 250,
        }),
        institutions: expect.arrayContaining([
          expect.objectContaining({
            institutionId: "inst-1",
            capital: expect.objectContaining({
              compute: 100,
              money: 250,
            }),
          }),
        ]),
        allocationPreview: expect.objectContaining({
          requestedDemands: 1,
          allocations: [
            expect.objectContaining({
              goalId: "goal-root",
              institutionId: "inst-1",
              form: "compute",
              amount: 80,
            }),
          ],
          governanceChecks: [
            expect.objectContaining({
              decision: expect.objectContaining({
                allowed: true,
                requiredApprovals: expect.arrayContaining(["treasury-council"]),
              }),
            }),
          ],
        }),
      }),
      undefined,
    );
  });
});
