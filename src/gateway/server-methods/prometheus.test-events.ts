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
