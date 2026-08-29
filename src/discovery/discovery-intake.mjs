import { SourceStatus } from "../source-registry/lifecycle.mjs";

/**
 * Validates the raw document structure against the generic RawDocument contract.
 * @param {object} rawDoc
 * @returns {object} validated and frozen raw document
 */
export function validateRawDocument(rawDoc) {
  if (!rawDoc || typeof rawDoc !== "object") {
    throw new TypeError("raw document is required and must be an object");
  }
  if (rawDoc.schemaVersion !== 1) {
    throw new TypeError(`unsupported schemaVersion: ${rawDoc.schemaVersion}`);
  }
  if (typeof rawDoc.sourceId !== "string" || !rawDoc.sourceId.trim()) {
    throw new TypeError("sourceId is required and must be a non-empty string");
  }
  if (typeof rawDoc.sourceType !== "string" || !rawDoc.sourceType.trim()) {
    throw new TypeError("sourceType is required and must be a non-empty string");
  }
  if (typeof rawDoc.canonicalUrl !== "string" || !rawDoc.canonicalUrl.trim()) {
    throw new TypeError("canonicalUrl is required and must be a non-empty string");
  }

  const url = new URL(rawDoc.canonicalUrl);
  if (url.protocol !== "https:") {
    throw new TypeError("canonicalUrl must use HTTPS");
  }

  if (typeof rawDoc.title !== "string" || !rawDoc.title.trim()) {
    throw new TypeError("title is required and must be a non-empty string");
  }
  if (typeof rawDoc.discoveredAt !== "string" || !rawDoc.discoveredAt.trim()) {
    throw new TypeError("discoveredAt is required and must be an ISO string");
  }
  if (typeof rawDoc.retrievedAt !== "string" || !rawDoc.retrievedAt.trim()) {
    throw new TypeError("retrievedAt is required and must be an ISO string");
  }
  if (!rawDoc.metadata || typeof rawDoc.metadata !== "object") {
    throw new TypeError("metadata is required and must be an object");
  }

  return rawDoc;
}

/**
 * Checks whether a source status allows discovery intake.
 * Sources in CANDIDATE, EVALUATING, REJECTED, RETIRED, PAUSED, or DEGRADED are blocked.
 * Sources in APPROVED (including approved for controlled collection) or ACTIVE are eligible.
 * @param {string} status
 * @returns {boolean}
 */
export function isSourceEligibleForIntake(status) {
  return status === SourceStatus.APPROVED || status === SourceStatus.ACTIVE;
}

/**
 * Generates a deterministic discovery identity from sourceId and canonicalUrl.
 * @param {string} sourceId
 * @param {string} canonicalUrl
 * @returns {string}
 */
export function computeDeterministicDiscoveryId(sourceId, canonicalUrl) {
  return `disc:${sourceId}:${canonicalUrl}`;
}

/**
 * Core functional discovery intake processor.
 * Ingests a RawDocument against an existing SourceRecord from the SourceRegistry.
 * Enforces:
 * - Generic RawDocument validation
 * - Source existence & state gating (APPROVED or ACTIVE only)
 * - Deterministic discovery identity & idempotency key
 * - Strict preservation of SOURCE_CLAIM financials and provenance
 * - Confidential entity isolation (contentReference nullified, is_confidential: true)
 * - Emits frozen candidate discovery record and deterministic audit event
 *
 * @param {object} rawDoc
 * @param {object} options
 * @param {object} options.sourceRecord - Registered source record from SourceRegistry
 * @param {string} [options.actor="discovery-intake-service"] - Operating actor
 * @param {string} [options.processedAt] - Intake timestamp (defaults to current ISO string)
 * @returns {object} { ok: boolean, status: string, discoveryRecord?: object, auditEvent?: object, reason?: string }
 */
export function processDiscoveryIntake(rawDoc, { sourceRecord, actor = "discovery-intake-service", processedAt = new Date().toISOString() } = {}) {
  // 1. Validate RawDocument schema
  try {
    validateRawDocument(rawDoc);
  } catch (err) {
    return Object.freeze({
      ok: false,
      status: "SCHEMA_VALIDATION_FAILED",
      reason: err.message,
      auditEvent: Object.freeze({
        eventType: "DISCOVERY_INTAKE_REJECTED",
        sourceId: rawDoc?.sourceId ?? "UNKNOWN",
        canonicalUrl: rawDoc?.canonicalUrl ?? null,
        reason: err.message,
        actor,
        timestamp: processedAt
      })
    });
  }

  // 2. Validate Source Existence
  if (!sourceRecord || typeof sourceRecord !== "object" || !sourceRecord.id) {
    return Object.freeze({
      ok: false,
      status: "SOURCE_NOT_REGISTERED",
      reason: `Source '${rawDoc.sourceId}' is not registered in the Source Registry`,
      auditEvent: Object.freeze({
        eventType: "DISCOVERY_INTAKE_REJECTED",
        sourceId: rawDoc.sourceId,
        canonicalUrl: rawDoc.canonicalUrl,
        reason: "SOURCE_NOT_REGISTERED",
        actor,
        timestamp: processedAt
      })
    });
  }

  if (sourceRecord.id !== rawDoc.sourceId) {
    return Object.freeze({
      ok: false,
      status: "SOURCE_MISMATCH",
      reason: `Raw document sourceId '${rawDoc.sourceId}' does not match registered source id '${sourceRecord.id}'`,
      auditEvent: Object.freeze({
        eventType: "DISCOVERY_INTAKE_REJECTED",
        sourceId: rawDoc.sourceId,
        canonicalUrl: rawDoc.canonicalUrl,
        reason: "SOURCE_MISMATCH",
        actor,
        timestamp: processedAt
      })
    });
  }

  // 3. Source State Gate
  if (!isSourceEligibleForIntake(sourceRecord.status)) {
    return Object.freeze({
      ok: false,
      status: "SOURCE_INELIGIBLE",
      reason: `Source '${sourceRecord.id}' is in lifecycle state '${sourceRecord.status}' which is ineligible for intake (must be APPROVED or ACTIVE)`,
      auditEvent: Object.freeze({
        eventType: "DISCOVERY_INTAKE_REJECTED",
        sourceId: sourceRecord.id,
        canonicalUrl: rawDoc.canonicalUrl,
        sourceStatus: sourceRecord.status,
        reason: "SOURCE_STATUS_INELIGIBLE",
        actor,
        timestamp: processedAt
      })
    });
  }

  // 4. Compute Deterministic Identity
  const discoveryId = computeDeterministicDiscoveryId(rawDoc.sourceId, rawDoc.canonicalUrl);
  const idempotencyKey = rawDoc.idempotencyKey || `${rawDoc.sourceId}:${rawDoc.canonicalUrl}`;

  // 5. Invariant Enforcements: Confidentiality & Content Reference Isolation
  const isConfidential = Boolean(rawDoc.metadata?.is_confidential || rawDoc.metadata?.confidential);
  const contentReference = isConfidential ? null : (rawDoc.contentReference || null);

  // 6. Invariant Enforcements: SOURCE_CLAIM & Provenance Preservation
  const financials = rawDoc.metadata?.financials ? {
    ...rawDoc.metadata.financials,
    claim_type: "SOURCE_CLAIM" // Strict invariant: Never elevate to FACT
  } : null;

  // 7. Build Immutable Candidate Discovery Record
  const discoveryRecord = Object.freeze({
    schemaVersion: 1,
    discoveryId,
    idempotencyKey,
    sourceId: sourceRecord.id,
    sourceBaseUrl: sourceRecord.baseUrl,
    sourceType: rawDoc.sourceType,
    canonicalUrl: rawDoc.canonicalUrl,
    contentReference,
    title: rawDoc.title,
    summary: rawDoc.summary || "",
    is_confidential: isConfidential,
    financials: financials ? Object.freeze(financials) : null,
    provenance: Object.freeze({
      collectorId: rawDoc.collectorId || "unknown-collector",
      collectorVersion: rawDoc.collectorVersion || "1.0.0",
      discoveredAt: rawDoc.discoveredAt,
      retrievedAt: rawDoc.retrievedAt,
      intakeProcessedAt: processedAt,
      verified_by: rawDoc.metadata?.financials?.provenance?.verified_by ?? null,
      verified_status: rawDoc.metadata?.financials?.provenance?.verified_status ?? "UNVERIFIED"
    }),
    metadata: Object.freeze({
      ...rawDoc.metadata,
      ...(financials ? { financials } : {}),
      is_confidential: isConfidential
    }),
    status: "CANDIDATE_DISCOVERY_RECORD"
  });

  // 8. Deterministic Audit Event
  const auditEvent = Object.freeze({
    eventType: "DISCOVERY_INTAKE_ACCEPTED",
    discoveryId,
    idempotencyKey,
    sourceId: sourceRecord.id,
    sourceStatus: sourceRecord.status,
    canonicalUrl: rawDoc.canonicalUrl,
    is_confidential: isConfidential,
    actor,
    timestamp: processedAt
  });

  return Object.freeze({
    ok: true,
    status: "ACCEPTED",
    discoveryRecord,
    auditEvent
  });
}
