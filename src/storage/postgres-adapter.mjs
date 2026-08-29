import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * POSTGRESQL PERSISTENCE ADAPTER (PKG-DBRUN-012)
 * Bounded PostgreSQL adapter implementing Discovery Core Persistence Ports.
 * Parameterized queries, atomic transactions, no embedded secrets.
 * ============================================================================
 */

export class PostgresDiscoveryPersistenceAdapter {
  constructor(poolOrClient) {
    this.client = poolOrClient;
  }

  async query(text, params) {
    if (!this.client || typeof this.client.query !== "function") {
      throw new Error("POSTGRES_RUNTIME_UNAVAILABLE: No active PostgreSQL connection client provided.");
    }
    return this.client.query(text, params);
  }

  async saveCandidate(candidate, attribution) {
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
      candidate.id,
      candidate.canonicalUrl,
      candidate.canonicalDomain,
      candidate.title,
      candidate.description || null,
      candidate.sourceType,
      candidate.sourceRecordId,
      candidate.contentReference || null,
      candidate.discoveredAt,
      candidate.retrievedAt,
      candidate.schemaVersion || 1,
      candidate.ruleVersion,
      candidate.confidence,
      JSON.stringify(candidate.tags || []),
      JSON.stringify(candidate.metadata || {})
    ];

    const attributionSql = `
      INSERT INTO discovery_candidate_attributions (
        attribution_id, candidate_id, source_id, source_type, idempotency_key,
        claim_classification, raw_document_id, collector_version, attributed_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (candidate_id, source_id, idempotency_key) DO NOTHING
      RETURNING attribution_id;
    `;
    const attrId = `attr:${candidate.id}:${attribution.sourceId}:${attribution.idempotencyKey}`;
    const attributionParams = [
      attrId,
      candidate.id,
      attribution.sourceId,
      attribution.sourceType,
      attribution.idempotencyKey,
      attribution.claimClassification || "SOURCE_CLAIM",
      attribution.rawDocumentId || null,
      attribution.collectorVersion,
      attribution.attributedAt,
      JSON.stringify(attribution.metadata || {})
    ];

    return deepFreeze({
      candidateSql,
      candidateParams,
      attributionSql,
      attributionParams
    });
  }

  async saveObservation(obs) {
    const sql = `
      INSERT INTO source_observations (
        observation_id, execution_id, source_id, success, status_code,
        failure_reason, yield_count, duplicate_count, unique_count, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (observation_id) DO NOTHING
      RETURNING observation_id;
    `;
    const params = [
      obs.observationId,
      obs.executionId,
      obs.sourceId,
      obs.success,
      obs.statusCode,
      obs.failureReason || null,
      obs.yieldCount || 0,
      obs.duplicateCount || 0,
      obs.uniqueCount || 0,
      obs.occurredAt
    ];
    return deepFreeze({ sql, params });
  }

  async saveHealthSnapshot(snap) {
    const sql = `
      INSERT INTO source_health_snapshots (
        snapshot_id, source_id, window_start, window_end, operational_health,
        intelligence_contribution, confidence, governance_recommendation,
        evaluation_version, formula_version, findings, metrics, evaluated_at, actor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (snapshot_id) DO NOTHING
      RETURNING snapshot_id;
    `;
    const evalVer = snap.evaluationVersion || "v1";
    const formVer = snap.formulaVersion || "v1";
    const wStart = snap.windowStart || snap.evaluatedAt;
    const wEnd = snap.windowEnd || snap.evaluatedAt;
    const snapshotId =
      snap.snapshotId ||
      `snap:${snap.sourceId}:${Date.parse(wStart)}:${Date.parse(wEnd)}:${evalVer}:${formVer}`;

    const params = [
      snapshotId,
      snap.sourceId,
      wStart,
      wEnd,
      snap.operationalHealth,
      snap.intelligenceContribution,
      snap.confidence,
      snap.governanceRecommendation || "NO_CHANGE",
      evalVer,
      formVer,
      JSON.stringify(snap.findings || []),
      JSON.stringify(snap.metrics || {}),
      snap.evaluatedAt,
      snap.actor || "system"
    ];
    return deepFreeze({ sql, params });
  }

  async saveGovernanceDecision(decision) {
    const sql = `
      INSERT INTO source_governance_decisions (
        decision_id, source_id, current_state, proposed_state, decision,
        reason_codes, evidence_references, confidence, cooldown_satisfied,
        hysteresis_satisfied, governance_policy_version, health_evaluation_version,
        health_formula_version, evaluated_at, decision_at, actor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (decision_id) DO NOTHING
      RETURNING decision_id;
    `;
    const params = [
      decision.decisionId,
      decision.sourceId,
      decision.currentState,
      decision.proposedState,
      decision.decision,
      JSON.stringify(decision.reasonCodes || []),
      JSON.stringify(decision.evidenceReferences || []),
      decision.confidence,
      decision.cooldownSatisfied,
      decision.hysteresisSatisfied,
      decision.governancePolicyVersion,
      decision.healthEvaluationVersion,
      decision.healthFormulaVersion,
      decision.evaluatedAt,
      decision.decisionAt,
      decision.actor
    ];
    return deepFreeze({ sql, params });
  }

  async saveGovernanceApplication(app) {
    const sql = `
      INSERT INTO source_governance_applications (
        application_id, decision_id, source_id, from_state, to_state,
        application_status, reason, applied_at, actor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING application_id;
    `;
    const params = [
      app.applicationId || `app:${app.decisionId}:${Date.now()}`,
      app.decisionId,
      app.sourceId,
      app.fromState,
      app.toState,
      app.applicationStatus,
      app.reason || null,
      app.appliedAt,
      app.actor
    ];
    return deepFreeze({ sql, params });
  }
}
