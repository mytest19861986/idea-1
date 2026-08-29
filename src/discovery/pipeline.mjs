import { deepFreeze, validateIsoTimestamp } from "./discovery-intake.mjs";
import { processDiscoveryIntake } from "./discovery-intake.mjs";
import { ResolutionDecision } from "./entity-resolution.mjs";

export const PipelineStatus = Object.freeze({
  COMPLETED: "COMPLETED",
  REJECTED_AT_INTAKE: "REJECTED_AT_INTAKE",
  CONFLICT_AT_STORE: "CONFLICT_AT_STORE",
  RESOLUTION_BLOCKED: "RESOLUTION_BLOCKED",
  FAILED: "FAILED"
});

export const StageStatus = Object.freeze({
  NOT_RUN: "NOT_RUN",
  SUCCESS: "SUCCESS",
  REJECTED: "REJECTED",
  STORED: "STORED",
  REPLAYED: "REPLAYED",
  CONFLICT: "CONFLICT",
  CONFIRMED: "CONFIRMED",
  POSSIBLE: "POSSIBLE",
  PROBABLE: "PROBABLE",
  DISTINCT: "DISTINCT",
  BLOCKED: "BLOCKED",
  UNRESOLVED: "UNRESOLVED"
});

/**
 * End-to-End Discovery Pipeline Processor.
 * Composes existing approved boundary modules:
 * 1. processDiscoveryIntake (RawDocument validation, state gating, provenance, confidentiality)
 * 2. DiscoveryCandidateStore (Idempotency, conflict detection, append-only attributions)
 * 3. EntityResolutionEngine (Cross-source pairwise deduplication & cluster attachment)
 *
 * Invariants:
 * - PIPELINE-I001: Strict stage order (INTAKE -> STORE -> RESOLUTION)
 * - PIPELINE-I002: Fail-closed execution (failed early stages prevent downstream execution)
 * - PIPELINE-I003: Explicit execution context (mandatory ISO timestamp 'at', executionId, actor)
 * - PIPELINE-I004: Idempotent replay without duplication
 * - PIPELINE-I005: Stage result envelope with granular status
 * - PIPELINE-I006: Audit correlation with executionId
 * - PIPELINE-I007: Preserves fact vs claim boundary
 * - PIPELINE-I008: Confidentiality preserved across entire transit
 * - PIPELINE-I009: Entity resolution is optional; UNRESOLVED is a valid outcome
 * - PIPELINE-I010: Operates only on explicitly supplied entity context
 * - PIPELINE-I011: Zero source-specific orchestration
 * - PIPELINE-I012: Inputs and stage outputs are immutable
 *
 * @param {object} rawDoc - RawDocument to process
 * @param {object} context
 * @param {object} context.sourceRecord - Registered source record
 * @param {object} context.store - DiscoveryCandidateStore instance
 * @param {object} [context.resolutionEngine] - EntityResolutionEngine instance
 * @param {Array<object>} [context.resolutionContext=[]] - Explicit candidate records to evaluate against
 * @param {string} context.at - Explicit ISO 8601 execution timestamp (MANDATORY)
 * @param {string} context.executionId - Explicit correlation identifier (MANDATORY)
 * @param {string} [context.actor="discovery-pipeline"]
 * @returns {object} Correlated pipeline execution envelope
 */
export function executeDiscoveryPipeline(
  rawDoc,
  {
    sourceRecord,
    store,
    resolutionEngine,
    resolutionContext = [],
    at,
    executionId,
    actor = "discovery-pipeline"
  } = {}
) {
  validateIsoTimestamp(at, "at");
  if (!executionId || typeof executionId !== "string" || !executionId.trim()) {
    throw new TypeError("executionId is required and must be a non-empty string");
  }
  if (!store || typeof store.putCandidate !== "function") {
    throw new TypeError("valid candidate store is required");
  }

  const correlatedAuditEvents = [];

  const attachCorrelation = (event) => {
    if (!event) return null;
    return deepFreeze({
      ...event,
      executionId
    });
  };

  // -------------------------------------------------------------
  // STAGE 1: INTAKE
  // -------------------------------------------------------------
  const intakeResult = processDiscoveryIntake(rawDoc, {
    sourceRecord,
    processedAt: at,
    actor
  });

  if (intakeResult.auditEvent) {
    correlatedAuditEvents.push(attachCorrelation(intakeResult.auditEvent));
  }

  if (!intakeResult.ok) {
    return deepFreeze({
      executionId,
      executedAt: at,
      actor,
      pipelineStatus: PipelineStatus.REJECTED_AT_INTAKE,
      candidateId: null,
      stages: {
        intake: {
          status: StageStatus.REJECTED,
          reason: intakeResult.reason,
          rejectionStatus: intakeResult.status
        },
        store: { status: StageStatus.NOT_RUN },
        resolution: { status: StageStatus.NOT_RUN }
      },
      auditEvents: correlatedAuditEvents
    });
  }

  const candidateRecord = intakeResult.discoveryRecord;

  // -------------------------------------------------------------
  // STAGE 2: STORE
  // -------------------------------------------------------------
  const storeResult = store.putCandidate(candidateRecord, {
    at,
    actor
  });

  if (storeResult.auditEvent) {
    correlatedAuditEvents.push(attachCorrelation(storeResult.auditEvent));
  }

  if (!storeResult.ok) {
    return deepFreeze({
      executionId,
      executedAt: at,
      actor,
      pipelineStatus: PipelineStatus.CONFLICT_AT_STORE,
      candidateId: candidateRecord.discoveryId,
      stages: {
        intake: {
          status: StageStatus.SUCCESS,
          discoveryId: candidateRecord.discoveryId
        },
        store: {
          status: StageStatus.CONFLICT,
          reason: storeResult.reason,
          conflictStatus: storeResult.status
        },
        resolution: { status: StageStatus.NOT_RUN }
      },
      auditEvents: correlatedAuditEvents
    });
  }

  const storedCandidate = storeResult.record;
  const storeStageStatus = storeResult.status === "REPLAYED" ? StageStatus.REPLAYED : StageStatus.STORED;

  // -------------------------------------------------------------
  // STAGE 3: ENTITY RESOLUTION (OPTIONAL / CONTEXT-DRIVEN)
  // -------------------------------------------------------------
  let resolutionStage = { status: StageStatus.NOT_RUN };
  let pipelineStatus = PipelineStatus.COMPLETED;

  if (resolutionEngine && typeof resolutionEngine.resolvePair === "function" && Array.isArray(resolutionContext)) {
    let resolvedAny = false;
    let highestDecision = ResolutionDecision.UNRESOLVED;
    const pairDecisions = [];

    for (const existingCandidate of resolutionContext) {
      if (!existingCandidate || existingCandidate.discoveryId === storedCandidate.discoveryId) {
        continue;
      }

      resolvedAny = true;
      const decision = resolutionEngine.resolvePair(storedCandidate, existingCandidate, {
        at,
        actor
      });
      pairDecisions.push(decision);

      if (decision.decision === ResolutionDecision.CONFIRMED_MATCH) {
        highestDecision = ResolutionDecision.CONFIRMED_MATCH;
        break; // Confirmed match found
      } else if (decision.decision === ResolutionDecision.BLOCKED_CONFIDENTIAL && highestDecision !== ResolutionDecision.CONFIRMED_MATCH) {
        highestDecision = ResolutionDecision.BLOCKED_CONFIDENTIAL;
      } else if (decision.decision === ResolutionDecision.PROBABLE_MATCH && highestDecision !== ResolutionDecision.CONFIRMED_MATCH) {
        highestDecision = ResolutionDecision.PROBABLE_MATCH;
      } else if (decision.decision === ResolutionDecision.POSSIBLE_MATCH && highestDecision === ResolutionDecision.UNRESOLVED) {
        highestDecision = ResolutionDecision.POSSIBLE_MATCH;
      } else if (decision.decision === ResolutionDecision.CONFIRMED_DISTINCT && highestDecision === ResolutionDecision.UNRESOLVED) {
        highestDecision = ResolutionDecision.CONFIRMED_DISTINCT;
      }
    }

    if (!resolvedAny) {
      resolutionStage = {
        status: StageStatus.UNRESOLVED,
        reason: "No other candidates provided in resolution context"
      };
    } else {
      let stageStatus = StageStatus.UNRESOLVED;
      if (highestDecision === ResolutionDecision.CONFIRMED_MATCH) stageStatus = StageStatus.CONFIRMED;
      else if (highestDecision === ResolutionDecision.PROBABLE_MATCH) stageStatus = StageStatus.PROBABLE;
      else if (highestDecision === ResolutionDecision.POSSIBLE_MATCH) stageStatus = StageStatus.POSSIBLE;
      else if (highestDecision === ResolutionDecision.CONFIRMED_DISTINCT) stageStatus = StageStatus.DISTINCT;
      else if (highestDecision === ResolutionDecision.BLOCKED_CONFIDENTIAL) {
        stageStatus = StageStatus.BLOCKED;
        pipelineStatus = PipelineStatus.RESOLUTION_BLOCKED;
      }

      resolutionStage = {
        status: stageStatus,
        highestDecision,
        evaluatedPairs: pairDecisions.length,
        decisions: pairDecisions
      };
    }
  } else {
    resolutionStage = {
      status: StageStatus.NOT_RUN,
      reason: "No resolution engine configured or no context available"
    };
  }

  return deepFreeze({
    executionId,
    executedAt: at,
    actor,
    pipelineStatus,
    candidateId: storedCandidate.discoveryId,
    candidate: storedCandidate,
    stages: {
      intake: {
        status: StageStatus.SUCCESS,
        discoveryId: storedCandidate.discoveryId
      },
      store: {
        status: storeStageStatus,
        discoveryId: storedCandidate.discoveryId
      },
      resolution: resolutionStage
    },
    auditEvents: correlatedAuditEvents
  });
}
