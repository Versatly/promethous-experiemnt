import { describe, expect, it } from "vitest";
import {
  formatPlannedMutatingActionDisabledMessage,
  formatPlannedMutatingActionNotImplementedMessage,
  formatPlannedMutatingMethodDisabledMessage,
  formatPlannedMutatingMethodNotImplementedMessage,
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
});
