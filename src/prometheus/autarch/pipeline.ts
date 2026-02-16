import type { PrometheusEvent } from "../events.js";
import {
  advanceSynthesisWorkflow,
  buildSynthesisWorkflowEvents,
  createSynthesisWorkflow,
  type SynthesisIntegrationDecision,
  type SynthesisWorkflow,
} from "./workflow.js";

export type DeterministicSynthesisWorkflowPlan = {
  workflowId: string;
  gapId: string;
  capabilityId: string;
  capabilityName: string;
  proposalSummary: string;
  designSpec: string;
  validationPassed: boolean;
  validationReport: string;
  integrationDecision: SynthesisIntegrationDecision;
  integrationReason: string;
  startAt: number;
  actorAgentId?: string;
};

export type DeterministicSynthesisWorkflowResult = {
  workflow: SynthesisWorkflow;
  events: PrometheusEvent[];
};

function collectTransitionEvents(params: {
  previous: SynthesisWorkflow;
  next: SynthesisWorkflow;
  actorAgentId?: string;
}): PrometheusEvent[] {
  return buildSynthesisWorkflowEvents({
    previous: params.previous,
    next: params.next,
    actorAgentId: params.actorAgentId,
  });
}

export function runDeterministicSynthesisWorkflow(
  plan: DeterministicSynthesisWorkflowPlan,
): DeterministicSynthesisWorkflowResult {
  const events: PrometheusEvent[] = [];
  const created = createSynthesisWorkflow({
    workflowId: plan.workflowId,
    gapId: plan.gapId,
    createdAt: plan.startAt,
  });

  const proposed = advanceSynthesisWorkflow(created, {
    type: "proposal.accepted",
    at: plan.startAt + 1,
    capabilityId: plan.capabilityId,
    capabilityName: plan.capabilityName,
    summary: plan.proposalSummary,
  });
  events.push(
    ...collectTransitionEvents({
      previous: created,
      next: proposed,
      actorAgentId: plan.actorAgentId,
    }),
  );

  const designed = advanceSynthesisWorkflow(proposed, {
    type: "design.committed",
    at: plan.startAt + 2,
    designSpec: plan.designSpec,
  });

  const validated = advanceSynthesisWorkflow(designed, {
    type: "validation.recorded",
    at: plan.startAt + 3,
    passed: plan.validationPassed,
    report: plan.validationReport,
  });
  events.push(
    ...collectTransitionEvents({
      previous: designed,
      next: validated,
      actorAgentId: plan.actorAgentId,
    }),
  );

  const completed = advanceSynthesisWorkflow(validated, {
    type: "integration.decided",
    at: plan.startAt + 4,
    decision: plan.integrationDecision,
    reason: plan.integrationReason,
  });
  events.push(
    ...collectTransitionEvents({
      previous: validated,
      next: completed,
      actorAgentId: plan.actorAgentId,
    }),
  );

  return {
    workflow: completed,
    events,
  };
}
