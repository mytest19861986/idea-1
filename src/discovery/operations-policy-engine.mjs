import { deepFreeze } from "./discovery-intake.mjs";

/**
 * ============================================================================
 * OPERATIONS POLICY ENGINE & INVESTIGATION QUEUE (WEB-PRODUCT-006)
 * Generates deterministic attention priority bands (P0, P1, P2, P3),
 * decision aging, and evidence gap detection under operations-policy-v1.
 * Strict separation: Attention Priority != Opportunity Score / Investment Advice.
 * ============================================================================
 */

export const OPERATIONS_POLICY_VERSION = "operations-policy-v1";

export const PriorityBand = Object.freeze({
  P0_CRITICAL: "P0_CRITICAL",
  P1_HIGH: "P1_HIGH",
  P2_MEDIUM: "P2_MEDIUM",
  P3_LOW: "P3_LOW"
});

export const ReasonCode = Object.freeze({
  STALE_WATCH: "STALE_WATCH",
  INVESTIGATE_EVIDENCE_GAP: "INVESTIGATE_EVIDENCE_GAP",
  SHORTLIST_HIGH_RISK: "SHORTLIST_HIGH_RISK",
  UNKNOWN_CRITICAL_DIMENSION: "UNKNOWN_CRITICAL_DIMENSION",
  STALE_EVIDENCE: "STALE_EVIDENCE",
  ROUTINE_MONITORING: "ROUTINE_MONITORING"
});

export const AGING_THRESHOLDS = Object.freeze({
  FRESH_DAYS: 7,
  AGING_DAYS: 30,
  STALE_DAYS: 60
});

export class OperationsPolicyEngine {
  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
    this.version = OPERATIONS_POLICY_VERSION;
  }

  /**
   * Evaluates an opportunity and its portfolio decision state into an Investigation Queue Item.
   */
  evaluateQueueItem({ opportunity, decision, evidenceLedger = [] }) {
    const now = this.clock();
    const reasons = [];
    let priority = PriorityBand.P3_LOW;

    const decisionUpdatedAt = decision?.updated_at ? new Date(decision.updated_at) : new Date(opportunity.freshness || now);
    const daysSinceDecision = Math.max(0, Math.floor((now.getTime() - decisionUpdatedAt.getTime()) / (1000 * 60 * 60 * 24)));
    
    let ageStatus = "FRESH";
    if (daysSinceDecision >= AGING_THRESHOLDS.STALE_DAYS) {
      ageStatus = "STALE";
    } else if (daysSinceDecision >= AGING_THRESHOLDS.AGING_DAYS) {
      ageStatus = "AGING";
    }

    const state = decision?.state || "UNCLASSIFIED";

    // Rule 1: STALE_WATCH (WATCH item with age >= 30 days)
    if (state === "WATCH" && daysSinceDecision >= AGING_THRESHOLDS.AGING_DAYS) {
      reasons.push({
        code: ReasonCode.STALE_WATCH,
        severity: "HIGH",
        description: `Watch item has been inactive for ${daysSinceDecision} days without re-evaluation.`
      });
      priority = PriorityBand.P1_HIGH;
    }

    // Rule 2: INVESTIGATE_EVIDENCE_GAP (In INVESTIGATE and lacks verified FACT proofs)
    const factCount = evidenceLedger.filter(e => e.classification === "FACT").length;
    if (state === "INVESTIGATE" && factCount === 0) {
      reasons.push({
        code: ReasonCode.INVESTIGATE_EVIDENCE_GAP,
        severity: "HIGH",
        description: "Active investigation lacks verified FACT proof; relies exclusively on unverified public claims."
      });
      if (priority !== PriorityBand.P0_CRITICAL) priority = PriorityBand.P1_HIGH;
    }

    // Rule 3: SHORTLIST_HIGH_RISK (In SHORTLIST with high regulatory/technical risk >= 7)
    if (state === "SHORTLIST" && (opportunity.regulatoryRisk >= 7 || opportunity.buildComplexity >= 7)) {
      reasons.push({
        code: ReasonCode.SHORTLIST_HIGH_RISK,
        severity: "CRITICAL",
        description: "Shortlisted candidate exhibits elevated regulatory or technical complexity risk requiring mitigation."
      });
      priority = PriorityBand.P0_CRITICAL;
    }

    // Rule 4: UNKNOWN_CRITICAL_DIMENSION
    if (opportunity.localization === "UNKNOWN" || opportunity.monetizationSummary === "INSUFFICIENT_EVIDENCE") {
      reasons.push({
        code: ReasonCode.UNKNOWN_CRITICAL_DIMENSION,
        severity: "MEDIUM",
        description: "Critical commercial dimension is UNKNOWN or lacks sufficient evidence."
      });
      if (priority === PriorityBand.P3_LOW) priority = PriorityBand.P2_MEDIUM;
    }

    if (reasons.length === 0) {
      reasons.push({
        code: ReasonCode.ROUTINE_MONITORING,
        severity: "LOW",
        description: "Standard periodic portfolio observation."
      });
    }

    return deepFreeze({
      queueItemId: `queue:${opportunity.opportunityId}`,
      opportunityId: opportunity.opportunityId,
      title: opportunity.title,
      isConfidential: opportunity.isConfidential,
      portfolioState: state,
      priorityBand: priority,
      ageStatus,
      daysSinceDecision,
      reasons,
      policyVersion: this.version,
      evaluatedAt: now.toISOString()
    });
  }
}
