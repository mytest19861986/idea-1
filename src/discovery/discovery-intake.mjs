import { SourceStatus } from "../source-registry/lifecycle.mjs";

const ISO_TIMESTAMP_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-]\d{2}:\d{2}))$/;

/**
 * Validates that a string is a strict ISO 8601 timestamp with calendar day correctness.
 * Validates year, month, and day combinations across all timezone offsets.
 * @param {string} value
 * @param {string} fieldName
 * @returns {string} valid ISO timestamp
 */
export function validateIsoTimestamp(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
  const trimmed = value.trim();
  const match = trimmed.match(ISO_TIMESTAMP_REGEX);
  if (!match) {
    throw new TypeError(`${fieldName} must be a valid ISO 8601 timestamp string`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // Exact calendar correctness check across all timezone representations
  const calendarTest = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarTest.getUTCFullYear() !== year ||
    calendarTest.getUTCMonth() + 1 !== month ||
    calendarTest.getUTCDate() !== day
  ) {
    throw new TypeError(`${fieldName} represents an impossible or invalid calendar date`);
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.valueOf())) {
    throw new TypeError(`${fieldName} represents an impossible or invalid calendar date`);
  }

  return trimmed;
}

/**
 * Deep freezes an object recursively to ensure strict immutability.
 * @param {object} obj
 * @returns {object} deep frozen object
 */
export function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

const SENSITIVE_CONFIDENTIAL_KEYS = new Set([
  "domain",
  "websiteurl",
  "website_url",
  "contacturl",
  "contact_url",
  "sourcedomain",
  "source_domain",
  "rawhtmlref",
  "raw_html_ref",
  "targeturl",
  "target_url",
  "externalurl",
  "external_url",
  "homepage",
  "link",
  "profileurl",
  "profile_url",
  "sourcelink",
  "source_link"
]);

/**
 * Recursively sanitizes data structures to isolate confidential entities.
 * Removes any sensitive URL or domain keys from nested objects and arrays.
 * @param {any} value
 * @returns {any} sanitized value
 */
export function sanitizeConfidentialRecursively(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeConfidentialRecursively(item));
  }

  const clean = {};
  for (const [k, v] of Object.entries(value)) {
    const lowerKey = k.toLowerCase().replace(/[-_]/g, "");
    if (!SENSITIVE_CONFIDENTIAL_KEYS.has(k) && !SENSITIVE_CONFIDENTIAL_KEYS.has(lowerKey)) {
      clean[k] = sanitizeConfidentialRecursively(v);
    }
  }
  return clean;
}

/**
 * Validates a raw document against generic discovery intake requirements.
 * Reuses canonical HTTPS and schema constraints without inventing provenance.
 * @param {object} rawDoc
 * @returns {object} validated raw document
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

  validateIsoTimestamp(rawDoc.discoveredAt, "discoveredAt");
  validateIsoTimestamp(rawDoc.retrievedAt, "retrievedAt");

  if (rawDoc.idempotencyKey !== undefined) {
    if (typeof rawDoc.idempotencyKey !== "string" || !rawDoc.idempotencyKey.trim()) {
      throw new TypeError("idempotencyKey must be a non-empty string when provided");
    }
  }

  if (!rawDoc.metadata || typeof rawDoc.metadata !== "object") {
    throw new TypeError("metadata is required and must be an object");
  }

  return rawDoc;
}

/**
 * Checks whether a source status allows discovery intake.
 * Sources in CANDIDATE, EVALUATING, REJECTED, RETIRED, PAUSED, or DEGRADED are blocked.
 * Sources in APPROVED or ACTIVE are eligible.
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
 * - Deterministic execution with NO internal clock generation (processedAt is strictly required)
 * - Source-agnostic ingestion with zero coupling to source-specific metrics/financials
 * - Strict RawDocument schema and ISO timestamp validation (universal timezone calendar validation)
 * - Source registration & state gating (APPROVED or ACTIVE only)
 * - Deterministic discovery identity & validated idempotency key
 * - Strict provenance integrity (authoritative computed fields; zero provenance spoofing)
 * - Recursive confidential entity isolation (contentReference nullified, is_confidential: true, deep sanitization)
 * - Recursive deep freezing for complete immutability
 *
 * @param {object} rawDoc
 * @param {object} options
 * @param {object} options.sourceRecord - Registered source record from SourceRegistry
 * @param {string} options.processedAt - Explicit intake timestamp (MANDATORY, no internal clock fallback)
 * @param {string} [options.actor="discovery-intake-service"] - Operating actor
 * @returns {object} { ok: boolean, status: string, discoveryRecord?: object, auditEvent?: object, reason?: string }
 */
export function processDiscoveryIntake(rawDoc, { sourceRecord, processedAt, actor = "discovery-intake-service" } = {}) {
  // 1. Mandatory processedAt check: fail explicitly without wall-clock fallback
  let validatedProcessedAt;
  try {
    validatedProcessedAt = validateIsoTimestamp(processedAt, "processedAt");
  } catch (err) {
    return deepFreeze({
      ok: false,
      status: "INVALID_PROCESSED_AT",
      reason: err.message,
      auditEvent: {
        eventType: "DISCOVERY_INTAKE_REJECTED",
        sourceId: rawDoc?.sourceId ?? "UNKNOWN",
        canonicalUrl: rawDoc?.canonicalUrl ?? null,
        reason: err.message,
        actor,
        timestamp: null
      }
    });
  }

  // 2. Validate RawDocument schema & timestamps
  try {
    validateRawDocument(rawDoc);
  } catch (err) {
    return deepFreeze({
      ok: false,
      status: "SCHEMA_VALIDATION_FAILED",
      reason: err.message,
      auditEvent: {
        eventType: "DISCOVERY_INTAKE_REJECTED",
        sourceId: rawDoc?.sourceId ?? "UNKNOWN",
        canonicalUrl: rawDoc?.canonicalUrl ?? null,
        reason: err.message,
        actor,
        timestamp: validatedProcessedAt
      }
    });
  }

  // 3. Validate Source Existence
  if (!sourceRecord || typeof sourceRecord !== "object" || !sourceRecord.id) {
    return deepFreeze({
      ok: false,
      status: "SOURCE_NOT_REGISTERED",
      reason: `Source '${rawDoc.sourceId}' is not registered in the Source Registry`,
      auditEvent: {
        eventType: "DISCOVERY_INTAKE_REJECTED",
        sourceId: rawDoc.sourceId,
        canonicalUrl: rawDoc.canonicalUrl,
        reason: "SOURCE_NOT_REGISTERED",
        actor,
        timestamp: validatedProcessedAt
      }
    });
  }

  if (sourceRecord.id !== rawDoc.sourceId) {
    return deepFreeze({
      ok: false,
      status: "SOURCE_MISMATCH",
      reason: `Raw document sourceId '${rawDoc.sourceId}' does not match registered source id '${sourceRecord.id}'`,
      auditEvent: {
        eventType: "DISCOVERY_INTAKE_REJECTED",
        sourceId: rawDoc.sourceId,
        canonicalUrl: rawDoc.canonicalUrl,
        reason: "SOURCE_MISMATCH",
        actor,
        timestamp: validatedProcessedAt
      }
    });
  }

  // 4. Source State Gate
  if (!isSourceEligibleForIntake(sourceRecord.status)) {
    return deepFreeze({
      ok: false,
      status: "SOURCE_INELIGIBLE",
      reason: `Source '${sourceRecord.id}' is in lifecycle state '${sourceRecord.status}' which is ineligible for intake (must be APPROVED or ACTIVE)`,
      auditEvent: {
        eventType: "DISCOVERY_INTAKE_REJECTED",
        sourceId: sourceRecord.id,
        canonicalUrl: rawDoc.canonicalUrl,
        sourceStatus: sourceRecord.status,
        reason: "SOURCE_STATUS_INELIGIBLE",
        actor,
        timestamp: validatedProcessedAt
      }
    });
  }

  // 5. Deterministic Identity & Idempotency Key
  const discoveryId = computeDeterministicDiscoveryId(rawDoc.sourceId, rawDoc.canonicalUrl);
  const idempotencyKey = rawDoc.idempotencyKey || `${rawDoc.sourceId}:${rawDoc.canonicalUrl}`;

  // 6. Confidential Entity Isolation
  const isConfidential = Boolean(rawDoc.metadata?.is_confidential || rawDoc.metadata?.confidential);
  const contentReference = isConfidential ? null : (rawDoc.contentReference || null);

  // 7. Generic Metadata Sanitization
  const baseMetadata = isConfidential
    ? sanitizeConfidentialRecursively(rawDoc.metadata)
    : { ...rawDoc.metadata };

  const processedMetadata = {
    ...baseMetadata,
    is_confidential: isConfidential
  };

  // 8. Authoritative Provenance Construction (Prevents caller spoofing/fabrication)
  const provenance = {
    collectorId: rawDoc.collectorId ?? null,
    collectorVersion: rawDoc.collectorVersion ?? null,
    discoveredAt: rawDoc.discoveredAt,
    retrievedAt: rawDoc.retrievedAt,
    intakeProcessedAt: validatedProcessedAt
  };

  // 9. Build Candidate Discovery Record
  const discoveryRecord = {
    schemaVersion: 1,
    discoveryId,
    idempotencyKey,
    sourceId: sourceRecord.id,
    sourceBaseUrl: sourceRecord.baseUrl,
    sourceType: rawDoc.sourceType,
    canonicalUrl: rawDoc.canonicalUrl,
    contentReference,
    title: rawDoc.title,
    summary: rawDoc.summary ?? "",
    is_confidential: isConfidential,
    provenance,
    metadata: processedMetadata,
    status: "CANDIDATE_DISCOVERY_RECORD"
  };

  // 10. Deterministic Audit Event
  const auditEvent = {
    eventType: "DISCOVERY_INTAKE_ACCEPTED",
    discoveryId,
    idempotencyKey,
    sourceId: sourceRecord.id,
    sourceStatus: sourceRecord.status,
    canonicalUrl: rawDoc.canonicalUrl,
    is_confidential: isConfidential,
    actor,
    timestamp: validatedProcessedAt
  };

  return deepFreeze({
    ok: true,
    status: "ACCEPTED",
    discoveryRecord,
    auditEvent
  });
}
