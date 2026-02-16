export type PrimitiveId = string;

export type GoalStatus = "active" | "completed" | "blocked" | "archived";

export type GoalPrimitive = {
  id: PrimitiveId;
  title: string;
  objective: string;
  parentGoalId?: PrimitiveId;
  status: GoalStatus;
  priority: number;
  createdAt: number;
  updatedAt: number;
};

export type AgentKind = "human" | "ai" | "software" | "legal-entity";

export type AgentPrimitive = {
  id: PrimitiveId;
  name: string;
  kind: AgentKind;
  constraints: string[];
  createdAt: number;
  updatedAt: number;
};

export type StateSpacePrimitive = {
  id: PrimitiveId;
  resources: string[];
  capabilities: string[];
  institutions: PrimitiveId[];
  informationDomains: string[];
  createdAt: number;
  updatedAt: number;
};

export type FeedbackPrimitive = {
  id: PrimitiveId;
  subjectType: "goal" | "agent" | "institution" | "capability";
  subjectId: PrimitiveId;
  signal: "positive" | "negative" | "neutral";
  score: number;
  details: string;
  createdAt: number;
};

export type CapitalForm = "money" | "compute" | "materials" | "labor" | "political" | "data";

export type CapitalPrimitive = {
  id: PrimitiveId;
  institutionId: PrimitiveId;
  form: CapitalForm;
  amount: number;
  unit: string;
  updatedAt: number;
};

export type InstitutionStatus = "active" | "dormant" | "dissolved";

export type InstitutionPrimitive = {
  id: PrimitiveId;
  name: string;
  mandate: string;
  authorityModel: string;
  status: InstitutionStatus;
  createdAt: number;
  updatedAt: number;
};

export type CapabilityGapSeverity = "low" | "medium" | "high" | "critical";

export type CapabilityGap = {
  id: PrimitiveId;
  goalId: PrimitiveId;
  description: string;
  severity: CapabilityGapSeverity;
  createdAt: number;
  resolvedAt?: number;
};

export type SynthesizedCapabilityStatus = "proposed" | "validated" | "integrated" | "rejected";

export type SynthesizedCapability = {
  id: PrimitiveId;
  gapId: PrimitiveId;
  name: string;
  designSpec: string;
  status: SynthesizedCapabilityStatus;
  createdAt: number;
  updatedAt: number;
};

export type RecursionCycle = {
  cycleId: PrimitiveId;
  summary: string;
  occurredAt: number;
};
