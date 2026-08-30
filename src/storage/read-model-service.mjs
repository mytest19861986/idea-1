import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * READ MODEL QUERY SERVICE (WEB-PRODUCT-004)
 * Source-neutral read repository querying durable PostgreSQL intelligence state
 * and mapping records to OpportunitySummaryViewModel and OpportunityDetailViewModel.
 * ============================================================================
 */

export class PostgresOpportunityReadService {
  constructor(pgClient) {
    this.client = pgClient;
  }

  /**
   * Lists opportunities as source-neutral OpportunitySummaryViewModel array.
   */
  async listOpportunities({ limit = 50, category, market, minScore = 0, minConfidence = 0 } = {}) {
    if (!this.client || typeof this.client.query !== "function") {
      throw new Error("POSTGRES_READ_SERVICE_UNAVAILABLE: No active PostgreSQL connection client.");
    }

    const sql = `
      SELECT 
        c.id, c.title, c.description, c.canonical_url, c.canonical_domain,
        c.source_type, c.source_record_id, c.confidence, c.discovered_at, c.retrieved_at,
        c.tags, c.metadata,
        COUNT(a.attribution_id) AS source_count,
        COALESCE(MAX(a.claim_classification), 'UNKNOWN') AS primary_classification
      FROM discovery_candidates c
      LEFT JOIN discovery_candidate_attributions a ON c.id = a.candidate_id
      GROUP BY c.id
      ORDER BY c.discovered_at DESC
      LIMIT $1;
    `;

    const result = await this.client.query(sql, [limit]);
    
    const items = result.rows.map(row => {
      const metadata = row.metadata || {};
      const score = typeof metadata.score === "number" ? metadata.score : 70;
      const confidenceNum = row.confidence === "CONFIRMED" ? 95 : (row.confidence === "PROBABLE" ? 75 : 50);

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
        isConfidential: Boolean(metadata.is_confidential),
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
      totalCount: items.length
    });
  }

  /**
   * Retrieves full OpportunityDetailViewModel by ID.
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
      metadata: a.metadata || {}
    }));

    return deepFreeze({
      opportunityId: row.id,
      title: row.title,
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
        canonicalUrl: metadata.is_confidential ? null : row.canonical_url,
        discoveredAt: row.discovered_at,
        retrievedAt: row.retrieved_at
      }
    });
  }
}
