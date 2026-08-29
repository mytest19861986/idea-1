import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";

export const HealthLevel = Object.freeze({
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  CRITICAL: "CRITICAL",
  UNKNOWN: "UNKNOWN"
});

export const ContributionLevel = Object.freeze({
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  ZERO: "ZERO",
  UNKNOWN: "UNKNOWN"
});

export const EvaluationConfidence = Object.freeze({
  NONE: "NONE",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH"
});

export const FailureTaxonomy = Object.freeze({
  TECHNICAL_FAILURE: "TECHNICAL_FAILURE",
  RATE_LIMIT_PRESSURE: "RATE_LIMIT_PRESSURE",
  ACCESS_CONFIGURATION_FAILURE: "ACCESS_CONFIGURATION_FAILURE",
  POLICY_ACCESS_FAILURE: "POLICY_ACCESS_FAILURE"
});

export const GovernanceRecommendation = Object.freeze({
  NO_CHANGE: "NO_CHANGE",
  INVESTIGATE: "INVESTIGATE",
  DOWNRANK: "DOWNRANK",
  PAUSE_RECOMMENDED: "PAUSE_RECOMMENDED",
  RECOVERY_CANDIDATE: "RECOVERY_CANDIDATE"
});

export const EVALUATION_VERSION = "source-health-v1";
export const FORMULA_VERSION = "source-health-formula-v1";

/**
 * Classifies failure observation into deterministic failure taxonomy.
 * @param {object} obs
 * @returns {string|null}
 */
export function classifyFailureTaxonomy(obs) {
  if (obs.success) return null;
  if (obs.policyBlocked || obs.failureReason === "POLICY_BLOCKED" || obs.failureReason === "ROBOTS_TXT") {
    return FailureTaxonomy.POLICY_ACCESS_FAILURE;
  }
  if (obs.statusCode === 401 || obs.statusCode === 403 || obs.failureReason === "MISSING_CREDENTIAL") {
    return FailureTaxonomy.ACCESS_CONFIGURATION_FAILURE;
  }
  if (obs.statusCode === 429 || obs.failureReason === "RATE_LIMIT") {
    return FailureTaxonomy.RATE_LIMIT_PRESSURE;
  }
  return FailureTaxonomy.TECHNICAL_FAILURE;
}

/**
 * Normalizes raw observation input.
 * @param {Array<object>} observations
 * @returns {Array<object>}
 */
function normalizeObservations(observations) {
  if (!Array.isArray(observations)) {
    throw new TypeError("observations must be an array");
  }

  return observations.map((obs, idx) => {
    if (!obs || typeof obs !== "object") {
      throw new TypeError(`observation at index ${idx} must be an object`);
    }
    if (typeof obs.sourceId !== "string" || !obs.sourceId.trim()) {
      throw new TypeError(`observation at index ${idx} requires sourceId`);
    }
    if (typeof obs.success !== "boolean") {
      throw new TypeError(`observation at index ${idx} requires boolean success`);
    }
    validateIsoTimestamp(obs.occurredAt, `observation[${idx}].occurredAt`);

    const failureType = classifyFailureTaxonomy(obs);

    return {
      sourceId: obs.sourceId.trim(),
      success: obs.success,
      yieldCount: typeof obs.yieldCount === "number" && obs.yieldCount >= 0 ? obs.yieldCount : (obs.success ? 1 : 0),
      duplicateCount: typeof obs.duplicateCount === "number" && obs.duplicateCount >= 0 ? obs.duplicateCount : 0,
      uniqueCount: typeof obs.uniqueCount === "number" && obs.uniqueCount >= 0 ? obs.uniqueCount : (obs.success ? 1 : 0),
      statusCode: typeof obs.statusCode === "number" ? obs.statusCode : (obs.success ? 200 : 500),
      failureType,
      occurredAt: obs.occurredAt
    };
  });
}

/**
 * Computes deterministic sample confidence based on sample count.
 * @param {number} count
 * @returns {string}
 */
function computeSampleConfidence(count) {
  if (count === 0) return EvaluationConfidence.NONE;
  if (count < 5) return EvaluationConfidence.LOW;
  if (count < 20) return EvaluationConfidence.MEDIUM;
  return EvaluationConfidence.HIGH;
}

/**
 * Evaluates Source Health and Performance.
 *
 * Invariants:
 * - EVAL-R001: Explicit validated observation window (windowStart < windowEnd)
 * - EVAL-R002: UNKNOWN is first-class for insufficient evidence
 * - EVAL-R003: Operational health evaluated independently of value
 * - EVAL-R004: Intelligence contribution evaluated independently of technical reliability
 * - EVAL-R005 & EVAL-R006: Deterministic confidence model with sample sufficiency awareness
 * - EVAL-R007: Granular failure taxonomy (TECHNICAL, RATE_LIMIT, ACCESS_CONFIG, POLICY)
 * - EVAL-R008: Explicit evaluationVersion and formulaVersion
 * - EVAL-R009: Order-independent evaluation
 * - EVAL-R010: Deterministic replay
 * - EVAL-R011: Read-only governance recommendation (does NOT mutate SourceRegistry)
 *
 * @param {string} sourceId
 * @param {Array<object>} observations
 * @param {object} options
 * @param {string} options.windowStart - Window start ISO timestamp (MANDATORY)
 * @param {string} options.windowEnd - Window end ISO timestamp (MANDATORY)
 * @param {string} options.evaluatedAt - Evaluation ISO timestamp (MANDATORY)
 * @param {string} [options.actor="source-health-evaluator"]
 * @returns {object} SourceHealthSnapshot
 */
export function evaluateSourceHealth(
  sourceId,
  observations,
  {
    windowStart,
    windowEnd,
    evaluatedAt,
    actor = "source-health-evaluator"
  } = {}
) {
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    throw new TypeError("sourceId is required and must be a non-empty string");
  }
  const validatedWindowStart = validateIsoTimestamp(windowStart, "windowStart");
  const validatedWindowEnd = validateIsoTimestamp(windowEnd, "windowEnd");
  const validatedEvaluatedAt = validateIsoTimestamp(evaluatedAt, "evaluatedAt");

  const startMs = Date.parse(validatedWindowStart);
  const endMs = Date.parse(validatedWindowEnd);

  if (startMs >= endMs) {
    throw new TypeError(`windowStart (${validatedWindowStart}) must be strictly earlier than windowEnd (${validatedWindowEnd})`);
  }

  const targetSourceId = sourceId.trim();
  const allNormalized = normalizeObservations(observations);

  // Validate all observations belong to target sourceId
  if (allNormalized.some((obs) => obs.sourceId !== targetSourceId)) {
    throw new TypeError("all observations must belong to the specified sourceId");
  }

  // Filter observations deterministically within [windowStart, windowEnd]
  const windowObservations = allNormalized.filter((obs) => {
    const occurredMs = Date.parse(obs.occurredAt);
    return occurredMs >= startMs && occurredMs <= endMs;
  });

  const observationCount = windowObservations.length;
  const confidence = computeSampleConfidence(observationCount);

  // EVAL-R002: Zero observations -> UNKNOWN first-class
  if (observationCount === 0) {
    return deepFreeze({
      schemaVersion: 1,
      sourceId: targetSourceId,
      evaluationVersion: EVALUATION_VERSION,
      formulaVersion: FORMULA_VERSION,
      windowStart: validatedWindowStart,
      windowEnd: validatedWindowEnd,
      evaluatedAt: validatedEvaluatedAt,
      actor,
      observationCount: 0,
      operationalHealth: HealthLevel.UNKNOWN,
      intelligenceContribution: ContributionLevel.UNKNOWN,
      confidence: EvaluationConfidence.NONE,
      dimensions: {
        totalEvents: 0,
        successCount: 0,
        failureCount: 0,
        failureRate: null,
        totalYield: 0,
        uniqueYield: 0,
        duplicateRate: null,
        failureTaxonomyCounts: {
          TECHNICAL_FAILURE: 0,
          RATE_LIMIT_PRESSURE: 0,
          ACCESS_CONFIGURATION_FAILURE: 0,
          POLICY_ACCESS_FAILURE: 0
        }
      },
      findings: [
        {
          code: "INSUFFICIENT_OBSERVATION_DATA",
          detail: "No observations recorded within the specified window"
        }
      ],
      governanceRecommendation: GovernanceRecommendation.NO_CHANGE
    });
  }

  const successEvents = windowObservations.filter((o) => o.success);
  const failureEvents = windowObservations.filter((o) => !o.success);

  const successCount = successEvents.length;
  const failureCount = failureEvents.length;
  const failureRate = Number(((failureCount / observationCount) * 100).toFixed(2));

  const totalYield = windowObservations.reduce((acc, o) => acc + o.yieldCount, 0);
  const totalUnique = windowObservations.reduce((acc, o) => acc + o.uniqueCount, 0);
  const totalDuplicate = windowObservations.reduce((acc, o) => acc + o.duplicateCount, 0);

  const duplicateRate = totalYield > 0
    ? Number(((totalDuplicate / totalYield) * 100).toFixed(2))
    : 0.0;

  // Failure Taxonomy breakdown
  const failureTaxonomyCounts = {
    TECHNICAL_FAILURE: failureEvents.filter((o) => o.failureType === FailureTaxonomy.TECHNICAL_FAILURE).length,
    RATE_LIMIT_PRESSURE: failureEvents.filter((o) => o.failureType === FailureTaxonomy.RATE_LIMIT_PRESSURE).length,
    ACCESS_CONFIGURATION_FAILURE: failureEvents.filter((o) => o.failureType === FailureTaxonomy.ACCESS_CONFIGURATION_FAILURE).length,
    POLICY_ACCESS_FAILURE: failureEvents.filter((o) => o.failureType === FailureTaxonomy.POLICY_ACCESS_FAILURE).length
  };

  const findings = [];

  // Findings generation
  if (failureTaxonomyCounts.ACCESS_CONFIGURATION_FAILURE > 0) {
    findings.push({
      code: "ACCESS_CONFIGURATION_FAILURE",
      detail: `Encountered ${failureTaxonomyCounts.ACCESS_CONFIGURATION_FAILURE} access/credential failures (401/403)`
    });
  }
  if (failureTaxonomyCounts.POLICY_ACCESS_FAILURE > 0) {
    findings.push({
      code: "POLICY_ACCESS_FAILURE",
      detail: `Encountered ${failureTaxonomyCounts.POLICY_ACCESS_FAILURE} policy/robots.txt prohibition failures`
    });
  }
  if (failureTaxonomyCounts.RATE_LIMIT_PRESSURE > 0) {
    findings.push({
      code: "RATE_LIMIT_PRESSURE",
      detail: `Encountered ${failureTaxonomyCounts.RATE_LIMIT_PRESSURE} rate-limiting events (429)`
    });
  }
  if (failureTaxonomyCounts.TECHNICAL_FAILURE > 0) {
    findings.push({
      code: "TECHNICAL_FAILURE",
      detail: `Encountered ${failureTaxonomyCounts.TECHNICAL_FAILURE} technical/transport failures (5xx)`
    });
  }

  // 1. EVAL-R003: Operational Health Evaluation
  let operationalHealth = HealthLevel.HIGH;
  if (failureTaxonomyCounts.POLICY_ACCESS_FAILURE > 0 || failureTaxonomyCounts.ACCESS_CONFIGURATION_FAILURE > 0) {
    operationalHealth = HealthLevel.CRITICAL;
  } else if (failureRate >= 60) {
    operationalHealth = HealthLevel.CRITICAL;
  } else if (failureRate >= 25 || failureTaxonomyCounts.RATE_LIMIT_PRESSURE > 0) {
    operationalHealth = HealthLevel.MEDIUM;
  } else if (failureRate > 0) {
    operationalHealth = HealthLevel.HIGH;
  } else {
    operationalHealth = HealthLevel.HIGH;
  }

  // 2. EVAL-R004: Intelligence Contribution Evaluation
  let intelligenceContribution = ContributionLevel.HIGH;
  if (successCount === 0 || totalYield === 0) {
    intelligenceContribution = ContributionLevel.ZERO;
    findings.push({
      code: "ZERO_DISCOVERY_YIELD",
      detail: "Source produced zero candidate entities in observation window"
    });
  } else if (duplicateRate >= 80) {
    intelligenceContribution = ContributionLevel.LOW;
    findings.push({
      code: "HIGH_DUPLICATE_RATE",
      detail: `High candidate duplicate rate of ${duplicateRate}%`
    });
  } else if (duplicateRate >= 40) {
    intelligenceContribution = ContributionLevel.MEDIUM;
  } else {
    intelligenceContribution = ContributionLevel.HIGH;
  }

  // 3. EVAL-R011: Governance Recommendation (Read-Only)
  let governanceRecommendation = GovernanceRecommendation.NO_CHANGE;
  if (operationalHealth === HealthLevel.CRITICAL) {
    governanceRecommendation = GovernanceRecommendation.PAUSE_RECOMMENDED;
  } else if (operationalHealth === HealthLevel.MEDIUM || intelligenceContribution === ContributionLevel.LOW) {
    governanceRecommendation = GovernanceRecommendation.DOWNRANK;
  } else if (operationalHealth === HealthLevel.HIGH && intelligenceContribution === ContributionLevel.HIGH) {
    governanceRecommendation = GovernanceRecommendation.NO_CHANGE;
  } else {
    governanceRecommendation = GovernanceRecommendation.INVESTIGATE;
  }

  return deepFreeze({
    schemaVersion: 1,
    sourceId: targetSourceId,
    evaluationVersion: EVALUATION_VERSION,
    formulaVersion: FORMULA_VERSION,
    windowStart: validatedWindowStart,
    windowEnd: validatedWindowEnd,
    evaluatedAt: validatedEvaluatedAt,
    actor,
    observationCount,
    operationalHealth,
    intelligenceContribution,
    confidence,
    dimensions: {
      totalEvents: observationCount,
      successCount,
      failureCount,
      failureRate,
      totalYield,
      uniqueYield: totalUnique,
      duplicateRate,
      failureTaxonomyCounts
    },
    findings,
    governanceRecommendation
  });
}
