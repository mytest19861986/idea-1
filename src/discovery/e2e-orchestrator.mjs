import { deepFreeze, validateIsoTimestamp } from "./discovery-intake.mjs";
import { PipelineStatus, executeDiscoveryPipeline } from "./pipeline.mjs";
import { evaluateSourceHealth } from "../source-registry/source-health-evaluator.mjs";
import {
  GovernanceOutcome,
  evaluateGovernance,
  SourceGovernanceApplier
} from "../source-registry/source-governance.mjs";

/**
 * Deterministic Observation Record Generator.
 * Adapts pipeline execution result into a normalized source health observation.
 * Invariant: E2E-I002, E2E-I003 (Confidentiality Protection in observations), E2E-I009.
 *
 * @param {string} sourceId
 * @param {object} pipelineResult
 * @param {object} options
 * @param {string} options.occurredAt - ISO timestamp
 * @param {string} options.executionId - Correlated execution ID
 * @returns {object} Normalized Observation
 */
export function deriveObservationFromPipelineResult(
  sourceId,
  pipelineResult,
  { occurredAt, executionId }
) {
  validateIsoTimestamp(occurredAt, "occurredAt");
  const isSuccess = pipelineResult.pipelineStatus === PipelineStatus.COMPLETED;
  const isRejected = pipelineResult.pipelineStatus === PipelineStatus.REJECTED_AT_INTAKE;
  const isConflict = pipelineResult.pipelineStatus === PipelineStatus.CONFLICT_AT_STORE;

  let statusCode = 200;
  let failureReason = null;
  let yieldCount = 0;
  let duplicateCount = 0;
  let uniqueCount = 0;

  if (isSuccess) {
    statusCode = 200;
    yieldCount = 1;
    if (pipelineResult.stages.store?.status === "REPLAYED") {
      duplicateCount = 1;
      uniqueCount = 0;
    } else {
      duplicateCount = 0;
      uniqueCount = 1;
    }
  } else if (isRejected) {
    const reason = pipelineResult.stages.intake?.reason || "INTAKE_REJECTED";
    if (reason.includes("ROBOTS") || reason.includes("POLICY")) {
      failureReason = "POLICY_BLOCKED";
      statusCode = 403;
    } else if (reason.includes("CREDENTIAL") || reason.includes("AUTH")) {
      failureReason = "MISSING_CREDENTIAL";
      statusCode = 401;
    } else {
      failureReason = "VALIDATION_FAILED";
      statusCode = 400;
    }
  } else if (isConflict) {
    statusCode = 409;
    failureReason = "STORE_CONFLICT";
  } else {
    statusCode = 500;
    failureReason = "PIPELINE_FAILED";
  }

  // E2E-I003: Observations must never contain sensitive/confidential domains or URLs
  const observationId = `obs:${sourceId}:${executionId}:${Date.parse(occurredAt)}`;

  return deepFreeze({
    observationId,
    executionId,
    sourceId,
    success: isSuccess,
    statusCode,
    failureReason,
    yieldCount,
    duplicateCount,
    uniqueCount,
    occurredAt
  });
}

/**
 * End-to-End Discovery and Governance Lifecycle Orchestrator.
 * Connects Data Plane (Intake, Store, Resolution) with Control Plane (Health Assessment, Governance).
 *
 * Invariants:
 * - E2E-I001: Data plane and control plane strictly separated
 * - E2E-I002 & E2E-I003: Controlled observation generation with confidentiality protection
 * - E2E-I004: Source state transitions immediately gate future intake
 * - E2E-I005: Historical candidate records remain immutable after source state changes
 * - E2E-I006: Reversible automated transitions executed only when authorized
 * - E2E-I007: Stale decision protection exposed without silent retries
 * - E2E-I008: Manual review decisions preserve decision and do NOT mutate SourceRegistry
 * - E2E-I009: Discovery failure does not fabricate successful health observations
 * - E2E-I014: Full system replay idempotency
 * - E2E-I018: Zero source-specific logic
 *
 * @param {object} rawDoc
 * @param {object} context
 * @param {object} context.sourceRecord - Current registered source record
 * @param {object} context.store - Candidate discovery store
 * @param {object} [context.resolutionEngine] - Entity resolution engine
 * @param {Array<object>} [context.resolutionContext=[]] - Candidate records for resolution
 * @param {Array<object>} [context.observationHistory=[]] - Historical observations for source
 * @param {Array<object>} [context.healthSnapshotHistory=[]] - Historical health snapshots
 * @param {object} [context.governanceApplier] - SourceGovernanceApplier instance
 * @param {boolean} [context.runControlPlane=false] - Whether to evaluate and apply governance in this turn
 * @param {string} [context.windowStart] - Health evaluation window start (required if runControlPlane=true)
 * @param {string} [context.windowEnd] - Health evaluation window end (required if runControlPlane=true)
 * @param {string} [context.lastTransitionAt] - Timestamp of last source transition
 * @param {string} context.at - Explicit ISO 8601 execution timestamp (MANDATORY)
 * @param {string} context.executionId - Unique execution correlation ID (MANDATORY)
 * @param {string} [context.actor="discovery-e2e-orchestrator"]
 * @returns {object} System Execution Envelope
 */
export function executeDiscoveryE2E(
  rawDoc,
  {
    sourceRecord,
    store,
    resolutionEngine,
    resolutionContext = [],
    observationHistory = [],
    healthSnapshotHistory = [],
    governanceApplier,
    runControlPlane = false,
    windowStart,
    windowEnd,
    lastTransitionAt = null,
    at,
    executionId,
    actor = "discovery-e2e-orchestrator"
  } = {}
) {
  validateIsoTimestamp(at, "at");
  if (!executionId || typeof executionId !== "string" || !executionId.trim()) {
    throw new TypeError("executionId is required and must be a non-empty string");
  }
  if (!sourceRecord || typeof sourceRecord.id !== "string") {
    throw new TypeError("valid sourceRecord is required");
  }

  // -------------------------------------------------------------
  // 1. DATA PLANE EXECUTION
  // -------------------------------------------------------------
  const discoveryResult = executeDiscoveryPipeline(rawDoc, {
    sourceRecord,
    store,
    resolutionEngine,
    resolutionContext,
    at,
    executionId,
    actor
  });

  // 2. OBSERVATION GENERATION (E2E-I002, E2E-I009)
  const currentObservation = deriveObservationFromPipelineResult(
    sourceRecord.id,
    discoveryResult,
    { occurredAt: at, executionId }
  );

  const combinedObservations = [...observationHistory, currentObservation];

  // -------------------------------------------------------------
  // 3. CONTROL PLANE EXECUTION (OPTIONAL / REQUEST-DRIVEN)
  // -------------------------------------------------------------
  let healthEvaluation = { executed: false, snapshot: null };
  let governance = {
    executed: false,
    decision: null,
    transitionAttempted: false,
    transitionApplied: false,
    applicationStatus: "NOT_RUN",
    updatedSourceRecord: sourceRecord
  };

  if (runControlPlane) {
    if (!windowStart || !windowEnd) {
      throw new TypeError("windowStart and windowEnd are required when runControlPlane is true");
    }

    // A. Evaluate Health
    const healthSnapshot = evaluateSourceHealth(
      sourceRecord.id,
      combinedObservations,
      {
        windowStart,
        windowEnd,
        evaluatedAt: at,
        actor
      }
    );

    healthEvaluation = {
      executed: true,
      snapshot: healthSnapshot
    };

    // B. Evaluate Governance
    const combinedSnapshots = [...healthSnapshotHistory, healthSnapshot];
    const governanceDecision = evaluateGovernance(
      sourceRecord,
      combinedSnapshots,
      {
        decisionAt: at,
        lastTransitionAt,
        actor
      }
    );

    let transitionAttempted = false;
    let transitionApplied = false;
    let applicationStatus = "NO_TRANSITION_REQUIRED";
    let updatedSourceRecord = sourceRecord;

    // C. Apply Governance (E2E-I006, E2E-I007, E2E-I008)
    if (governanceDecision.decision === GovernanceOutcome.ALLOW_AUTOMATIC_TRANSITION) {
      transitionAttempted = true;
      const applier = governanceApplier || new SourceGovernanceApplier();
      const appResult = applier.applyDecision(sourceRecord, governanceDecision, {
        appliedAt: at,
        actor
      });

      if (appResult.ok) {
        transitionApplied = true;
        applicationStatus = appResult.status; // "APPLIED" or "REPLAYED"
        updatedSourceRecord = appResult.sourceRecord;
      } else {
        transitionApplied = false;
        applicationStatus = appResult.status; // e.g. "STALE_DECISION"
      }
    } else if (governanceDecision.decision === GovernanceOutcome.REQUIRE_MANUAL_REVIEW) {
      applicationStatus = "MANUAL_REVIEW_REQUIRED";
    } else if (governanceDecision.decision === GovernanceOutcome.INVESTIGATE) {
      applicationStatus = "INVESTIGATION_REQUIRED";
    }

    governance = {
      executed: true,
      decision: governanceDecision,
      transitionAttempted,
      transitionApplied,
      applicationStatus,
      updatedSourceRecord
    };
  }

  return deepFreeze({
    executionId,
    executedAt: at,
    actor,
    sourceId: sourceRecord.id,
    dataPlane: {
      pipelineStatus: discoveryResult.pipelineStatus,
      candidateId: discoveryResult.candidateId,
      stages: discoveryResult.stages,
      auditEvents: discoveryResult.auditEvents
    },
    observations: [currentObservation],
    controlPlane: {
      healthEvaluation,
      governance
    },
    sourceRecord: governance.updatedSourceRecord
  });
}
