import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * DISCOVERY WORKER TASK & RETRY CONTRACT (PKG-WORKER-014)
 * Invariants: WORK-I001 through WORK-I027
 * Retry Policy Version: worker-retry-v1
 * ============================================================================
 */

export const RETRY_POLICY_VERSION = "worker-retry-v1";

export const TaskType = Object.freeze({
  DISCOVERY_EXECUTION: "DISCOVERY_EXECUTION",
  HEALTH_EVALUATION: "HEALTH_EVALUATION",
  GOVERNANCE_EVALUATION: "GOVERNANCE_EVALUATION"
});

export const TaskState = Object.freeze({
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  RETRYABLE_FAILURE: "RETRYABLE_FAILURE",
  FINAL_FAILURE: "FINAL_FAILURE",
  EXHAUSTED: "EXHAUSTED",
  REJECTED: "REJECTED"
});

export const FailureClassification = Object.freeze({
  TRANSIENT_TRANSPORT: "TRANSIENT_TRANSPORT",
  RATE_LIMIT_PRESSURE: "RATE_LIMIT_PRESSURE",
  TECHNICAL_FAILURE: "TECHNICAL_FAILURE",
  ACCESS_CONFIGURATION_FAILURE: "ACCESS_CONFIGURATION_FAILURE",
  POLICY_ACCESS_FAILURE: "POLICY_ACCESS_FAILURE",
  DOMAIN_VALIDATION_FAILURE: "DOMAIN_VALIDATION_FAILURE",
  UNKNOWN_FAILURE: "UNKNOWN_FAILURE"
});

export const DEFAULT_RETRY_CONFIG = Object.freeze({
  maxAttempts: 3,
  baseBackoffMs: 1000,
  maxBackoffMs: 60000,
  retryPolicyVersion: RETRY_POLICY_VERSION
});

/**
 * Calculate deterministic exponential backoff delay.
 * Returns exact bounded milliseconds.
 */
export function calculateBackoffMs(attemptNumber, baseMs = 1000, maxMs = 60000, retryAfterMs = null) {
  if (typeof retryAfterMs === "number" && retryAfterMs > 0) {
    return Math.min(Math.max(0, retryAfterMs), maxMs);
  }
  const attempt = Math.max(1, Number.isInteger(attemptNumber) ? attemptNumber : 1);
  const factor = Math.pow(2, attempt - 1);
  const calculated = baseMs * factor;
  return Math.min(calculated, maxMs);
}

/**
 * Validate and create an immutable WorkerTask.
 */
export function createWorkerTask(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("task input must be an object");
  }
  if (!input.taskId || typeof input.taskId !== "string") {
    throw new TypeError("valid taskId string is required");
  }
  if (!input.taskType || !Object.values(TaskType).includes(input.taskType)) {
    throw new TypeError(`valid taskType is required, received: ${input.taskType}`);
  }
  if (!input.sourceId || typeof input.sourceId !== "string") {
    throw new TypeError("valid sourceId string is required");
  }

  const createdAt = input.createdAt || new Date().toISOString();
  validateIsoTimestamp(createdAt, "createdAt");

  const task = {
    taskId: input.taskId,
    taskType: input.taskType,
    sourceId: input.sourceId,
    executionId: input.executionId || `exec:${input.sourceId}:${Date.parse(createdAt)}`,
    payload: input.payload ? { ...input.payload } : {},
    maxAttempts: Number.isInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : DEFAULT_RETRY_CONFIG.maxAttempts,
    schemaVersion: input.schemaVersion || 1,
    retryPolicyVersion: input.retryPolicyVersion || RETRY_POLICY_VERSION,
    createdAt,
    metadata: input.metadata ? { ...input.metadata } : {}
  };

  return deepFreeze(task);
}

/**
 * Classify a caught error into the worker failure taxonomy.
 */
export function classifyWorkerError(error) {
  if (!error) return FailureClassification.UNKNOWN_FAILURE;

  const msg = (error.message || String(error)).toLowerCase();
  const statusCode = error.statusCode || error.status;

  if (statusCode === 429 || msg.includes("rate limit") || msg.includes("429")) {
    return FailureClassification.RATE_LIMIT_PRESSURE;
  }
  if (statusCode === 401 || statusCode === 403 || msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("401") || msg.includes("403")) {
    return FailureClassification.ACCESS_CONFIGURATION_FAILURE;
  }
  if (msg.includes("policy") || msg.includes("terms of service") || msg.includes("blocked_by_policy")) {
    return FailureClassification.POLICY_ACCESS_FAILURE;
  }
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("econnreset") || msg.includes("503") || msg.includes("502")) {
    return FailureClassification.TRANSIENT_TRANSPORT;
  }
  if (error instanceof TypeError || msg.includes("invalid") || msg.includes("validation")) {
    return FailureClassification.DOMAIN_VALIDATION_FAILURE;
  }

  return FailureClassification.TECHNICAL_FAILURE;
}

/**
 * Determine if a failure classification is eligible for retry.
 */
export function isRetryableFailure(classification) {
  switch (classification) {
    case FailureClassification.TRANSIENT_TRANSPORT:
    case FailureClassification.RATE_LIMIT_PRESSURE:
    case FailureClassification.TECHNICAL_FAILURE:
      return true;
    case FailureClassification.ACCESS_CONFIGURATION_FAILURE:
    case FailureClassification.POLICY_ACCESS_FAILURE:
    case FailureClassification.DOMAIN_VALIDATION_FAILURE:
    default:
      return false;
  }
}
