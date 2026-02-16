import type {
  AgentKind,
  CapabilityGapSeverity,
  GoalStatus,
  RecursionCycle,
  SynthesizedCapabilityStatus,
} from "./types.js";

export type PrometheusEventType =
  | "goal.created"
  | "goal.status-updated"
  | "agent.registered"
  | "capability-gap.detected"
  | "capability-synthesized.recorded"
  | "capability-synthesized.status-updated"
  | "institution.created"
  | "institution.status-updated"
  | "capital.allocated"
  | "recursion.cycle-recorded";

export type BasePrometheusEvent<TType extends PrometheusEventType, TPayload> = {
  id: string;
  type: TType;
  occurredAt: number;
  actorAgentId?: string;
  payload: TPayload;
};

export type GoalCreatedEvent = BasePrometheusEvent<
  "goal.created",
  {
    goalId: string;
    title: string;
    objective: string;
    parentGoalId?: string;
    priority?: number;
  }
>;

export type GoalStatusUpdatedEvent = BasePrometheusEvent<
  "goal.status-updated",
  {
    goalId: string;
    status: GoalStatus;
  }
>;

export type AgentRegisteredEvent = BasePrometheusEvent<
  "agent.registered",
  {
    agentId: string;
    name: string;
    kind: AgentKind;
    constraints?: string[];
  }
>;

export type CapabilityGapDetectedEvent = BasePrometheusEvent<
  "capability-gap.detected",
  {
    gapId: string;
    goalId: string;
    description: string;
    severity: CapabilityGapSeverity;
  }
>;

export type CapabilitySynthesizedRecordedEvent = BasePrometheusEvent<
  "capability-synthesized.recorded",
  {
    capabilityId: string;
    gapId: string;
    name: string;
    designSpec: string;
    status?: SynthesizedCapabilityStatus;
  }
>;

export type CapabilitySynthesizedStatusUpdatedEvent = BasePrometheusEvent<
  "capability-synthesized.status-updated",
  {
    capabilityId: string;
    status: SynthesizedCapabilityStatus;
  }
>;

export type InstitutionCreatedEvent = BasePrometheusEvent<
  "institution.created",
  {
    institutionId: string;
    name: string;
    mandate: string;
    authorityModel: string;
  }
>;

export type InstitutionStatusUpdatedEvent = BasePrometheusEvent<
  "institution.status-updated",
  {
    institutionId: string;
    status: "active" | "dormant" | "dissolved";
  }
>;

export type CapitalAllocatedEvent = BasePrometheusEvent<
  "capital.allocated",
  {
    capitalId: string;
    institutionId: string;
    form: "money" | "compute" | "materials" | "labor" | "political" | "data";
    amount: number;
    unit: string;
  }
>;

export type RecursionCycleRecordedEvent = BasePrometheusEvent<
  "recursion.cycle-recorded",
  RecursionCycle
>;

export type PrometheusEvent =
  | GoalCreatedEvent
  | GoalStatusUpdatedEvent
  | AgentRegisteredEvent
  | CapabilityGapDetectedEvent
  | CapabilitySynthesizedRecordedEvent
  | CapabilitySynthesizedStatusUpdatedEvent
  | InstitutionCreatedEvent
  | InstitutionStatusUpdatedEvent
  | CapitalAllocatedEvent
  | RecursionCycleRecordedEvent;

export function isPrometheusEvent(value: unknown): value is PrometheusEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PrometheusEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.occurredAt === "number" &&
    candidate.payload !== undefined
  );
}

export function assertPrometheusEvent(value: unknown): asserts value is PrometheusEvent {
  if (!isPrometheusEvent(value)) {
    throw new Error("Invalid PROMETHEUS event shape.");
  }
}
