import type { PrometheusEvent } from "./events.js";
import type {
  AgentPrimitive,
  CapabilityGap,
  CapitalPrimitive,
  GoalPrimitive,
  InstitutionPrimitive,
  RecursionCycle,
  SynthesizedCapability,
} from "./types.js";
import { assertPrometheusInvariants } from "./invariants.js";

export type GoalNode = GoalPrimitive & {
  childGoalIds: string[];
};

export type PrometheusState = {
  version: 1;
  goals: Record<string, GoalNode>;
  agents: Record<string, AgentPrimitive>;
  capabilityGaps: Record<string, CapabilityGap>;
  synthesizedCapabilities: Record<string, SynthesizedCapability>;
  institutions: Record<string, InstitutionPrimitive>;
  capitalLedger: Record<string, CapitalPrimitive>;
  recursionCycles: RecursionCycle[];
};

export function createInitialPrometheusState(): PrometheusState {
  return {
    version: 1,
    goals: {},
    agents: {},
    capabilityGaps: {},
    synthesizedCapabilities: {},
    institutions: {},
    capitalLedger: {},
    recursionCycles: [],
  };
}

function withUpdated<T extends { updatedAt: number }>(target: T, updatedAt: number): T {
  return { ...target, updatedAt };
}

export function applyPrometheusEvent(
  previous: PrometheusState,
  event: PrometheusEvent,
): PrometheusState {
  const next: PrometheusState = {
    ...previous,
    goals: { ...previous.goals },
    agents: { ...previous.agents },
    capabilityGaps: { ...previous.capabilityGaps },
    synthesizedCapabilities: { ...previous.synthesizedCapabilities },
    institutions: { ...previous.institutions },
    capitalLedger: { ...previous.capitalLedger },
    recursionCycles: [...previous.recursionCycles],
  };

  switch (event.type) {
    case "goal.created": {
      const existing = next.goals[event.payload.goalId];
      if (existing) {
        throw new Error(`Goal "${event.payload.goalId}" already exists.`);
      }
      const createdAt = event.occurredAt;
      next.goals[event.payload.goalId] = {
        id: event.payload.goalId,
        title: event.payload.title,
        objective: event.payload.objective,
        parentGoalId: event.payload.parentGoalId,
        status: "active",
        priority: event.payload.priority ?? 50,
        createdAt,
        updatedAt: createdAt,
        childGoalIds: [],
      };
      if (event.payload.parentGoalId) {
        const parent = next.goals[event.payload.parentGoalId];
        if (!parent) {
          throw new Error(`Parent goal "${event.payload.parentGoalId}" does not exist.`);
        }
        next.goals[event.payload.parentGoalId] = {
          ...parent,
          childGoalIds: [...parent.childGoalIds, event.payload.goalId],
          updatedAt: event.occurredAt,
        };
      }
      break;
    }
    case "goal.status-updated": {
      const goal = next.goals[event.payload.goalId];
      if (!goal) {
        throw new Error(`Goal "${event.payload.goalId}" does not exist.`);
      }
      next.goals[event.payload.goalId] = withUpdated(
        {
          ...goal,
          status: event.payload.status,
        },
        event.occurredAt,
      );
      break;
    }
    case "agent.registered": {
      const existing = next.agents[event.payload.agentId];
      if (existing) {
        throw new Error(`Agent "${event.payload.agentId}" already exists.`);
      }
      next.agents[event.payload.agentId] = {
        id: event.payload.agentId,
        name: event.payload.name,
        kind: event.payload.kind,
        constraints: [...(event.payload.constraints ?? [])],
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      };
      break;
    }
    case "capability-gap.detected": {
      if (!next.goals[event.payload.goalId]) {
        throw new Error(`Goal "${event.payload.goalId}" does not exist.`);
      }
      next.capabilityGaps[event.payload.gapId] = {
        id: event.payload.gapId,
        goalId: event.payload.goalId,
        description: event.payload.description,
        severity: event.payload.severity,
        createdAt: event.occurredAt,
      };
      break;
    }
    case "capability-synthesized.recorded": {
      if (!next.capabilityGaps[event.payload.gapId]) {
        throw new Error(`Capability gap "${event.payload.gapId}" does not exist.`);
      }
      next.synthesizedCapabilities[event.payload.capabilityId] = {
        id: event.payload.capabilityId,
        gapId: event.payload.gapId,
        name: event.payload.name,
        designSpec: event.payload.designSpec,
        status: event.payload.status ?? "proposed",
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      };
      break;
    }
    case "capability-synthesized.status-updated": {
      const existing = next.synthesizedCapabilities[event.payload.capabilityId];
      if (!existing) {
        throw new Error(`Synthesized capability "${event.payload.capabilityId}" does not exist.`);
      }
      next.synthesizedCapabilities[event.payload.capabilityId] = withUpdated(
        {
          ...existing,
          status: event.payload.status,
        },
        event.occurredAt,
      );
      break;
    }
    case "institution.created": {
      next.institutions[event.payload.institutionId] = {
        id: event.payload.institutionId,
        name: event.payload.name,
        mandate: event.payload.mandate,
        authorityModel: event.payload.authorityModel,
        status: "active",
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      };
      break;
    }
    case "institution.status-updated": {
      const existing = next.institutions[event.payload.institutionId];
      if (!existing) {
        throw new Error(`Institution "${event.payload.institutionId}" does not exist.`);
      }
      next.institutions[event.payload.institutionId] = withUpdated(
        {
          ...existing,
          status: event.payload.status,
        },
        event.occurredAt,
      );
      break;
    }
    case "capital.allocated": {
      if (!next.institutions[event.payload.institutionId]) {
        throw new Error(`Institution "${event.payload.institutionId}" does not exist.`);
      }
      next.capitalLedger[event.payload.capitalId] = {
        id: event.payload.capitalId,
        institutionId: event.payload.institutionId,
        form: event.payload.form,
        amount: event.payload.amount,
        unit: event.payload.unit,
        updatedAt: event.occurredAt,
      };
      break;
    }
    case "recursion.cycle-recorded": {
      next.recursionCycles.push({
        ...event.payload,
        occurredAt: event.occurredAt,
      });
      break;
    }
    default: {
      const exhaustive: never = event;
      throw new Error(`Unsupported PROMETHEUS event: ${String(exhaustive)}`);
    }
  }

  assertPrometheusInvariants(next);
  return next;
}

export function replayPrometheusEvents(events: readonly PrometheusEvent[]): PrometheusState {
  return events.reduce(applyPrometheusEvent, createInitialPrometheusState());
}
