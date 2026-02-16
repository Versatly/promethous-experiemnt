import type { RecursionCycleRecordedEvent } from "../events.js";
import type { RecursionCycle } from "../types.js";

export type StrategyFitnessSnapshot = {
  objectiveFit: number;
  stability: number;
  throughput: number;
};

export type MutationRisk = "low" | "medium" | "high";

export type MutationProposal = {
  mutationId: string;
  title: string;
  hypothesis: string;
  risk: MutationRisk;
  expectedGain: number;
};

export type MutationEvaluation = {
  mutationId: string;
  accepted: boolean;
  scoreDelta: number;
  baselineScore: number;
  candidateScore: number;
  rationale: string;
};

export type RecursionOperatorPolicy = {
  minScoreDelta: number;
  minStabilityFloor: number;
  highRiskPenalty: number;
  mediumRiskPenalty: number;
};

const DEFAULT_POLICY: RecursionOperatorPolicy = {
  minScoreDelta: 0.05,
  minStabilityFloor: 0.5,
  highRiskPenalty: 0.15,
  mediumRiskPenalty: 0.05,
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function compositeScore(snapshot: StrategyFitnessSnapshot): number {
  const objective = clampScore(snapshot.objectiveFit);
  const stability = clampScore(snapshot.stability);
  const throughput = clampScore(snapshot.throughput);
  return objective * 0.5 + stability * 0.35 + throughput * 0.15;
}

function resolvePolicy(policy?: Partial<RecursionOperatorPolicy>): RecursionOperatorPolicy {
  return {
    minScoreDelta: policy?.minScoreDelta ?? DEFAULT_POLICY.minScoreDelta,
    minStabilityFloor: policy?.minStabilityFloor ?? DEFAULT_POLICY.minStabilityFloor,
    highRiskPenalty: policy?.highRiskPenalty ?? DEFAULT_POLICY.highRiskPenalty,
    mediumRiskPenalty: policy?.mediumRiskPenalty ?? DEFAULT_POLICY.mediumRiskPenalty,
  };
}

function riskPenalty(risk: MutationRisk, policy: RecursionOperatorPolicy): number {
  if (risk === "high") {
    return policy.highRiskPenalty;
  }
  if (risk === "medium") {
    return policy.mediumRiskPenalty;
  }
  return 0;
}

export function evaluateMutationProposal(params: {
  proposal: MutationProposal;
  baseline: StrategyFitnessSnapshot;
  candidate: StrategyFitnessSnapshot;
  policy?: Partial<RecursionOperatorPolicy>;
}): MutationEvaluation {
  const policy = resolvePolicy(params.policy);
  const baselineScore = compositeScore(params.baseline);
  const rawCandidateScore = compositeScore(params.candidate);
  const candidateScore = Math.max(0, rawCandidateScore - riskPenalty(params.proposal.risk, policy));
  const scoreDelta = candidateScore - baselineScore;
  const stabilityGate = params.candidate.stability >= policy.minStabilityFloor;
  const accepted = stabilityGate && scoreDelta >= policy.minScoreDelta;
  const rationale = accepted
    ? "mutation improved composite strategy fitness beyond threshold"
    : !stabilityGate
      ? "candidate stability below policy floor"
      : "mutation delta below minimum acceptance threshold";
  return {
    mutationId: params.proposal.mutationId,
    accepted,
    scoreDelta,
    baselineScore,
    candidateScore,
    rationale,
  };
}

export function buildRecursionCycleEvent(params: {
  cycleId: string;
  occurredAt: number;
  summary: string;
  actorAgentId?: string;
  mutationId?: string;
  proposalTitle?: string;
  evaluation?: MutationEvaluation;
  rollbackOfCycleId?: string;
}): RecursionCycleRecordedEvent {
  const payload: RecursionCycle = {
    cycleId: params.cycleId,
    summary: params.summary,
    mutationId: params.mutationId ?? params.evaluation?.mutationId,
    proposalTitle: params.proposalTitle,
    evaluationScore: params.evaluation?.scoreDelta,
    accepted: params.evaluation?.accepted,
    rollbackOfCycleId: params.rollbackOfCycleId,
    rationale: params.evaluation?.rationale,
    occurredAt: params.occurredAt,
  };
  return {
    id: `evt:recursion-cycle:${params.cycleId}`,
    type: "recursion.cycle-recorded",
    occurredAt: params.occurredAt,
    actorAgentId: params.actorAgentId,
    payload,
  };
}

export function buildRollbackCycleEvent(params: {
  cycleId: string;
  rollbackOfCycleId: string;
  occurredAt: number;
  reason: string;
  actorAgentId?: string;
}): RecursionCycleRecordedEvent {
  return buildRecursionCycleEvent({
    cycleId: params.cycleId,
    occurredAt: params.occurredAt,
    summary: `Rollback to stable cycle "${params.rollbackOfCycleId}"`,
    rollbackOfCycleId: params.rollbackOfCycleId,
    actorAgentId: params.actorAgentId,
    evaluation: {
      mutationId: `rollback:${params.rollbackOfCycleId}`,
      accepted: true,
      scoreDelta: 0,
      baselineScore: 0,
      candidateScore: 0,
      rationale: params.reason,
    },
  });
}
