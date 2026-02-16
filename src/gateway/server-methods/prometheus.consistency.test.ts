import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { createFilePrometheusEventStore } from "../../prometheus/index.js";
import { PROMETHEUS_GATEWAY_METHOD_METADATA } from "./prometheus-methods.js";
import {
  PROMETHEUS_CONTROL_PREVIEW_ACTIONS,
  PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
} from "./prometheus.control-preview.js";
import { prometheusHandlers } from "./prometheus.js";

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

describe("prometheus adapter summary consistency", () => {
  it("keeps cross-method summary counts consistent", async () => {
    const stateDir = await makeTempDir("gateway-prometheus-consistency-");
    const eventStore = createFilePrometheusEventStore(
      path.join(stateDir, "prometheus", "events.jsonl"),
    );
    await eventStore.appendBatch([
      {
        id: "evt-goal-1",
        type: "goal.created",
        occurredAt: 1,
        payload: {
          goalId: "goal-1",
          title: "Goal 1",
          objective: "Ship objective",
          priority: 100,
        },
      },
      {
        id: "evt-goal-2",
        type: "goal.created",
        occurredAt: 2,
        payload: {
          goalId: "goal-2",
          title: "Goal 2",
          objective: "Ship dependency",
          priority: 90,
        },
      },
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
    await prometheusHandlers["prometheus.status"]({
      req: { type: "req", id: "status", method: "prometheus.status" },
      params: { stateDir },
      client: null,
      isWebchatConnect: () => false,
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
    await prometheusHandlers["prometheus.autarch"]({
      req: { type: "req", id: "autarch", method: "prometheus.autarch" },
      params: { stateDir },
      client: null,
      isWebchatConnect: () => false,
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
    await prometheusHandlers["prometheus.monolith"]({
      req: { type: "req", id: "monolith", method: "prometheus.monolith" },
      params: { stateDir },
      client: null,
      isWebchatConnect: () => false,
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

  it("keeps control catalog response aligned with method/action metadata", async () => {
    const respond = vi.fn();
    await prometheusHandlers["prometheus.control.catalog"]({
      req: { type: "req", id: "control-catalog", method: "prometheus.control.catalog" },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(true, expect.any(Object), undefined);
    const payload = respond.mock.calls[0]?.[1] as {
      summary: {
        totalMethods: number;
        readMethods: number;
        writeMethods: number;
        mutatingMethods: number;
        previewActions: number;
        mutatingPreviewActions: number;
      };
      guardrails: {
        mutationsEnabled: boolean;
        enableEnvVar: string;
        mutatingMethods: string[];
        mutatingPreviewActions: string[];
      };
      methods: Array<{ method: string; access: string; mutatesState: boolean }>;
      controlPreview: {
        method: string;
        actions: Array<{
          action: string;
          mutatesState: boolean;
          requiredParams: string[];
        }>;
      };
    };
    const methodMapFromCatalog = Object.fromEntries(
      payload.methods.map((methodEntry) => [
        methodEntry.method,
        {
          access: methodEntry.access,
          mutatesState: methodEntry.mutatesState,
        },
      ]),
    );
    expect(methodMapFromCatalog).toEqual(PROMETHEUS_GATEWAY_METHOD_METADATA);
    expect(payload.controlPreview.method).toBe("prometheus.control.preview");
    expect(payload.controlPreview.actions).toHaveLength(PROMETHEUS_CONTROL_PREVIEW_ACTIONS.length);
    expect(payload.summary.totalMethods).toBe(payload.methods.length);
    expect(payload.summary.readMethods + payload.summary.writeMethods).toBe(payload.methods.length);
    expect(payload.summary.mutatingMethods).toBe(
      payload.methods.filter((method) => method.mutatesState).length,
    );
    expect(payload.summary.previewActions).toBe(payload.controlPreview.actions.length);
    expect(payload.summary.mutatingPreviewActions).toBe(
      payload.controlPreview.actions.filter((action) => action.mutatesState).length,
    );
    expect(payload.guardrails.enableEnvVar).toBe("OPENCLAW_PROMETHEUS_MUTATING_CONTROLS");
    expect(payload.guardrails.mutatingMethods).toEqual(
      payload.methods
        .filter((method) => method.mutatesState)
        .map((method) => method.method)
        .toSorted(),
    );
    expect(payload.guardrails.mutatingPreviewActions).toEqual(
      payload.controlPreview.actions
        .filter((action) => action.mutatesState)
        .map((action) => action.action)
        .toSorted(),
    );
    expect(payload.guardrails.mutationsEnabled).toBe(false);

    for (const action of PROMETHEUS_CONTROL_PREVIEW_ACTIONS) {
      expect(payload.controlPreview.actions).toContainEqual(
        expect.objectContaining({
          action,
          mutatesState: PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[action].mutatesState,
          requiredParams: [...PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[action].requiredParams],
        }),
      );
    }
  });
});
