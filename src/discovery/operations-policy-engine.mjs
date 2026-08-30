import { deepFreeze } from "./discovery-intake.mjs";

/**
 * ============================================================================
 * OPERATIONS POLICY ENGINE & INVESTIGATION QUEUE (WEB-PRODUCT-006R)
 * Generates deterministic attention priority bands (P0, P1, P2, P3),
 * 100% complete non-overlapping aging intervals, and multi-factor evidence gap detection.
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

// Complete, non-overlapping intervals:
// FRESH: 0 <= age < 7
// NORMAL: 7 <= age < 30
// AGING: 30 <= age < 60
// STALE: age >= 60
export const AGING_INTERVALS = Object.freeze({
  FRESH_MAX: 7,
  NORMAL_MAX: 30,
  AGING_MAX: 60
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
    if (daysSinceDecision >= AGING_INTERVALS.AGING_MAX) {
      ageStatus = "STALE";
    } else if (daysSinceDecision >= AGING_INTERVALS.NORMAL_MAX) {
      ageStatus = "AGING";
    } else if (daysSinceDecision >= AGING_INTERVALS.FRESH_MAX) {
      ageStatus = "NORMAL";
    } else {
      ageStatus = "FRESH";
    }

    const state = decision?.state || "UNCLASSIFIED";

    // Rule 1: STALE_WATCH (WATCH item with age >= 30 days)
    if (state === "WATCH" && daysSinceDecision >= AGING_INTERVALS.NORMAL_MAX) {
      reasons.push({
        code: ReasonCode.STALE_WATCH,
        severity: "HIGH",
        description: `Watch item has been inactive for ${daysSinceDecision} days without re-evaluation.`
      });
      priority = PriorityBand.P1_HIGH;
    }

    // Rule 2: Multi-Factor INVESTIGATE_EVIDENCE_GAP (Never triggers solely by absence of FACT)
    // Triggers if: In INVESTIGATE and (evidence contains UNKNOWN critical fields OR high hypothesis ratio >= 70% OR stale evidence >= 30d)
    const totalEvidence = evidenceLedger.length;
    const hypothesisCount = evidenceLedger.filter(e => e.classification === "AI_HYPOTHESIS").length;
    const isHighHypothesis = totalEvidence > 0 && (hypothesisCount / totalEvidence) >= 0.7;
    const isEvidenceStale = daysSinceDecision >= AGING_INTERVALS.NORMAL_MAX;

    if (state === "INVESTIGATE" && (isHighHypothesis || isEvidenceStale || opportunity.evidenceRisk === "HIGH")) {
      reasons.push({
        code: ReasonCode.INVESTIGATE_EVIDENCE_GAP,
        severity: "HIGH",
        description: `Investigation exhibits high evidence risk or hypothesis dependence (${hypothesisCount}/${totalEvidence} hypotheses).`
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
