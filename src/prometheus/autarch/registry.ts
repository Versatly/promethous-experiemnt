import type { PrometheusState } from "../state.js";
import type { SynthesizedCapabilityStatus } from "../types.js";

export type CapabilitySource = "native" | "synthesized";

export type CapabilityLifecycleStatus =
  | "available"
  | "proposed"
  | "validated"
  | "integrated"
  | "rejected";

export type CapabilityNode = {
  id: string;
  name: string;
  source: CapabilitySource;
  status: CapabilityLifecycleStatus;
  goalIds: string[];
  gapIds: string[];
};

export type ExistingCapability = {
  id: string;
  name: string;
  coversGoalIds?: readonly string[];
};

export type CapabilityEdgeType =
  | "capability-addresses-gap"
  | "gap-blocks-goal"
  | "capability-supports-goal";

export type CapabilityEdge = {
  type: CapabilityEdgeType;
  fromId: string;
  toId: string;
};

export type GoalCapabilityCoverage = {
  goalId: string;
  capabilityIds: string[];
  integratedCount: number;
  provisionalCount: number;
  unresolvedGapIds: string[];
};

export type CapabilityGraph = {
  capabilities: Record<string, CapabilityNode>;
  edges: CapabilityEdge[];
  coverageByGoal: Record<string, GoalCapabilityCoverage>;
};

function toLifecycleStatus(status: SynthesizedCapabilityStatus): CapabilityLifecycleStatus {
  switch (status) {
    case "proposed":
      return "proposed";
    case "validated":
      return "validated";
    case "integrated":
      return "integrated";
    case "rejected":
      return "rejected";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function pushUnique(values: string[], value: string | undefined) {
  if (!value) {
    return;
  }
  if (!values.includes(value)) {
    values.push(value);
  }
}

function ensureCoverage(
  coverageByGoal: Record<string, GoalCapabilityCoverage>,
  goalId: string,
): GoalCapabilityCoverage {
  const existing = coverageByGoal[goalId];
  if (existing) {
    return existing;
  }
  const created: GoalCapabilityCoverage = {
    goalId,
    capabilityIds: [],
    integratedCount: 0,
    provisionalCount: 0,
    unresolvedGapIds: [],
  };
  coverageByGoal[goalId] = created;
  return created;
}

function isProvisionalStatus(status: CapabilityLifecycleStatus): boolean {
  return status === "proposed" || status === "validated";
}

export function buildCapabilityGraph(params: {
  state: PrometheusState;
  existingCapabilities?: readonly ExistingCapability[];
}): CapabilityGraph {
  const capabilities: Record<string, CapabilityNode> = {};
  const edges: CapabilityEdge[] = [];
  const coverageByGoal: Record<string, GoalCapabilityCoverage> = {};

  for (const baseCapability of params.existingCapabilities ?? []) {
    const node: CapabilityNode = {
      id: baseCapability.id,
      name: baseCapability.name,
      source: "native",
      status: "available",
      goalIds: [...(baseCapability.coversGoalIds ?? [])],
      gapIds: [],
    };
    capabilities[node.id] = node;
    for (const goalId of node.goalIds) {
      edges.push({
        type: "capability-supports-goal",
        fromId: node.id,
        toId: goalId,
      });
      const coverage = ensureCoverage(coverageByGoal, goalId);
      pushUnique(coverage.capabilityIds, node.id);
      coverage.integratedCount += 1;
    }
  }

  for (const gap of Object.values(params.state.capabilityGaps)) {
    edges.push({
      type: "gap-blocks-goal",
      fromId: gap.id,
      toId: gap.goalId,
    });
    if (!gap.resolvedAt) {
      pushUnique(ensureCoverage(coverageByGoal, gap.goalId).unresolvedGapIds, gap.id);
    }
  }

  for (const synthesized of Object.values(params.state.synthesizedCapabilities)) {
    const gap = params.state.capabilityGaps[synthesized.gapId];
    const goalId = gap?.goalId;
    const status = toLifecycleStatus(synthesized.status);
    const existingNode = capabilities[synthesized.id];
    const node: CapabilityNode = existingNode
      ? {
          ...existingNode,
          source: "synthesized",
          status,
          name: synthesized.name,
        }
      : {
          id: synthesized.id,
          name: synthesized.name,
          source: "synthesized",
          status,
          goalIds: [],
          gapIds: [],
        };
    pushUnique(node.gapIds, synthesized.gapId);
    pushUnique(node.goalIds, goalId);
    capabilities[node.id] = node;

    edges.push({
      type: "capability-addresses-gap",
      fromId: node.id,
      toId: synthesized.gapId,
    });
    if (goalId) {
      edges.push({
        type: "capability-supports-goal",
        fromId: node.id,
        toId: goalId,
      });
      const coverage = ensureCoverage(coverageByGoal, goalId);
      pushUnique(coverage.capabilityIds, node.id);
      if (status === "integrated" || status === "available") {
        coverage.integratedCount += 1;
      } else if (isProvisionalStatus(status)) {
        coverage.provisionalCount += 1;
      }
    }
  }

  return {
    capabilities,
    edges,
    coverageByGoal,
  };
}
