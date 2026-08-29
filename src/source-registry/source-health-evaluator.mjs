import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";

export const HealthStatus = Object.freeze({
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  CRITICAL: "CRITICAL",
  UNKNOWN: "UNKNOWN"
});

export const GovernanceRecommendation = Object.freeze({
  MAINTAIN_ACTIVE: "MAINTAIN_ACTIVE",
  DEGRADE_RECOMMENDED: "DEGRADE_RECOMMENDED",
  PAUSE_RECOMMENDED: "PAUSE_RECOMMENDED",
  RETIRE_RECOMMENDED: "RETIRE_RECOMMENDED",
  MONITOR_CONTINUED: "MONITOR_CONTINUED"
});

export const EVALUATOR_VERSION = "source-health-v1";

/**
 * Validates and normalizes raw source observation records.
 * @param {Array<object>} observations
 * @returns {Array<object>}
 */
function normalizeObservations(observations) {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new TypeError("observations must be a non-empty array");
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

    return {
      sourceId: obs.sourceId.trim(),
      success: obs.success,
      yieldCount: typeof obs.yieldCount === "number" && obs.yieldCount >= 0 ? obs.yieldCount : (obs.success ? 1 : 0),
      statusCode: typeof obs.statusCode === "number" ? obs.statusCode : (obs.success ? 200 : 500),
      occurredAt: obs.occurredAt
    };
  });
}

/**
 * Evaluates Source Health and generates deterministic SourceHealthSnapshot.
 *
 * Invariants:
 * - Deterministic, versioned evaluation (EVALUATOR_VERSION)
 * - Source Health != Source Quality (differentiates technical availability from yield)
 * - Read-only: Does NOT mutate SourceRegistry state
 * - Mandatory ISO timestamp 'evaluatedAt' (No hidden clock)
 * - Outputs actionable findings and governance recommendations
 *
 * @param {string} sourceId
 * @param {Array<object>} observations - Raw collection/discovery observation records
 * @param {object} options
 * @param {string} options.evaluatedAt - Explicit ISO 8601 timestamp (MANDATORY)
 * @param {number} [options.degradedFailureRateThreshold=25] - % failure to trigger DEGRADED
 * @param {number} [options.criticalFailureRateThreshold=60] - % failure to trigger CRITICAL / PAUSE
 * @param {string} [options.actor="source-health-evaluator"]
 * @returns {object} SourceHealthSnapshot
 */
export function evaluateSourceHealth(
  sourceId,
  observations,
  {
    evaluatedAt,
    degradedFailureRateThreshold = 25,
    criticalFailureRateThreshold = 60,
    actor = "source-health-evaluator"
  } = {}
) {
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    throw new TypeError("sourceId is required and must be a non-empty string");
  }
  validateIsoTimestamp(evaluatedAt, "evaluatedAt");

  const normalized = normalizeObservations(observations);
  const targetSourceId = sourceId.trim();

  // Validate all observations belong to the target source
  if (normalized.some((obs) => obs.sourceId !== targetSourceId)) {
    throw new TypeError("all observations must belong to the specified sourceId");
  }

  const totalEvents = normalized.length;
  const successEvents = normalized.filter((o) => o.success);
  const failureEvents = normalized.filter((o) => !o.success);

  const successCount = successEvents.length;
  const failureCount = failureEvents.length;
  const failureRate = Number(((failureCount / totalEvents) * 100).toFixed(2));
  const totalYield = normalized.reduce((acc, o) => acc + o.yieldCount, 0);

  const latestOccurredAt = normalized.reduce(
    (latest, o) => (latest > o.occurredAt ? latest : o.occurredAt),
    normalized[0].occurredAt
  );

  const findings = [];
  let healthStatus = HealthStatus.HEALTHY;
  let governanceRecommendation = GovernanceRecommendation.MAINTAIN_ACTIVE;

  // Rate limit / 429 observations
  const rateLimitCount = failureEvents.filter((o) => o.statusCode === 429).length;
  if (rateLimitCount > 0) {
    findings.push({
      code: "RATE_LIMIT_ENCOUNTERED",
      detail: `Encountered ${rateLimitCount} rate-limiting (429) events`
    });
  }

  // Failure rate classification
  if (failureRate >= criticalFailureRateThreshold) {
    healthStatus = HealthStatus.CRITICAL;
    governanceRecommendation = GovernanceRecommendation.PAUSE_RECOMMENDED;
    findings.push({
      code: "CRITICAL_FAILURE_RATE",
      detail: `Failure rate of ${failureRate}% exceeds critical threshold of ${criticalFailureRateThreshold}%`
    });
  } else if (failureRate >= degradedFailureRateThreshold) {
    healthStatus = HealthStatus.DEGRADED;
    governanceRecommendation = GovernanceRecommendation.DEGRADE_RECOMMENDED;
    findings.push({
      code: "HIGH_FAILURE_RATE",
      detail: `Failure rate of ${failureRate}% exceeds degraded threshold of ${degradedFailureRateThreshold}%`
    });
  } else {
    healthStatus = HealthStatus.HEALTHY;
    governanceRecommendation = GovernanceRecommendation.MAINTAIN_ACTIVE;
    findings.push({
      code: "OPERATIONAL_NORMAL",
      detail: `Source operates within healthy parameters (failure rate: ${failureRate}%)`
    });
  }

  // Yield observation
  if (successCount > 0 && totalYield === 0) {
    findings.push({
      code: "ZERO_DISCOVERY_YIELD",
      detail: "Source is technically responding but produced zero new candidate items"
    });
  }

  return deepFreeze({
    schemaVersion: 1,
    sourceId: targetSourceId,
    evaluatorVersion: EVALUATOR_VERSION,
    evaluatedAt,
    actor,
    metrics: {
      totalEvents,
      successCount,
      failureCount,
      failureRate,
      totalYield,
      latestOccurredAt
    },
    healthStatus,
    governanceRecommendation,
    findings
  });
}
