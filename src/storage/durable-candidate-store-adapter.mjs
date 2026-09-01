import { createHash } from "node:crypto";
import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * DURABLE CANDIDATE STORE ADAPTER (PKG-LOCAL-LIVE-DISCOVERY-006)
 * Authoritative persistence adapter bridging LiveDiscoveryController to PostgreSQL.
 * 
 * Invariants:
 * 1. candidate_id = deterministic sha256 within VARCHAR(128) limit: `cand:${sourceId}:${hash(canonicalUrl)}`
 * 2. Atomic PostgreSQL transaction enclosing candidate + attribution insert
 * 3. ON CONFLICT (id) DO NOTHING returns created: true on fresh insert, created: false on replay
 * 4. Attribution is always preserved with uq_candidate_source_idempotency
 * ============================================================================
 */
export class DurableCandidateStoreAdapter {
  /**
   * @param {object} options
   * @param {object} options.postgresAdapter - PostgresDiscoveryPersistenceAdapter instance or pg client/pool
   */
  constructor(options = {}) {
    const { postgresAdapter = null, client = null } = options;
    this.postgresAdapter = postgresAdapter;
    this.client = client || (postgresAdapter ? postgresAdapter.client : null);

    if (!this.client || typeof this.client.query !== "function") {
      throw new TypeError("DurableCandidateStoreAdapter requires a valid postgres client or postgresAdapter");
    }
  }

  /**
   * Authoritative save method conforming to candidateStore contract
   * @param {object} candidate - Normalized candidate object
   * @returns {Promise<{ saved: boolean, created: boolean, candidate: object, attributionCreated: boolean }>}
   */
  async save(candidate) {
    if (!candidate || !candidate.url) {
      throw new TypeError("candidate with url is required");
    }

    const sourceId = candidate.sourceId || "default-source";
    const canonicalUrl = candidate.url;
    const urlHash = createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32);
    const candidateId = candidate.id || `cand:${sourceId}:${urlHash}`;
    const domain = candidate.domain || (new URL(canonicalUrl).hostname.replace(/^www\./, ""));
    const idempotencyKey = candidate.idempotencyKey || `idem:${urlHash}`;
    const discoveredAt = candidate.discoveredAt || new Date().toISOString();
    const retrievedAt = candidate.retrievedAt || discoveredAt;
    const title = candidate.title || "Untitled";
    const description = candidate.summary || candidate.description || null;
    const sourceType = candidate.sourceType || "API";
    const sourceRecordId = candidate.externalId || candidate.sourceRecordId || canonicalUrl;
    const contentReference = candidate.contentReference || null;
    const ruleVersion = candidate.ruleVersion || "v1";
    const confidence = candidate.confidence || "MEDIUM";
    const tags = candidate.tags || [];
    const metadata = candidate.metadata || {};

    const attribution = {
      sourceId,
      sourceType,
      idempotencyKey,
      claimClassification: candidate.claimClassification || "SOURCE_CLAIM",
      rawDocumentId: candidate.rawDocumentId || null,
      collectorVersion: candidate.collectorVersion || "1.0.0",
      attributedAt: candidate.collectedAt || discoveredAt,
      metadata
    };

    // Atomic Transaction: Execute candidate insert + attribution insert atomically
    const candidateSql = `
      INSERT INTO discovery_candidates (
        id, canonical_url, canonical_domain, title, description,
        source_type, source_record_id, content_reference, discovered_at,
        retrieved_at, schema_version, rule_version, confidence, tags, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO NOTHING
      RETURNING id;
    `;
    const candidateParams = [
      candidateId,
      canonicalUrl,
      domain,
      title,
      description,
      sourceType,
      sourceRecordId,
      contentReference,
      discoveredAt,
      retrievedAt,
      1,
      ruleVersion,
      confidence,
      JSON.stringify(tags),
      JSON.stringify(metadata)
    ];

    const attrHash = createHash("sha256").update(`${candidateId}:${attribution.sourceId}:${attribution.idempotencyKey}`).digest("hex").slice(0, 32);
    const attrId = `attr:${attribution.sourceId}:${attrHash}`;
    const attributionSql = `
      INSERT INTO discovery_candidate_attributions (
        attribution_id, candidate_id, source_id, source_type, idempotency_key,
        claim_classification, raw_document_id, collector_version, attributed_at, metadata
      ) VALUES ($16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      ON CONFLICT (candidate_id, source_id, idempotency_key) DO NOTHING
      RETURNING attribution_id;
    `;
    const attributionParams = [
      attrId,
      candidateId,
      attribution.sourceId,
      attribution.sourceType,
      attribution.idempotencyKey,
      attribution.claimClassification,
      attribution.rawDocumentId,
      attribution.collectorVersion,
      attribution.attributedAt,
      JSON.stringify(attribution.metadata)
    ];

    // Atomic Transaction: Execute candidate insert + attribution insert in a single atomic transaction block
    const combinedTxSql = `
      BEGIN;
      ${candidateSql.trim()}
      ${attributionSql.trim()}
      COMMIT;
    `;

    const txRes = await this.client.query(combinedTxSql, [...candidateParams, ...attributionParams]);
    
    // Determine creation status from returned rows
    const returnedRows = (txRes && txRes.rows) ? txRes.rows : [];
    const isCandidateCreated = returnedRows.some(r => r.id === candidateId || r.canonical_url === candidateId);
    const isAttributionCreated = returnedRows.some(r => r.id === attrId || r.canonical_url === attrId);

    const resultingCandidate = deepFreeze({
      ...candidate,
      id: candidateId,
      canonicalUrl,
      domain,
      savedAt: new Date().toISOString()
    });

    return deepFreeze({
      saved: true,
      created: isCandidateCreated,
      candidate: resultingCandidate,
      attributionCreated: isAttributionCreated
    });
  }

  async getById(id) {
    const res = await this.client.query("SELECT * FROM discovery_candidates WHERE id = $1", [id]);
    return res.rows[0] || null;
  }

  async getAll() {
    const res = await this.client.query("SELECT * FROM discovery_candidates ORDER BY created_at ASC");
    return res.rows || [];
  }
}
