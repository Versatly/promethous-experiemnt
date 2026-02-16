import { describe, expect, it } from "vitest";
import {
  formatPrometheusMissingRequiredParamsMessage,
  formatPrometheusRequiredParamsMessage,
  hasPrometheusInvalidRequiredParams,
  formatPlannedMutatingActionDisabledMessage,
  formatPlannedMutatingActionNotImplementedMessage,
  formatPlannedMutatingMethodDisabledMessage,
  formatPlannedMutatingMethodNotImplementedMessage,
  resolvePrometheusMissingRequiredParams,
} from "./prometheus.preflight-guards.js";

describe("prometheus preflight guardrail messages", () => {
  it("formats planned mutating method guardrail messages", () => {
    expect(
      formatPlannedMutatingMethodDisabledMessage(
        "prometheus.control.execute",
        "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
      ),
    ).toBe(
      'planned mutating method "prometheus.control.execute" is disabled (set OPENCLAW_PROMETHEUS_MUTATING_CONTROLS=1 to enable guardrail preflight)',
    );
    expect(formatPlannedMutatingMethodNotImplementedMessage("prometheus.control.execute")).toBe(
      'planned mutating method "prometheus.control.execute" is not implemented yet',
    );
  });

  it("formats planned mutating action guardrail messages", () => {
    expect(
      formatPlannedMutatingActionDisabledMessage(
        "autarch.gap-detection.commit",
        "OPENCLAW_PROMETHEUS_MUTATING_CONTROLS",
      ),
    ).toBe(
      'Planned mutating action "autarch.gap-detection.commit" is disabled (set OPENCLAW_PROMETHEUS_MUTATING_CONTROLS=1 to enable guardrail preflight)',
    );
    expect(formatPlannedMutatingActionNotImplementedMessage("autarch.gap-detection.commit")).toBe(
      'Planned mutating action "autarch.gap-detection.commit" is not implemented yet',
    );
  });

  it("resolves missing required params and formats reusable validation messages", () => {
    expect(
      resolvePrometheusMissingRequiredParams({
        params: {
          goalId: "   ",
          baseline: null,
          candidate: { objectiveFit: 0.6 },
        },
        requiredParams: ["goalId", "baseline", "candidate"],
      }),
    ).toEqual(["goalId", "baseline"]);
    expect(
      formatPrometheusRequiredParamsMessage({
        kind: "action",
        name: "recursion.mutation-evaluation",
        requiredParams: ["proposal", "baseline", "candidate"],
      }),
    ).toBe('action "recursion.mutation-evaluation" requires params: proposal, baseline, candidate');
    expect(
      formatPrometheusMissingRequiredParamsMessage({
        kind: "action",
        name: "recursion.mutation-evaluation",
        missingParams: ["baseline", "candidate"],
      }),
    ).toBe(
      'action "recursion.mutation-evaluation" is missing required params: baseline, candidate',
    );
    expect(hasPrometheusInvalidRequiredParams(["proposal", "baseline", "candidate"])).toBe(false);
    expect(hasPrometheusInvalidRequiredParams(["proposal", "proposal"])).toBe(true);
    expect(hasPrometheusInvalidRequiredParams(["proposal", ""])).toBe(true);
    expect(hasPrometheusInvalidRequiredParams(["proposal", "   "])).toBe(true);
  });
});
