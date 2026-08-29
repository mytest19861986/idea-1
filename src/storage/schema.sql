-- ============================================================================
-- Migration: 001_discovery_core_persistence.sql
-- Package: PKG-PERSIST-011R (Discovery Core Production Persistence Schema)
-- Invariants: PERSIST-I001 through PERSIST-I020 (Remediated)
-- ============================================================================

-- 1. Discovery Candidates (Primary key: discovery_id)
-- Note: canonical_url is indexed for fast lookup but is NOT globally unique,
-- preserving authoritative candidate identity via discovery_id (Finding 1 fix).
CREATE TABLE IF NOT EXISTS discovery_candidates (
    id VARCHAR(128) PRIMARY KEY,
    canonical_url VARCHAR(2048) NOT NULL,
    canonical_domain VARCHAR(255) NOT NULL,
    title VARCHAR(512) NOT NULL,
    description TEXT,
    source_type VARCHAR(64) NOT NULL,
    source_record_id VARCHAR(128) NOT NULL,
    content_reference VARCHAR(2048),
    discovered_at TIMESTAMPTZ NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    rule_version VARCHAR(64) NOT NULL,
    confidence VARCHAR(32) NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_url ON discovery_candidates(canonical_url);
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_domain ON discovery_candidates(canonical_domain);
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_source ON discovery_candidates(source_record_id);

-- 2. Discovery Candidate Attributions (Append-Only Ledger)
CREATE TABLE IF NOT EXISTS discovery_candidate_attributions (
    attribution_id VARCHAR(128) PRIMARY KEY,
    candidate_id VARCHAR(128) NOT NULL REFERENCES discovery_candidates(id) ON DELETE RESTRICT,
    source_id VARCHAR(128) NOT NULL,
    source_type VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    claim_classification VARCHAR(64) NOT NULL DEFAULT 'SOURCE_CLAIM',
    raw_document_id VARCHAR(128),
    collector_version VARCHAR(64) NOT NULL,
    attributed_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_candidate_source_idempotency UNIQUE (candidate_id, source_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_attributions_candidate ON discovery_candidate_attributions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_attributions_source ON discovery_candidate_attributions(source_id);

-- 3. Entity Resolution Decisions History (Append-Only)
CREATE TABLE IF NOT EXISTS entity_resolution_decisions (
    decision_id VARCHAR(128) PRIMARY KEY,
    candidate_a_id VARCHAR(128) NOT NULL REFERENCES discovery_candidates(id) ON DELETE RESTRICT,
    candidate_b_id VARCHAR(128) NOT NULL REFERENCES discovery_candidates(id) ON DELETE RESTRICT,
    pair_identity VARCHAR(256) NOT NULL,
    resolution_status VARCHAR(64) NOT NULL,
    rule_version VARCHAR(64) NOT NULL,
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    evaluated_at TIMESTAMPTZ NOT NULL,
    actor VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resolution_pair ON entity_resolution_decisions(pair_identity);
CREATE INDEX IF NOT EXISTS idx_resolution_candidate_a ON entity_resolution_decisions(candidate_a_id);
CREATE INDEX IF NOT EXISTS idx_resolution_candidate_b ON entity_resolution_decisions(candidate_b_id);

-- 4. Entity Clusters
CREATE TABLE IF NOT EXISTS entity_clusters (
    cluster_id VARCHAR(128) PRIMARY KEY,
    canonical_name VARCHAR(512) NOT NULL,
    canonical_domain VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Entity Cluster Members
CREATE TABLE IF NOT EXISTS entity_cluster_members (
    cluster_id VARCHAR(128) NOT NULL REFERENCES entity_clusters(cluster_id) ON DELETE CASCADE,
    candidate_id VARCHAR(128) NOT NULL REFERENCES discovery_candidates(id) ON DELETE RESTRICT,
    source_id VARCHAR(128) NOT NULL,
    added_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cluster_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_cluster_members_candidate ON entity_cluster_members(candidate_id);

-- 6. Source Observations Ledger (Append-Only)
CREATE TABLE IF NOT EXISTS source_observations (
    observation_id VARCHAR(128) PRIMARY KEY,
    execution_id VARCHAR(128) NOT NULL,
    source_id VARCHAR(128) NOT NULL,
    success BOOLEAN NOT NULL,
    status_code INTEGER NOT NULL,
    failure_reason VARCHAR(128),
    yield_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    unique_count INTEGER NOT NULL DEFAULT 0,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observations_source_time ON source_observations(source_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_execution ON source_observations(execution_id);

-- 7. Source Health Snapshots (Deterministic Snapshot ID & History Ledger)
CREATE TABLE IF NOT EXISTS source_health_snapshots (
    snapshot_id VARCHAR(128) PRIMARY KEY,
    source_id VARCHAR(128) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    operational_health VARCHAR(32) NOT NULL,
    intelligence_contribution VARCHAR(32) NOT NULL,
    confidence VARCHAR(32) NOT NULL,
    governance_recommendation VARCHAR(64) NOT NULL,
    evaluation_version VARCHAR(64) NOT NULL,
    formula_version VARCHAR(64) NOT NULL,
    findings JSONB NOT NULL DEFAULT '[]'::jsonb,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    evaluated_at TIMESTAMPTZ NOT NULL,
    actor VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_snapshots_source ON source_health_snapshots(source_id, evaluated_at DESC);

-- 8. Source Governance Decisions (Immutable Ledger)
CREATE TABLE IF NOT EXISTS source_governance_decisions (
    decision_id VARCHAR(128) PRIMARY KEY,
    source_id VARCHAR(128) NOT NULL,
    current_state VARCHAR(64) NOT NULL,
    proposed_state VARCHAR(64) NOT NULL,
    decision VARCHAR(64) NOT NULL,
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence VARCHAR(32) NOT NULL,
    cooldown_satisfied BOOLEAN NOT NULL,
    hysteresis_satisfied BOOLEAN NOT NULL,
    governance_policy_version VARCHAR(64) NOT NULL,
    health_evaluation_version VARCHAR(64) NOT NULL,
    health_formula_version VARCHAR(64) NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL,
    decision_at TIMESTAMPTZ NOT NULL,
    actor VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gov_decisions_source ON source_governance_decisions(source_id, decision_at DESC);

-- 9. Source Governance Applications (Append-Only Attempt History Ledger)
-- Note: UNIQUE(decision_id) removed to allow recording all application attempts
-- (e.g. APPLIED, REPLAYED, STALE_DECISION, BLOCKED) in audit trail (Finding 6 fix).
CREATE TABLE IF NOT EXISTS source_governance_applications (
    application_id VARCHAR(128) PRIMARY KEY,
    decision_id VARCHAR(128) NOT NULL REFERENCES source_governance_decisions(decision_id) ON DELETE RESTRICT,
    source_id VARCHAR(128) NOT NULL,
    from_state VARCHAR(64) NOT NULL,
    to_state VARCHAR(64) NOT NULL,
    application_status VARCHAR(64) NOT NULL, -- 'APPLIED', 'REPLAYED', 'STALE_DECISION', 'NOT_AUTHORIZED'
    reason VARCHAR(512),
    applied_at TIMESTAMPTZ NOT NULL,
    actor VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gov_applications_decision ON source_governance_applications(decision_id);
CREATE INDEX IF NOT EXISTS idx_gov_applications_source ON source_governance_applications(source_id, applied_at DESC);
