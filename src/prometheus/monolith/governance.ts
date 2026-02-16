import type { PrometheusState } from "../state.js";
import type { CapitalForm, InstitutionStatus } from "../types.js";

export type InstitutionActionType =
  | "capital.allocate"
  | "institution.merge"
  | "institution.dissolve"
  | "authority.delegate";

export type InstitutionActionRequest = {
  institutionId: string;
  type: InstitutionActionType;
  form?: CapitalForm;
  amount?: number;
  targetInstitutionId?: string;
  actorAgentId?: string;
  rationale?: string;
};

export type MonolithGovernancePolicy = {
  blockedStatuses?: readonly InstitutionStatus[];
  maxSingleAllocationByForm?: Partial<Record<CapitalForm, number>>;
  mandateKeywordAllowlist?: readonly string[];
};

export type GovernanceDecision = {
  allowed: boolean;
  reasons: string[];
  requiredApprovals: string[];
};

const DEFAULT_POLICY: MonolithGovernancePolicy = {
  blockedStatuses: ["dissolved"],
  maxSingleAllocationByForm: {},
  mandateKeywordAllowlist: [],
};

function resolvePolicy(policy?: MonolithGovernancePolicy): MonolithGovernancePolicy {
  return {
    blockedStatuses: policy?.blockedStatuses ?? DEFAULT_POLICY.blockedStatuses,
    maxSingleAllocationByForm: policy?.maxSingleAllocationByForm ?? {},
    mandateKeywordAllowlist: policy?.mandateKeywordAllowlist ?? [],
  };
}

function availableCapitalForInstitution(
  state: PrometheusState,
  institutionId: string,
  form: CapitalForm,
): number {
  return Object.values(state.capitalLedger)
    .filter((entry) => entry.institutionId === institutionId && entry.form === form)
    .reduce((total, entry) => total + entry.amount, 0);
}

export function evaluateInstitutionAction(params: {
  state: PrometheusState;
  request: InstitutionActionRequest;
  policy?: MonolithGovernancePolicy;
}): GovernanceDecision {
  const policy = resolvePolicy(params.policy);
  const reasons: string[] = [];
  const requiredApprovals: string[] = [];
  const institution = params.state.institutions[params.request.institutionId];
  if (!institution) {
    return {
      allowed: false,
      reasons: [`Institution "${params.request.institutionId}" does not exist.`],
      requiredApprovals: [],
    };
  }

  if (policy.blockedStatuses?.includes(institution.status)) {
    reasons.push(`Institution "${institution.id}" is ${institution.status}.`);
  }

  if (policy.mandateKeywordAllowlist && policy.mandateKeywordAllowlist.length > 0) {
    const lowerMandate = institution.mandate.toLowerCase();
    const hasKeyword = policy.mandateKeywordAllowlist.some((keyword) =>
      lowerMandate.includes(keyword.toLowerCase()),
    );
    if (!hasKeyword) {
      reasons.push("Institution mandate does not satisfy governance keyword allowlist.");
    }
  }

  switch (params.request.type) {
    case "capital.allocate": {
      const form = params.request.form;
      const amount = params.request.amount;
      if (!form || typeof amount !== "number" || amount <= 0) {
        reasons.push("Capital allocation requires positive amount and capital form.");
        break;
      }
      const available = availableCapitalForInstitution(params.state, institution.id, form);
      if (amount > available) {
        reasons.push(
          `Requested allocation (${amount}) exceeds available ${form} capital (${available}).`,
        );
      }
      const maxSingle = policy.maxSingleAllocationByForm?.[form];
      if (typeof maxSingle === "number" && amount > maxSingle) {
        reasons.push(`Requested allocation (${amount}) exceeds policy limit (${maxSingle}).`);
      }
      if (available > 0 && amount / available >= 0.8) {
        requiredApprovals.push("treasury-council");
      }
      break;
    }
    case "institution.merge": {
      if (!params.request.targetInstitutionId) {
        reasons.push("Institution merge requires targetInstitutionId.");
        break;
      }
      const target = params.state.institutions[params.request.targetInstitutionId];
      if (!target) {
        reasons.push(`Target institution "${params.request.targetInstitutionId}" does not exist.`);
      } else if (target.status !== "active") {
        reasons.push(`Target institution "${target.id}" is not active.`);
      }
      requiredApprovals.push("governance-council");
      break;
    }
    case "institution.dissolve": {
      if (institution.status !== "dormant") {
        reasons.push("Institution must be dormant before dissolution.");
      }
      requiredApprovals.push("governance-council", "legal-review");
      break;
    }
    case "authority.delegate": {
      if (!params.request.actorAgentId) {
        reasons.push("Delegation requires actorAgentId.");
      }
      if (!params.request.rationale || !params.request.rationale.trim()) {
        reasons.push("Delegation requires rationale.");
      }
      requiredApprovals.push("governance-council");
      break;
    }
    default: {
      const exhaustive: never = params.request.type;
      reasons.push(`Unsupported institution action: ${String(exhaustive)}`);
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    requiredApprovals: [...new Set(requiredApprovals)],
  };
}
