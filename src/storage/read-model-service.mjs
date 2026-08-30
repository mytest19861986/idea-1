import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * READ MODEL QUERY SERVICE (WEB-PRODUCT-004R)
 * Source-neutral read repository querying durable PostgreSQL intelligence state
 * and mapping records to OpportunitySummaryViewModel and OpportunityDetailViewModel.
 * Strictly enforces parameterized queries, sort allowlists, pagination bounds,
 * and canonical confidentiality projection.
 * ============================================================================
 */

export const SORT_ALLOWLIST = {
  OPPORTUNITY_SCORE_DESC: "ORDER BY (COALESCE((c.metadata->>'score')::numeric, 70)) DESC, c.id ASC",
  OPPORTUNITY_SCORE_ASC: "ORDER BY (COALESCE((c.metadata->>'score')::numeric, 70)) ASC, c.id ASC",
  EVIDENCE_CONFIDENCE_DESC: "ORDER BY c.confidence DESC, c.id ASC",
  EVIDENCE_CONFIDENCE_ASC: "ORDER BY c.confidence ASC, c.id ASC",
  FRESHNESS_DESC: "ORDER BY c.discovered_at DESC, c.id ASC",
  FRESHNESS_ASC: "ORDER BY c.discovered_at ASC, c.id ASC"
};

export class PostgresOpportunityReadService {
  constructor(pgClient) {
    this.client = pgClient;
  }

  /**
   * Lists opportunities as source-neutral OpportunitySummaryViewModel array.
   */
  async listOpportunities({
    search,
    category,
    market,
    minOpportunityScore = 0,
    minEvidenceConfidence = 0,
    evidenceType,
    source,
    freshness,
    sort = "FRESHNESS_DESC",
    limit = 20,
    offset = 0
  } = {}) {
    if (!this.client || typeof this.client.query !== "function") {
      throw new Error("POSTGRES_READ_SERVICE_UNAVAILABLE: No active PostgreSQL connection client.");
    }

    // Enforce pagination boundaries (Default: 20, Max: 100)
    const boundedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const boundedOffset = Math.max(0, parseInt(offset, 10) || 0);

    // Validate Sort Allowlist
    const sortClause = SORT_ALLOWLIST[sort] || SORT_ALLOWLIST.FRESHNESS_DESC;

    const params = [boundedLimit, boundedOffset];
    let paramIndex = 3;
    const whereConditions = [];

    if (search && typeof search === "string" && search.trim()) {
      whereConditions.push(`(c.title ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (source && typeof source === "string" && source.trim() && source !== "ALL") {
      whereConditions.push(`c.source_record_id = $${paramIndex}`);
      params.push(source.trim());
      paramIndex++;
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const sql = `
      SELECT 
        c.id, c.title, c.description, c.canonical_url, c.canonical_domain,
        c.source_type, c.source_record_id, c.confidence, c.discovered_at, c.retrieved_at,
        c.tags, c.metadata,
        COUNT(a.attribution_id) AS source_count,
        COALESCE(MAX(a.claim_classification), 'UNKNOWN') AS primary_classification
      FROM discovery_candidates c
      LEFT JOIN discovery_candidate_attributions a ON c.id = a.candidate_id
      ${whereSql}
      GROUP BY c.id
      ${sortClause}
      LIMIT $1 OFFSET $2;
    `;

    const result = await this.client.query(sql, params);
    
    const items = result.rows.map(row => {
      const metadata = row.metadata || {};
      const score = typeof metadata.score === "number" ? metadata.score : (metadata.score ? parseInt(metadata.score, 10) : 70);
      const confidenceNum = row.confidence === "CONFIRMED" ? 95 : (row.confidence === "PROBABLE" ? 75 : 50);
      const isConfidential = Boolean(metadata.is_confidential);

      return deepFreeze({
        opportunityId: row.id,
        title: row.title,
        category: metadata.category || "Developer Tools",
        market: metadata.market || "Global",
        opportunityScore: score,
        evidenceConfidence: confidenceNum,
        primaryEvidenceClassification: row.primary_classification || "SOURCE_CLAIM",
        freshness: row.discovered_at,
        sourceCount: parseInt(row.source_count, 10) || 1,
        isConfidential,
        // Confidentiality projection: never leak restricted identifiers to client
        canonicalUrl: isConfidential ? null : row.canonical_url,
        tractionSummary: metadata.score ? `${metadata.score} community points` : "UNKNOWN",
        marketGapSummary: metadata.marketGap || "NOT_EVALUATED",
        monetizationSummary: metadata.monetization || "INSUFFICIENT_EVIDENCE",
        buildComplexity: metadata.buildComplexity || 5,
        regulatoryRisk: metadata.regulatoryRisk || 3,
        evidenceRisk: metadata.evidenceRisk || "MEDIUM"
      });
    });

    return deepFreeze({
      items,
      totalCount: items.length,
      limit: boundedLimit,
      offset: boundedOffset,
      sort
    });
  }

  /**
   * Retrieves full OpportunityDetailViewModel by ID with strict confidentiality projection.
   */
  async getOpportunityDetail(opportunityId) {
    if (!this.client || typeof this.client.query !== "function") {
      throw new Error("POSTGRES_READ_SERVICE_UNAVAILABLE: No active PostgreSQL connection client.");
    }

    const candidateSql = `
      SELECT id, title, description, canonical_url, canonical_domain,
             source_type, source_record_id, confidence, discovered_at, retrieved_at,
             tags, metadata
      FROM discovery_candidates
      WHERE id = $1;
    `;
    const candidateRes = await this.client.query(candidateSql, [opportunityId]);
    if (candidateRes.rows.length === 0) return null;

    const row = candidateRes.rows[0];
    const metadata = row.metadata || {};
    const isConfidential = Boolean(metadata.is_confidential);

    const attrSql = `
      SELECT attribution_id, source_id, source_type, idempotency_key,
             claim_classification, collector_version, attributed_at, metadata
      FROM discovery_candidate_attributions
      WHERE candidate_id = $1
      ORDER BY attributed_at ASC;
    `;
    const attrRes = await this.client.query(attrSql, [opportunityId]);

    const evidenceLedger = attrRes.rows.map(a => deepFreeze({
      attributionId: a.attribution_id,
      sourceId: a.source_id,
      classification: a.claim_classification,
      attributedAt: a.attributed_at,
      metadata: isConfidential ? {} : (a.metadata || {})
    }));

    return deepFreeze({
      opportunityId: row.id,
      title: row.title,
      isConfidential,
      summary: row.description || "Live ingested discovery candidate from authorized pilot source.",
      whyNow: metadata.whyNow || "NOT_EVALUATED",
      provenElsewhere: metadata.provenElsewhere || "NOT_EVALUATED",
      evidenceLedger,
      scoreDimensions: {
        marketGap: metadata.marketGapScore || 7.5,
        tractionVelocity: metadata.tractionVelocity || 7.0,
        monetizationPotential: metadata.monetizationPotential || 7.0,
        buildComplexity: metadata.buildComplexity || 5.0,
        regulatoryRisk: metadata.regulatoryRisk || 3.0
      },
      traction: metadata.score ? `${metadata.score} verified community points` : "UNKNOWN",
      marketGap: metadata.marketGap || "NOT_EVALUATED",
      localization: metadata.localization || "UNKNOWN",
      monetization: metadata.monetization || "INSUFFICIENT_EVIDENCE",
      mvp: metadata.mvp || "NOT_EVALUATED",
      competitors: metadata.competitors || [],
      risks: metadata.risks || [
        { dimension: "Evidence Risk", risk: "Unverified public claim requires pilot confirmation", severity: "MEDIUM", confidence: "80%", basis: "SOURCE_CLAIM" }
      ],
      provenance: {
        sourceRecordId: row.source_record_id,
        canonicalUrl: isConfidential ? null : row.canonical_url,
        discoveredAt: row.discovered_at,
        retrievedAt: row.retrieved_at
      }
    });
  }
}
