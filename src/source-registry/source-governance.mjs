import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";
import { SourceStatus, canTransition, transitionSource } from "./lifecycle.mjs";
import {
  HealthLevel,
  ContributionLevel,
  EvaluationConfidence,
  EVALUATION_VERSION,
  FORMULA_VERSION
} from "./source-health-evaluator.mjs";

export const GovernancePolicyVersion = "source-governance-policy-v1";

export const GovernanceOutcome = Object.freeze({
  NO_CHANGE: "NO_CHANGE",
  ALLOW_AUTOMATIC_TRANSITION: "ALLOW_AUTOMATIC_TRANSITION",
  REQUIRE_MANUAL_REVIEW: "REQUIRE_MANUAL_REVIEW",
  INVESTIGATE: "INVESTIGATE"
});

export const TransitionClassification = Object.freeze({
  AUTOMATED_OPERATIONAL_REVERSIBLE: "AUTOMATED_OPERATIONAL_REVERSIBLE",
  MANUAL_REQUIRING_AUTHORIZATION: "MANUAL_REQUIRING_AUTHORIZATION",
  FORBIDDEN: "FORBIDDEN"
});

/**
 * Classifies whether a transition is permitted for automated reversible governance.
 * Invariant: GOV-I003, GOV-I010 (No Auto-Activation), GOV-I011 (No Auto-Reject/Retire).
 * @param {string} fromState
 * @param {string} toState
 * @returns {string}
 */
export function classifyTransitionSafety(fromState, toState) {
  if (!canTransition(fromState, toState)) {
    return TransitionClassification.FORBIDDEN;
  }

  // GOV-I010: Never auto-activate
  if (fromState === SourceStatus.APPROVED && toState === SourceStatus.ACTIVE) {
    return TransitionClassification.MANUAL_REQUIRING_AUTHORIZATION;
  }

  // GOV-I011: Never auto-reject or auto-retire
  if (toState === SourceStatus.REJECTED || toState === SourceStatus.RETIRED) {
    return TransitionClassification.MANUAL_REQUIRING_AUTHORIZATION;
  }

  // Permitted automated operational reversible transitions
  const reversibleTransitions = [
    `${SourceStatus.ACTIVE}->${SourceStatus.DEGRADED}`,
    `${SourceStatus.ACTIVE}->${SourceStatus.LOW_PRIORITY}`,
    `${SourceStatus.ACTIVE}->${SourceStatus.PAUSED}`,
    `${SourceStatus.DEGRADED}->${SourceStatus.ACTIVE}`,
    `${SourceStatus.DEGRADED}->${SourceStatus.PAUSED}`,
    `${SourceStatus.LOW_PRIORITY}->${SourceStatus.ACTIVE}`,
    `${SourceStatus.LOW_PRIORITY}->${SourceStatus.PAUSED}`,
    `${SourceStatus.PAUSED}->${SourceStatus.ACTIVE}`,
    `${SourceStatus.PAUSED}->${SourceStatus.LOW_PRIORITY}`
  ];

  if (reversibleTransitions.includes(`${fromState}->${toState}`)) {
    return TransitionClassification.AUTOMATED_OPERATIONAL_REVERSIBLE;
  }

  return TransitionClassification.MANUAL_REQUIRING_AUTHORIZATION;
}

/**
 * Evaluates Source Health Snapshots against Governance Policies.
 *
 * Invariants:
 * - GOV-I001 & GOV-I002: Reuses SourceStatus and tags governancePolicyVersion
 * - GOV-I003: Distinguishes automated reversible from manual transitions
 * - GOV-I004: Confidence gate (HIGH confidence required for auto-transitions)
 * - GOV-I005: Hysteresis awareness (fast-track CRITICAL pause count=1; degrade/recovery count >= 2)
 * - GOV-I006: Cooldown awareness
 * - GOV-I007 & GOV-I008: Differentiates operational health from intelligence contribution
 * - GOV-I009: Access/Policy failure specific handling (INVESTIGATE vs REQUIRE_MANUAL_REVIEW)
 * - GOV-I010 & GOV-I011: Forbids auto-activation, auto-rejection, auto-retirement
 * - GOV-I012: Rich immutable decision envelope
 * - GOV-I013: Read-only evaluation (no source mutation)
 *
 * @param {object} sourceRecord
 * @param {Array<object>} healthSnapshots - Chronological list of snapshots (latest is last)
 * @param {object} options
 * @param {string} options.decisionAt - ISO 8601 evaluation timestamp (MANDATORY)
 * @param {string} [options.lastTransitionAt] - Timestamp of last lifecycle transition
 * @param {number} [options.cooldownMinutes=60] - Minimum minutes between auto transitions
 * @param {number} [options.criticalHysteresisCount=1] - Consecutive snapshots needed to pause on CRITICAL
 * @param {number} [options.degradeHysteresisCount=2] - Consecutive snapshots needed to degrade
 * @param {number} [options.recoveryHysteresisCount=2] - Consecutive snapshots needed to recover
 * @param {string} [options.actor="source-governance-engine"]
 * @returns {object} GovernanceDecision
 */
export function evaluateGovernance(
  sourceRecord,
  healthSnapshots,
  {
    decisionAt,
    lastTransitionAt = null,
    cooldownMinutes = 60,
    criticalHysteresisCount = 1,
    degradeHysteresisCount = 2,
    recoveryHysteresisCount = 2,
    actor = "source-governance-engine"
  } = {}
) {
  if (!sourceRecord || typeof sourceRecord.id !== "string" || !sourceRecord.status) {
    throw new TypeError("valid sourceRecord with id and status is required");
  }
  const validatedDecisionAt = validateIsoTimestamp(decisionAt, "decisionAt");
  if (lastTransitionAt) {
    validateIsoTimestamp(lastTransitionAt, "lastTransitionAt");
  }
  if (!Array.isArray(healthSnapshots) || healthSnapshots.length === 0) {
    throw new TypeError("healthSnapshots must be a non-empty array");
  }

  const sourceId = sourceRecord.id;
  const currentState = sourceRecord.status;
  const latestSnapshot = healthSnapshots[healthSnapshots.length - 1];

  if (latestSnapshot.sourceId !== sourceId) {
    throw new TypeError("latest healthSnapshot does not match sourceRecord id");
  }

  const decisionId = `gov:dec:${sourceId}:${Date.parse(validatedDecisionAt)}`;
  const reasonCodes = [];
  const evidenceReferences = [latestSnapshot.evaluatedAt];

  // Check cooldown
  let cooldownSatisfied = true;
  if (lastTransitionAt) {
    const elapsedMinutes = (Date.parse(validatedDecisionAt) - Date.parse(lastTransitionAt)) / (60 * 1000);
    if (elapsedMinutes < cooldownMinutes) {
      cooldownSatisfied = false;
      reasonCodes.push("COOLDOWN_NOT_SATISFIED");
    }
  }

  // Check Policy / Access Failures (GOV-I009)
  const hasPolicyFailure = latestSnapshot.findings?.some((f) => f.code === "POLICY_ACCESS_FAILURE");
  const hasAccessFailure = latestSnapshot.findings?.some((f) => f.code === "ACCESS_CONFIGURATION_FAILURE");

  if (hasPolicyFailure) {
    reasonCodes.push("POLICY_ACCESS_PROHIBITION");
    return deepFreeze({
      decisionId,
      sourceId,
      currentState,
      proposedState: currentState === SourceStatus.ACTIVE ? SourceStatus.PAUSED : currentState,
      decision: GovernanceOutcome.REQUIRE_MANUAL_REVIEW,
      reasonCodes,
      evidenceReferences,
      confidence: latestSnapshot.confidence,
      cooldownSatisfied,
      hysteresisSatisfied: false,
      governancePolicyVersion: GovernancePolicyVersion,
      healthEvaluationVersion: latestSnapshot.evaluationVersion || EVALUATION_VERSION,
      healthFormulaVersion: latestSnapshot.formulaVersion || FORMULA_VERSION,
      actor,
      evaluatedAt: latestSnapshot.evaluatedAt,
      decisionAt: validatedDecisionAt
    });
  }

  if (hasAccessFailure) {
    reasonCodes.push("ACCESS_CONFIGURATION_ISSUE");
    return deepFreeze({
      decisionId,
      sourceId,
      currentState,
      proposedState: currentState,
      decision: GovernanceOutcome.INVESTIGATE,
      reasonCodes,
      evidenceReferences,
      confidence: latestSnapshot.confidence,
      cooldownSatisfied,
      hysteresisSatisfied: false,
      governancePolicyVersion: GovernancePolicyVersion,
      healthEvaluationVersion: latestSnapshot.evaluationVersion || EVALUATION_VERSION,
      healthFormulaVersion: latestSnapshot.formulaVersion || FORMULA_VERSION,
      actor,
      evaluatedAt: latestSnapshot.evaluatedAt,
      decisionAt: validatedDecisionAt
    });
  }

  // Determine Target Proposed State based on health vs intelligence (GOV-I007, GOV-I008)
  let proposedState = currentState;
  let isCriticalPause = false;

  if (currentState === SourceStatus.ACTIVE) {
    if (latestSnapshot.operationalHealth === HealthLevel.CRITICAL) {
      proposedState = SourceStatus.PAUSED;
      isCriticalPause = true;
      reasonCodes.push("OPERATIONAL_CRITICAL_PAUSE");
    } else if (latestSnapshot.operationalHealth === HealthLevel.MEDIUM || latestSnapshot.operationalHealth === HealthLevel.LOW) {
      proposedState = SourceStatus.DEGRADED;
      reasonCodes.push("OPERATIONAL_DEGRADATION");
    } else if (latestSnapshot.operationalHealth === HealthLevel.HIGH && latestSnapshot.intelligenceContribution === ContributionLevel.LOW) {
      proposedState = SourceStatus.LOW_PRIORITY;
      reasonCodes.push("LOW_INTELLIGENCE_CONTRIBUTION");
    }
  } else if (currentState === SourceStatus.DEGRADED || currentState === SourceStatus.LOW_PRIORITY || currentState === SourceStatus.PAUSED) {
    if (latestSnapshot.operationalHealth === HealthLevel.HIGH && latestSnapshot.intelligenceContribution === ContributionLevel.HIGH) {
      proposedState = SourceStatus.ACTIVE;
      reasonCodes.push("OPERATIONAL_RECOVERY_HEALTHY");
    }
  }

  if (proposedState === currentState) {
    reasonCodes.push("MAINTAIN_CURRENT_STATE");
    return deepFreeze({
      decisionId,
      sourceId,
      currentState,
      proposedState: currentState,
      decision: GovernanceOutcome.NO_CHANGE,
      reasonCodes,
      evidenceReferences,
      confidence: latestSnapshot.confidence,
      cooldownSatisfied,
      hysteresisSatisfied: true,
      governancePolicyVersion: GovernancePolicyVersion,
      healthEvaluationVersion: latestSnapshot.evaluationVersion || EVALUATION_VERSION,
      healthFormulaVersion: latestSnapshot.formulaVersion || FORMULA_VERSION,
      actor,
      evaluatedAt: latestSnapshot.evaluatedAt,
      decisionAt: validatedDecisionAt
    });
  }

  // Check Hysteresis (GOV-I005)
  let hysteresisSatisfied = false;
  const isDegrading = [SourceStatus.DEGRADED, SourceStatus.LOW_PRIORITY].includes(proposedState) && currentState === SourceStatus.ACTIVE;
  const isRecovering = proposedState === SourceStatus.ACTIVE;

  if (isCriticalPause) {
    const requiredCount = criticalHysteresisCount;
    if (healthSnapshots.length >= requiredCount) {
      const recent = healthSnapshots.slice(-requiredCount);
      hysteresisSatisfied = recent.every((snap) => snap.operationalHealth === HealthLevel.CRITICAL);
    }
  } else if (isDegrading) {
    const requiredCount = degradeHysteresisCount;
    if (healthSnapshots.length >= requiredCount) {
      const recent = healthSnapshots.slice(-requiredCount);
      hysteresisSatisfied = recent.every((snap) => snap.operationalHealth !== HealthLevel.HIGH || snap.intelligenceContribution === ContributionLevel.LOW);
    }
  } else if (isRecovering) {
    const requiredCount = recoveryHysteresisCount;
    if (healthSnapshots.length >= requiredCount) {
      const recent = healthSnapshots.slice(-requiredCount);
      hysteresisSatisfied = recent.every((snap) => snap.operationalHealth === HealthLevel.HIGH);
    }
  }

  if (!hysteresisSatisfied) {
    reasonCodes.push("HYSTERESIS_NOT_SATISFIED");
  }

  // Check Transition Safety & Confidence (GOV-I003, GOV-I004)
  const safety = classifyTransitionSafety(currentState, proposedState);
  const confidenceHigh = latestSnapshot.confidence === EvaluationConfidence.HIGH;

  if (safety === TransitionClassification.FORBIDDEN) {
    reasonCodes.push("ILLEGAL_LIFECYCLE_TRANSITION");
    return deepFreeze({
      decisionId,
      sourceId,
      currentState,
      proposedState,
      decision: GovernanceOutcome.REQUIRE_MANUAL_REVIEW,
      reasonCodes,
      evidenceReferences,
      confidence: latestSnapshot.confidence,
      cooldownSatisfied,
      hysteresisSatisfied,
      governancePolicyVersion: GovernancePolicyVersion,
      healthEvaluationVersion: latestSnapshot.evaluationVersion || EVALUATION_VERSION,
      healthFormulaVersion: latestSnapshot.formulaVersion || FORMULA_VERSION,
      actor,
      evaluatedAt: latestSnapshot.evaluatedAt,
      decisionAt: validatedDecisionAt
    });
  }

  if (safety === TransitionClassification.MANUAL_REQUIRING_AUTHORIZATION) {
    reasonCodes.push("MANUAL_AUTHORIZATION_REQUIRED");
    return deepFreeze({
      decisionId,
      sourceId,
      currentState,
      proposedState,
      decision: GovernanceOutcome.REQUIRE_MANUAL_REVIEW,
      reasonCodes,
      evidenceReferences,
      confidence: latestSnapshot.confidence,
      cooldownSatisfied,
      hysteresisSatisfied,
      governancePolicyVersion: GovernancePolicyVersion,
      healthEvaluationVersion: latestSnapshot.evaluationVersion || EVALUATION_VERSION,
      healthFormulaVersion: latestSnapshot.formulaVersion || FORMULA_VERSION,
      actor,
      evaluatedAt: latestSnapshot.evaluatedAt,
      decisionAt: validatedDecisionAt
    });
  }

  // Automatable transition
  if (safety === TransitionClassification.AUTOMATED_OPERATIONAL_REVERSIBLE) {
    if (confidenceHigh && hysteresisSatisfied && cooldownSatisfied) {
      reasonCodes.push("AUTOMATIC_TRANSITION_AUTHORIZED");
      return deepFreeze({
        decisionId,
        sourceId,
        currentState,
        proposedState,
        decision: GovernanceOutcome.ALLOW_AUTOMATIC_TRANSITION,
        reasonCodes,
        evidenceReferences,
        confidence: latestSnapshot.confidence,
        cooldownSatisfied: true,
        hysteresisSatisfied: true,
        governancePolicyVersion: GovernancePolicyVersion,
        healthEvaluationVersion: latestSnapshot.evaluationVersion || EVALUATION_VERSION,
        healthFormulaVersion: latestSnapshot.formulaVersion || FORMULA_VERSION,
        actor,
        evaluatedAt: latestSnapshot.evaluatedAt,
        decisionAt: validatedDecisionAt
      });
    }

    if (!confidenceHigh) reasonCodes.push("CONFIDENCE_GATE_NOT_MET");

    return deepFreeze({
      decisionId,
      sourceId,
      currentState,
      proposedState,
      decision: GovernanceOutcome.NO_CHANGE,
      reasonCodes,
      evidenceReferences,
      confidence: latestSnapshot.confidence,
      cooldownSatisfied,
      hysteresisSatisfied,
      governancePolicyVersion: GovernancePolicyVersion,
      healthEvaluationVersion: latestSnapshot.evaluationVersion || EVALUATION_VERSION,
      healthFormulaVersion: latestSnapshot.formulaVersion || FORMULA_VERSION,
      actor,
      evaluatedAt: latestSnapshot.evaluatedAt,
      decisionAt: validatedDecisionAt
    });
  }

  return deepFreeze({
    decisionId,
    sourceId,
    currentState,
    proposedState,
    decision: GovernanceOutcome.NO_CHANGE,
    reasonCodes,
    evidenceReferences,
    confidence: latestSnapshot.confidence,
    cooldownSatisfied,
    hysteresisSatisfied,
    governancePolicyVersion: GovernancePolicyVersion,
    healthEvaluationVersion: latestSnapshot.evaluationVersion || EVALUATION_VERSION,
    healthFormulaVersion: latestSnapshot.formulaVersion || FORMULA_VERSION,
    actor,
    evaluatedAt: latestSnapshot.evaluatedAt,
    decisionAt: validatedDecisionAt
  });
}

/**
 * In-Memory Governance Application Engine.
 * Handles stale decision protection and idempotent application.
 */
export class SourceGovernanceApplier {
  constructor() {
    this.appliedDecisionIds = new Set();
    this.auditEvents = [];
  }

  /**
   * Applies an evaluated GovernanceDecision to the source record.
   * Invariants:
   * - GOV-I014: Optimistic state check (rejects if currentState changed)
   * - GOV-I015: Idempotent replay by decisionId
   * - GOV-I016: Immutable audit trail
   *
   * @param {object} currentSourceRecord
   * @param {object} decision - GovernanceDecision
   * @param {object} options
   * @param {string} options.appliedAt - ISO 8601 timestamp (MANDATORY)
   * @param {string} [options.actor="source-governance-applier"]
   * @returns {object} ApplicationResult
   */
  applyDecision(currentSourceRecord, decision, { appliedAt, actor = "source-governance-applier" } = {}) {
    validateIsoTimestamp(appliedAt, "appliedAt");
    if (!currentSourceRecord || !decision) {
      throw new TypeError("currentSourceRecord and decision are required");
    }

    // GOV-I015: Idempotent replay
    if (this.appliedDecisionIds.has(decision.decisionId)) {
      return deepFreeze({
        ok: true,
        status: "REPLAYED",
        sourceRecord: currentSourceRecord,
        auditEvent: null
      });
    }

    // Only ALLOW_AUTOMATIC_TRANSITION can be applied automatically
    if (decision.decision !== GovernanceOutcome.ALLOW_AUTOMATIC_TRANSITION) {
      const blockEvent = {
        eventType: "SOURCE_TRANSITION_BLOCKED",
        sourceId: currentSourceRecord.id,
        decisionId: decision.decisionId,
        reason: "Decision does not authorize automatic transition",
        actor,
        occurredAt: appliedAt
      };
      this.auditEvents.push(deepFreeze(blockEvent));
      return deepFreeze({
        ok: false,
        status: "NOT_AUTHORIZED",
        reason: "Decision does not authorize automatic transition",
        sourceRecord: currentSourceRecord,
        auditEvent: blockEvent
      });
    }

    // GOV-I014: Optimistic State Check (Stale decision protection)
    if (currentSourceRecord.status !== decision.currentState) {
      const staleEvent = {
        eventType: "SOURCE_GOVERNANCE_DECISION_STALE",
        sourceId: currentSourceRecord.id,
        decisionId: decision.decisionId,
        expectedState: decision.currentState,
        actualState: currentSourceRecord.status,
        actor,
        occurredAt: appliedAt
      };
      this.auditEvents.push(deepFreeze(staleEvent));
      return deepFreeze({
        ok: false,
        status: "STALE_DECISION",
        reason: `Source state changed from ${decision.currentState} to ${currentSourceRecord.status} before application`,
        sourceRecord: currentSourceRecord,
        auditEvent: staleEvent
      });
    }

    // Execute state transition
    const updatedSource = transitionSource(currentSourceRecord, decision.proposedState, {
      at: appliedAt,
      reason: decision.reasonCodes.join(" | ")
    });

    this.appliedDecisionIds.add(decision.decisionId);

    const transitionEvent = {
      eventType: "SOURCE_TRANSITION_APPLIED",
      sourceId: updatedSource.id,
      decisionId: decision.decisionId,
      fromState: decision.currentState,
      toState: decision.proposedState,
      reasonCodes: decision.reasonCodes,
      actor,
      occurredAt: appliedAt
    };
    this.auditEvents.push(deepFreeze(transitionEvent));

    return deepFreeze({
      ok: true,
      status: "APPLIED",
      sourceRecord: updatedSource,
      auditEvent: transitionEvent
    });
  }

  getAuditEvents() {
    return Object.freeze([...this.auditEvents]);
  }
}
