import type { PrometheusState } from "../state.js";
import type { CapitalForm } from "../types.js";

export type CapitalDemand = {
  goalId: string;
  form: CapitalForm;
  requiredAmount: number;
  priority: number;
};

export type CapitalAllocation = {
  goalId: string;
  institutionId: string;
  form: CapitalForm;
  amount: number;
};

export type CapitalAllocationPlan = {
  allocations: CapitalAllocation[];
  unmetDemands: Array<CapitalDemand & { unmetAmount: number }>;
};

type InstitutionCapitalAvailability = Record<string, Record<CapitalForm, number>>;

function buildCapitalAvailability(state: PrometheusState): InstitutionCapitalAvailability {
  const availability: InstitutionCapitalAvailability = {};
  for (const entry of Object.values(state.capitalLedger)) {
    const byForm = availability[entry.institutionId] ?? {
      money: 0,
      compute: 0,
      materials: 0,
      labor: 0,
      political: 0,
      data: 0,
    };
    byForm[entry.form] += entry.amount;
    availability[entry.institutionId] = byForm;
  }
  return availability;
}

function activeInstitutions(state: PrometheusState): string[] {
  return Object.values(state.institutions)
    .filter((institution) => institution.status === "active")
    .map((institution) => institution.id);
}

export function planCapitalAllocations(params: {
  state: PrometheusState;
  demands: readonly CapitalDemand[];
}): CapitalAllocationPlan {
  const availability = buildCapitalAvailability(params.state);
  const institutions = activeInstitutions(params.state);
  const orderedDemands = [...params.demands]
    .filter((demand) => demand.requiredAmount > 0)
    .toSorted((left, right) => right.priority - left.priority);
  const allocations: CapitalAllocation[] = [];
  const unmetDemands: Array<CapitalDemand & { unmetAmount: number }> = [];

  for (const demand of orderedDemands) {
    let remaining = demand.requiredAmount;
    for (const institutionId of institutions) {
      const available = availability[institutionId]?.[demand.form] ?? 0;
      if (available <= 0) {
        continue;
      }
      const allocationAmount = Math.min(available, remaining);
      if (allocationAmount <= 0) {
        continue;
      }
      availability[institutionId][demand.form] = available - allocationAmount;
      allocations.push({
        goalId: demand.goalId,
        institutionId,
        form: demand.form,
        amount: allocationAmount,
      });
      remaining -= allocationAmount;
      if (remaining <= 0) {
        break;
      }
    }
    if (remaining > 0) {
      unmetDemands.push({
        ...demand,
        unmetAmount: remaining,
      });
    }
  }

  return {
    allocations,
    unmetDemands,
  };
}
