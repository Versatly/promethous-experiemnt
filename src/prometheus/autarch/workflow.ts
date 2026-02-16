import type { PrometheusEvent } from "../events.js";
import type { SynthesizedCapabilityStatus } from "../types.js";

export type SynthesisWorkflowStage =
  | "proposal"
  | "design"
  | "validation"
  | "integration-decision"
  | "completed";

export type SynthesisIntegrationDecision = "integrate" | "reject";

export type SynthesisWorkflow = {
  workflowId: string;
  gapId: string;
  stage: SynthesisWorkflowStage;
  capabilityId?: string;
  capabilityName?: string;
  proposalSummary?: string;
  designSpec?: string;
  validationPassed?: boolean;
  validationReport?: string;
  integrationDecision?: SynthesisIntegrationDecision;
  status: SynthesizedCapabilityStatus;
  history: Array<{
    stage: SynthesisWorkflowStage;
    at: number;
    note: string;
  }>;
};

export type SynthesisWorkflowTransition =
  | {
      type: "proposal.accepted";
      at: number;
      capabilityId: string;
      capabilityName: string;
      summary: string;
    }
  | {
      type: "design.committed";
      at: number;
      designSpec: string;
    }
  | {
      type: "validation.recorded";
      at: number;
      passed: boolean;
      report: string;
    }
  | {
      type: "integration.decided";
      at: number;
      decision: SynthesisIntegrationDecision;
      reason: string;
    };

function appendHistory(
  workflow: SynthesisWorkflow,
  stage: SynthesisWorkflowStage,
  at: number,
  note: string,
): SynthesisWorkflow {
  return {
    ...workflow,
    stage,
    history: [...workflow.history, { stage, at, note }],
  };
}

function assertStage(
  workflow: SynthesisWorkflow,
  expected: SynthesisWorkflowStage,
  action: string,
): void {
  if (workflow.stage !== expected) {
    throw new Error(
      `Cannot execute "${action}" from stage "${workflow.stage}"; expected "${expected}".`,
    );
  }
}

export function createSynthesisWorkflow(params: {
  workflowId: string;
  gapId: string;
  createdAt: number;
}): SynthesisWorkflow {
  return {
    workflowId: params.workflowId,
    gapId: params.gapId,
    stage: "proposal",
    status: "proposed",
    history: [
      {
        stage: "proposal",
        at: params.createdAt,
        note: "workflow created",
      },
    ],
  };
}

export function advanceSynthesisWorkflow(
  workflow: SynthesisWorkflow,
  transition: SynthesisWorkflowTransition,
): SynthesisWorkflow {
  switch (transition.type) {
    case "proposal.accepted": {
      assertStage(workflow, "proposal", transition.type);
      return appendHistory(
        {
          ...workflow,
          capabilityId: transition.capabilityId,
          capabilityName: transition.capabilityName,
          proposalSummary: transition.summary,
          status: "proposed",
        },
        "design",
        transition.at,
        "proposal accepted",
      );
    }
    case "design.committed": {
      assertStage(workflow, "design", transition.type);
      return appendHistory(
        {
          ...workflow,
          designSpec: transition.designSpec,
        },
        "validation",
        transition.at,
        "design committed",
      );
    }
    case "validation.recorded": {
      assertStage(workflow, "validation", transition.type);
      return appendHistory(
        {
          ...workflow,
          validationPassed: transition.passed,
          validationReport: transition.report,
          status: transition.passed ? "validated" : "proposed",
        },
        "integration-decision",
        transition.at,
        transition.passed ? "validation passed" : "validation failed",
      );
    }
    case "integration.decided": {
      assertStage(workflow, "integration-decision", transition.type);
      if (transition.decision === "integrate" && workflow.validationPassed !== true) {
        throw new Error("Cannot integrate synthesized capability before successful validation.");
      }
      return appendHistory(
        {
          ...workflow,
          integrationDecision: transition.decision,
          status: transition.decision === "integrate" ? "integrated" : "rejected",
        },
        "completed",
        transition.at,
        transition.reason,
      );
    }
    default: {
      const exhaustive: never = transition;
      throw new Error(`Unsupported synthesis transition: ${String(exhaustive)}`);
    }
  }
}

export function buildSynthesisWorkflowEvents(params: {
  previous: SynthesisWorkflow;
  next: SynthesisWorkflow;
  actorAgentId?: string;
}): PrometheusEvent[] {
  const events: PrometheusEvent[] = [];
  if (
    params.previous.stage === "proposal" &&
    params.next.stage === "design" &&
    params.next.capabilityId &&
    params.next.capabilityName
  ) {
    const occurredAt = params.next.history[params.next.history.length - 1]?.at ?? Date.now();
    events.push({
      id: `evt:capability-synthesized:${params.next.capabilityId}`,
      type: "capability-synthesized.recorded",
      occurredAt,
      actorAgentId: params.actorAgentId,
      payload: {
        capabilityId: params.next.capabilityId,
        gapId: params.next.gapId,
        name: params.next.capabilityName,
        designSpec: params.next.proposalSummary ?? "proposal accepted",
        status: "proposed",
      },
    });
  }

  if (
    params.previous.stage === "validation" &&
    params.next.stage === "integration-decision" &&
    params.next.validationPassed &&
    params.next.capabilityId
  ) {
    const occurredAt = params.next.history[params.next.history.length - 1]?.at ?? Date.now();
    events.push({
      id: `evt:capability-status:${params.next.capabilityId}:validated:${occurredAt}`,
      type: "capability-synthesized.status-updated",
      occurredAt,
      actorAgentId: params.actorAgentId,
      payload: {
        capabilityId: params.next.capabilityId,
        status: "validated",
      },
    });
  }

  if (params.next.stage === "completed" && params.next.capabilityId) {
    const occurredAt = params.next.history[params.next.history.length - 1]?.at ?? Date.now();
    events.push({
      id: `evt:capability-status:${params.next.capabilityId}:${params.next.status}:${occurredAt}`,
      type: "capability-synthesized.status-updated",
      occurredAt,
      actorAgentId: params.actorAgentId,
      payload: {
        capabilityId: params.next.capabilityId,
        status: params.next.status,
      },
    });
  }

  return events;
}
