import { describe, expect, it } from "vitest";
import {
  assertPrometheusControlPreviewActionContract,
  assertPrometheusPlannedMutatingPreviewActionContract,
  buildPrometheusPlannedMutatingPreviewActionPreflight,
  getPrometheusPlannedMutatingPreviewActionMetadata,
  getPrometheusPlannedMutatingPreviewActionPreflight,
  isPrometheusPlannedMutatingPreviewAction,
  listPrometheusPlannedMutatingPreviewActions,
  listPrometheusMutatingPreviewActions,
  PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA,
  PROMETHEUS_CONTROL_PREVIEW_ACTIONS,
  PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA,
  isPrometheusControlPreviewAction,
} from "./prometheus.control-preview.js";

describe("prometheus control preview helpers", () => {
  it("exposes a unique action set and matching type guard", () => {
    const actions = [...PROMETHEUS_CONTROL_PREVIEW_ACTIONS];
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual([
      "autarch.gap-detection",
      "helios.trajectory-evaluation",
      "recursion.mutation-evaluation",
    ]);
    expect(actions.every((action) => isPrometheusControlPreviewAction(action))).toBe(true);
    expect(isPrometheusControlPreviewAction("unknown.action")).toBe(false);
    expect(Object.keys(PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA).toSorted()).toEqual(
      [...actions].toSorted(),
    );
    for (const action of actions) {
      expect(PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA[action].mutatesState).toBe(false);
    }
    expect(
      PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA["autarch.gap-detection"].requiredParams,
    ).toEqual([]);
    expect(
      PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA["helios.trajectory-evaluation"].requiredParams,
    ).toEqual(["goalId"]);
    expect(
      PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA["recursion.mutation-evaluation"].requiredParams,
    ).toEqual(["proposal", "baseline", "candidate"]);
    expect(listPrometheusMutatingPreviewActions()).toEqual([]);
    expect(listPrometheusPlannedMutatingPreviewActions()).toEqual([
      "autarch.gap-detection.commit",
      "helios.trajectory-evaluation.commit",
      "recursion.mutation-evaluation.commit",
    ]);
    expect(isPrometheusPlannedMutatingPreviewAction("autarch.gap-detection.commit")).toBe(true);
    expect(isPrometheusPlannedMutatingPreviewAction("autarch.gap-detection")).toBe(false);
  });

  it("builds planned mutating action preflight messages from metadata", () => {
    const metadata = getPrometheusPlannedMutatingPreviewActionMetadata(
      "autarch.gap-detection.commit",
    );
    expect(metadata).toBeDefined();
    if (!metadata) {
      return;
    }
    const preflight = getPrometheusPlannedMutatingPreviewActionPreflight(
      "autarch.gap-detection.commit",
    );
    expect(preflight).toBeDefined();
    if (!preflight) {
      return;
    }
    expect(
      buildPrometheusPlannedMutatingPreviewActionPreflight({
        action: "autarch.gap-detection.commit",
        metadata,
      }),
    ).toEqual(preflight);
  });

  it("returns planned mutating action preflight only for known actions", () => {
    expect(
      getPrometheusPlannedMutatingPreviewActionPreflight("autarch.gap-detection.commit"),
    ).toEqual(
      expect.objectContaining({
        disabledMessage: expect.stringContaining("autarch.gap-detection.commit"),
        notImplementedMessage: expect.stringContaining("not implemented yet"),
      }),
    );
    expect(getPrometheusPlannedMutatingPreviewActionPreflight("autarch.gap-detection")).toBe(
      undefined,
    );
  });

  it("fails fast when action metadata diverges from action list", () => {
    expect(() =>
      assertPrometheusControlPreviewActionContract({
        actions: ["autarch.gap-detection"],
        actionMetadata: {
          "autarch.gap-detection": {
            mutatesState: false,
            requiredParams: [],
          },
          "helios.trajectory-evaluation": {
            mutatesState: false,
            requiredParams: ["goalId"],
          },
        },
      }),
    ).toThrow("action list and metadata keys diverged");
  });

  it("fails fast when active action metadata has malformed required params", () => {
    expect(() =>
      assertPrometheusControlPreviewActionContract({
        actions: ["autarch.gap-detection"],
        actionMetadata: {
          "autarch.gap-detection": {
            mutatesState: false,
            requiredParams: ["goalId", "goalId"],
          },
        },
      }),
    ).toThrow("invalid required params");
  });

  it("reports mutating preview actions from metadata", () => {
    expect(
      listPrometheusMutatingPreviewActions({
        "autarch.gap-detection": {
          mutatesState: false,
          requiredParams: [],
        },
        "prometheus.control.execute": {
          mutatesState: true,
          requiredParams: ["dryRun"],
        },
      }),
    ).toEqual(["prometheus.control.execute"]);
  });

  it("keeps planned mutating actions disjoint from active preview actions", () => {
    expect(
      Object.keys(PROMETHEUS_PLANNED_MUTATING_PREVIEW_ACTION_METADATA).some((action) =>
        PROMETHEUS_CONTROL_PREVIEW_ACTIONS.includes(action as never),
      ),
    ).toBe(false);
    expect(() =>
      assertPrometheusPlannedMutatingPreviewActionContract({
        activeActions: ["autarch.gap-detection"],
        plannedMutatingActionMetadata: {
          "autarch.gap-detection": {
            mutatesState: true,
            enabled: false,
            enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
            requiredParams: [],
            reason: "invalid overlap",
          },
        },
      }),
    ).toThrow("overlaps active actions");
  });

  it("fails fast when planned mutating action metadata has malformed required params", () => {
    expect(() =>
      assertPrometheusPlannedMutatingPreviewActionContract({
        activeActions: [],
        plannedMutatingActionMetadata: {
          "autarch.gap-detection.commit": {
            mutatesState: true,
            enabled: false,
            enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
            requiredParams: ["goalId", "goalId"],
            reason: "invalid params",
          },
        },
      }),
    ).toThrow("invalid required params");
  });

  it("fails fast when planned mutating action metadata has blank reason", () => {
    expect(() =>
      assertPrometheusPlannedMutatingPreviewActionContract({
        activeActions: [],
        plannedMutatingActionMetadata: {
          "autarch.gap-detection.commit": {
            mutatesState: true,
            enabled: false,
            enableEnvVar: "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
            requiredParams: ["goalId"],
            reason: " ",
          },
        },
      }),
    ).toThrow("invalid reason");
  });
});
