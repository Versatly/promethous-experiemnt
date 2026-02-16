import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { runPrometheusHandler } from "./prometheus.handler-test-helpers.js";
import { createGoalCreatedEvent } from "./prometheus.test-events.js";
import {
  createPrometheusEventStoreForStateDir,
  createPrometheusTempDirHarness,
} from "./prometheus.test-temp-dir.js";

const { makeTempDir, cleanupTempDirs } = createPrometheusTempDirHarness();

afterEach(async () => {
  await cleanupTempDirs();
});

describe("prometheus adapter summary consistency", () => {
  it("keeps cross-method summary counts consistent", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-consistency-");
    const eventStore = createPrometheusEventStoreForStateDir(stateDir);
    await eventStore.appendBatch([
      createGoalCreatedEvent({
        id: "evt-goal-1",
        occurredAt: 1,
        goalId: "goal-1",
        title: "Goal 1",
        objective: "Ship objective",
      }),
      createGoalCreatedEvent({
        id: "evt-goal-2",
        occurredAt: 2,
        goalId: "goal-2",
        title: "Goal 2",
        objective: "Ship dependency",
        priority: 90,
      }),
      {
        id: "evt-gap-1",
        type: "capability-gap.detected",
        occurredAt: 3,
        payload: {
          gapId: "gap-1",
          goalId: "goal-1",
          description: "missing planner",
          severity: "critical",
        },
      },
      {
        id: "evt-gap-2",
        type: "capability-gap.detected",
        occurredAt: 4,
        payload: {
          gapId: "gap-2",
          goalId: "goal-2",
          description: "missing reviewer",
          severity: "high",
        },
      },
      {
        id: "evt-cap-1",
        type: "capability-synthesized.recorded",
        occurredAt: 5,
        payload: {
          capabilityId: "cap-1",
          gapId: "gap-2",
          name: "reviewer",
          designSpec: "reviewer-design",
          status: "validated",
        },
      },
      {
        id: "evt-inst-1",
        type: "institution.created",
        occurredAt: 6,
        payload: {
          institutionId: "inst-1",
          name: "Institution A",
          mandate: "scale recursive intelligence",
          authorityModel: "council",
        },
      },
      {
        id: "evt-inst-2",
        type: "institution.created",
        occurredAt: 7,
        payload: {
          institutionId: "inst-2",
          name: "Institution B",
          mandate: "archive",
          authorityModel: "council",
        },
      },
      {
        id: "evt-inst-2-status",
        type: "institution.status-updated",
        occurredAt: 8,
        payload: {
          institutionId: "inst-2",
          status: "dormant",
        },
      },
      {
        id: "evt-capital-1",
        type: "capital.allocated",
        occurredAt: 9,
        payload: {
          capitalId: "capital-1",
          institutionId: "inst-1",
          form: "compute",
          amount: 50,
          unit: "gpu-hours",
        },
      },
      {
        id: "evt-capital-2",
        type: "capital.allocated",
        occurredAt: 10,
        payload: {
          capitalId: "capital-2",
          institutionId: "inst-1",
          form: "money",
          amount: 1000,
          unit: "USD",
        },
      },
    ]);

    const context = {} as GatewayRequestContext;

    const statusRespond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.status",
      requestId: "status",
      params: { stateDir },
      respond: statusRespond,
      context,
    });
    const statusPayload = statusRespond.mock.calls[0]?.[1] as {
      summary: {
        capabilityGaps: number;
        unresolvedCapabilityGaps: number;
        synthesizedCapabilities: number;
        institutions: number;
        capitalAllocations: number;
      };
    };

    const autarchRespond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.autarch",
      requestId: "autarch",
      params: { stateDir },
      respond: autarchRespond,
      context,
    });
    const autarchPayload = autarchRespond.mock.calls[0]?.[1] as {
      summary: {
        capabilityGaps: number;
        unresolvedCapabilityGaps: number;
        synthesizedCapabilities: number;
      };
    };

    const monolithRespond = vi.fn();
    await runPrometheusHandler({
      method: "prometheus.monolith",
      requestId: "monolith",
      params: { stateDir },
      respond: monolithRespond,
      context,
    });
    const monolithPayload = monolithRespond.mock.calls[0]?.[1] as {
      summary: {
        institutions: number;
        activeInstitutions: number;
        dormantInstitutions: number;
        dissolvedInstitutions: number;
      };
    };

    expect(statusPayload.summary.capabilityGaps).toBe(autarchPayload.summary.capabilityGaps);
    expect(statusPayload.summary.unresolvedCapabilityGaps).toBe(
      autarchPayload.summary.unresolvedCapabilityGaps,
    );
    expect(statusPayload.summary.synthesizedCapabilities).toBe(
      autarchPayload.summary.synthesizedCapabilities,
    );
    expect(statusPayload.summary.institutions).toBe(monolithPayload.summary.institutions);
    expect(
      monolithPayload.summary.activeInstitutions +
        monolithPayload.summary.dormantInstitutions +
        monolithPayload.summary.dissolvedInstitutions,
    ).toBe(monolithPayload.summary.institutions);
    expect(statusPayload.summary.capitalAllocations).toBe(2);
  });
});
