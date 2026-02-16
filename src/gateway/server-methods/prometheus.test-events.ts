type GoalCreatedEventArgs = {
  id: string;
  occurredAt: number;
  goalId: string;
  title: string;
  objective: string;
  priority?: number;
  parentGoalId?: string;
};

export function createGoalCreatedEvent(args: GoalCreatedEventArgs) {
  return {
    id: args.id,
    type: "goal.created" as const,
    occurredAt: args.occurredAt,
    payload: {
      goalId: args.goalId,
      title: args.title,
      objective: args.objective,
      priority: args.priority ?? 100,
      ...(args.parentGoalId ? { parentGoalId: args.parentGoalId } : {}),
    },
  };
}

type RecursionMutationProposalArgs = {
  mutationId: string;
  title: string;
  hypothesis: string;
  risk?: "low" | "medium" | "high";
  expectedGain?: number;
};

export function createRecursionMutationProposal(args: RecursionMutationProposalArgs) {
  return {
    mutationId: args.mutationId,
    title: args.title,
    hypothesis: args.hypothesis,
    risk: args.risk ?? "low",
    expectedGain: args.expectedGain ?? 0.1,
  };
}

type RecursionFitnessSnapshotArgs = {
  objectiveFit: number;
  stability: number;
  throughput: number;
};

export function createRecursionFitnessSnapshot(args: RecursionFitnessSnapshotArgs) {
  return {
    objectiveFit: args.objectiveFit,
    stability: args.stability,
    throughput: args.throughput,
  };
}
