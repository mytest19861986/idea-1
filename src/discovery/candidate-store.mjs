import { deepFreeze, validateIsoTimestamp, computeDeterministicDiscoveryId } from "./discovery-intake.mjs";

/**
 * Validates candidate discovery record structure for storage.
 * Enforces identity formatting consistency with canonical discoveryId formula.
 * @param {object} candidate
 */
function assertCandidateRecord(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("candidateRecord is required and must be an object");
  }
  if (candidate.schemaVersion !== 1) {
    throw new TypeError(`unsupported schemaVersion: ${candidate.schemaVersion}`);
  }
  if (typeof candidate.sourceId !== "string" || !candidate.sourceId.trim()) {
    throw new TypeError("sourceId is required");
  }
  if (typeof candidate.canonicalUrl !== "string" || !candidate.canonicalUrl.trim()) {
    throw new TypeError("canonicalUrl is required");
  }
  if (typeof candidate.discoveryId !== "string" || !candidate.discoveryId.trim()) {
    throw new TypeError("discoveryId is required");
  }

  const expectedDiscoveryId = computeDeterministicDiscoveryId(candidate.sourceId, candidate.canonicalUrl);
  if (candidate.discoveryId !== expectedDiscoveryId) {
    throw new TypeError(`discoveryId '${candidate.discoveryId}' must match canonical format '${expectedDiscoveryId}'`);
  }

  if (typeof candidate.idempotencyKey !== "string" || !candidate.idempotencyKey.trim()) {
    throw new TypeError("idempotencyKey is required");
  }
}

/**
 * Checks deep structural equality for material candidate payloads.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || typeof a !== "object" || b === null || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

/**
 * Checks if two candidate payloads are materially identical across all fields including metadata & summary.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function isMaterialPayloadEqual(a, b) {
  if (a.discoveryId !== b.discoveryId) return false;
  if (a.sourceId !== b.sourceId) return false;
  if (a.sourceType !== b.sourceType) return false;
  if (a.canonicalUrl !== b.canonicalUrl) return false;
  if (a.title !== b.title) return false;
  if ((a.summary || "") !== (b.summary || "")) return false;
  if (Boolean(a.is_confidential) !== Boolean(b.is_confidential)) return false;
  if (a.contentReference !== b.contentReference) return false;
  if (!deepEqual(a.metadata, b.metadata)) return false;
  return true;
}

/**
 * Reference In-Memory implementation of Discovery Candidate Storage Port.
 * Enforces STORE-I001 through STORE-I008 invariants with strict auditability.
 */
export class InMemoryDiscoveryCandidateStore {
  #candidates = new Map(); // discoveryId -> candidateRecord
  #idempotencyIndex = new Map(); // idempotencyKey -> discoveryId
  #attributions = new Map(); // discoveryId -> Array<AttributionRecord>
  #auditEvents = []; // Array<AuditEvent>

  /**
   * Stores a CandidateDiscoveryRecord.
   * - STORE-I001: Idempotent replay on identical payload.
   * - STORE-I002: Rejection on material conflict for same idempotency key.
   * - STORE-I003: Immutable identity.
   * - STORE-I006: Prevents confidentiality downgrade with explicit status.
   * - STORE-I007: Preserves provenance.
   * - STORE-I008: Source-agnostic generic candidate storage.
   *
   * @param {object} candidateRecord
   * @param {object} options
   * @param {string} options.at - Explicit ISO 8601 timestamp (MANDATORY, no hidden clock)
   * @param {string} [options.actor="discovery-storage-service"]
   * @returns {object} { ok: boolean, status: string, record?: object, auditEvent?: object, reason?: string }
   */
  putCandidate(candidateRecord, { at, actor = "discovery-storage-service" } = {}) {
    validateIsoTimestamp(at, "at");
    assertCandidateRecord(candidateRecord);

    const { discoveryId, idempotencyKey } = candidateRecord;

    // Check existing by discoveryId
    if (this.#candidates.has(discoveryId)) {
      const existing = this.#candidates.get(discoveryId);

      // 1. Confidentiality downgrade check: specific and high-priority audit route
      if (existing.is_confidential && !candidateRecord.is_confidential) {
        const downgradeReason = "Cannot downgrade confidential candidate to public";
        const conflictEvent = deepFreeze({
          eventType: "DISCOVERY_STORAGE_CONFLICT_REJECTED",
          discoveryId,
          idempotencyKey,
          reason: downgradeReason,
          actor,
          timestamp: at
        });
        this.#auditEvents.push(conflictEvent);
        return deepFreeze({
          ok: false,
          status: "CONFIDENTIALITY_DOWNGRADE_REJECTED",
          reason: downgradeReason,
          auditEvent: conflictEvent
        });
      }

      // 2. Conflict Check: Identity mutation or material conflict (including metadata and summary)
      if (!isMaterialPayloadEqual(existing, candidateRecord)) {
        const conflictReason = "Material payload conflict with existing stored candidate";
        const conflictEvent = deepFreeze({
          eventType: "DISCOVERY_STORAGE_CONFLICT_REJECTED",
          discoveryId,
          idempotencyKey,
          reason: conflictReason,
          actor,
          timestamp: at
        });
        this.#auditEvents.push(conflictEvent);
        return deepFreeze({
          ok: false,
          status: "CONFLICT_REJECTED",
          reason: conflictReason,
          auditEvent: conflictEvent
        });
      }

      // 3. STORE-I001: Idempotent replay on identical payload
      const replayEvent = deepFreeze({
        eventType: "DISCOVERY_CANDIDATE_REPLAYED",
        discoveryId,
        idempotencyKey,
        actor,
        timestamp: at
      });
      this.#auditEvents.push(replayEvent);

      return deepFreeze({
        ok: true,
        status: "REPLAYED",
        record: existing,
        auditEvent: replayEvent
      });
    }

    // Check existing by idempotencyKey
    if (this.#idempotencyIndex.has(idempotencyKey)) {
      const mappedId = this.#idempotencyIndex.get(idempotencyKey);
      if (mappedId !== discoveryId) {
        const conflictReason = `Idempotency key '${idempotencyKey}' is already mapped to discoveryId '${mappedId}'`;
        const conflictEvent = deepFreeze({
          eventType: "DISCOVERY_STORAGE_CONFLICT_REJECTED",
          discoveryId,
          idempotencyKey,
          reason: conflictReason,
          actor,
          timestamp: at
        });
        this.#auditEvents.push(conflictEvent);
        return deepFreeze({
          ok: false,
          status: "IDEMPOTENCY_COLLISION",
          reason: conflictReason,
          auditEvent: conflictEvent
        });
      }
    }

    // Initial Persistence
    const storedRecord = deepFreeze({
      ...candidateRecord,
      storedAt: at
    });

    this.#candidates.set(discoveryId, storedRecord);
    this.#idempotencyIndex.set(idempotencyKey, discoveryId);

    // Initialize attribution list with primary source attribution
    const initialAttribution = deepFreeze({
      sourceId: candidateRecord.sourceId,
      canonicalUrl: candidateRecord.canonicalUrl,
      collectorId: candidateRecord.provenance?.collectorId ?? null,
      collectorVersion: candidateRecord.provenance?.collectorVersion ?? null,
      discoveredAt: candidateRecord.provenance?.discoveredAt ?? null,
      retrievedAt: candidateRecord.provenance?.retrievedAt ?? null,
      intakeProcessedAt: candidateRecord.provenance?.intakeProcessedAt ?? null,
      is_confidential: Boolean(candidateRecord.is_confidential),
      contentReference: candidateRecord.contentReference ?? null,
      attributedAt: at
    });
    this.#attributions.set(discoveryId, [initialAttribution]);

    const storeEvent = deepFreeze({
      eventType: "DISCOVERY_CANDIDATE_STORED",
      discoveryId,
      idempotencyKey,
      sourceId: candidateRecord.sourceId,
      actor,
      timestamp: at
    });
    this.#auditEvents.push(storeEvent);

    return deepFreeze({
      ok: true,
      status: "STORED",
      record: storedRecord,
      auditEvent: storeEvent
    });
  }

  /**
   * Retrieves a stored candidate by discoveryId.
   * @param {string} discoveryId
   * @returns {object|null}
   */
  getCandidateById(discoveryId) {
    return this.#candidates.get(discoveryId) ?? null;
  }

  /**
   * Retrieves a stored candidate by source identity.
   * @param {string} sourceId
   * @param {string} canonicalUrl
   * @returns {object|null}
   */
  getCandidateBySourceIdentity(sourceId, canonicalUrl) {
    const discoveryId = computeDeterministicDiscoveryId(sourceId, canonicalUrl);
    return this.#candidates.get(discoveryId) ?? null;
  }

  /**
   * Finds a stored candidate by idempotencyKey.
   * @param {string} idempotencyKey
   * @returns {object|null}
   */
  findByIdempotencyKey(idempotencyKey) {
    const discoveryId = this.#idempotencyIndex.get(idempotencyKey);
    if (!discoveryId) return null;
    return this.#candidates.get(discoveryId) ?? null;
  }

  /**
   * Appends an independent source attribution to an existing candidate.
   * STORE-I004: Append-only, non-destructive, supports multi-source discovery.
   *
   * @param {string} discoveryId
   * @param {object} attribution
   * @param {object} options
   * @param {string} options.at - Explicit ISO 8601 timestamp (MANDATORY)
   * @param {string} [options.actor="attribution-service"]
   * @returns {object} { ok: boolean, status: string, auditEvent?: object, reason?: string }
   */
  appendAttribution(discoveryId, attribution, { at, actor = "attribution-service" } = {}) {
    validateIsoTimestamp(at, "at");
    if (!this.#candidates.has(discoveryId)) {
      return deepFreeze({
        ok: false,
        status: "CANDIDATE_NOT_FOUND",
        reason: `Candidate '${discoveryId}' not found`,
        auditEvent: {
          eventType: "DISCOVERY_STORAGE_CONFLICT_REJECTED",
          discoveryId,
          reason: "CANDIDATE_NOT_FOUND",
          actor,
          timestamp: at
        }
      });
    }

    if (!attribution || typeof attribution !== "object" || !attribution.sourceId) {
      throw new TypeError("valid attribution with sourceId is required");
    }

    const existingAttributions = this.#attributions.get(discoveryId);

    // Duplicate attribution replay check
    const isDuplicate = existingAttributions.some(
      (a) => a.sourceId === attribution.sourceId && a.canonicalUrl === attribution.canonicalUrl
    );

    if (isDuplicate) {
      const replayEvent = deepFreeze({
        eventType: "DISCOVERY_ATTRIBUTION_REPLAYED",
        discoveryId,
        sourceId: attribution.sourceId,
        actor,
        timestamp: at
      });
      this.#auditEvents.push(replayEvent);
      return deepFreeze({
        ok: true,
        status: "ATTRIBUTION_REPLAYED",
        auditEvent: replayEvent
      });
    }

    const newAttribution = deepFreeze({
      ...attribution,
      attributedAt: at
    });

    existingAttributions.push(newAttribution);

    const appendEvent = deepFreeze({
      eventType: "DISCOVERY_ATTRIBUTION_APPENDED",
      discoveryId,
      sourceId: attribution.sourceId,
      actor,
      timestamp: at
    });
    this.#auditEvents.push(appendEvent);

    return deepFreeze({
      ok: true,
      status: "ATTRIBUTION_APPENDED",
      auditEvent: appendEvent
    });
  }

  /**
   * Retrieves the full attribution history for a candidate.
   * @param {string} discoveryId
   * @returns {Array<object>}
   */
  getAttributionHistory(discoveryId) {
    const list = this.#attributions.get(discoveryId);
    return list ? deepFreeze([...list]) : [];
  }

  /**
   * Retrieves all immutable audit events.
   * @returns {Array<object>}
   */
  getAuditEvents() {
    return deepFreeze([...this.#auditEvents]);
  }
}
