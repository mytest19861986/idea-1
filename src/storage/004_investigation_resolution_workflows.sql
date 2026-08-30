-- ============================================================================
-- Migration: 004_investigation_resolution_workflows.sql
-- Package: WEB-PRODUCT-007 (Investigation Resolution, Review Cadence & Learning)
-- Invariants: Strict Separation (INVESTIGATION_STATE != PORTFOLIO_STATE),
--             Append-Only Audit Events, Optimistic Concurrency Protection
-- ============================================================================

CREATE TABLE IF NOT EXISTS investigation_records (
    investigation_id VARCHAR(128) PRIMARY KEY,
    opportunity_id VARCHAR(128) NOT NULL REFERENCES discovery_candidates(id) ON DELETE RESTRICT,
    reason_code VARCHAR(64) NOT NULL,
    operations_policy_version VARCHAR(64) NOT NULL DEFAULT 'operations-policy-v1',
    priority_at_creation VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_code VARCHAR(64),
    resolution_note TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_investigation_status CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
    CONSTRAINT chk_resolution_code CHECK (
        resolution_code IS NULL OR 
        resolution_code IN ('EVIDENCE_COLLECTED', 'RISK_REVIEWED', 'NO_ACTION_REQUIRED', 'DECISION_UPDATED', 'DUPLICATE_INVESTIGATION', 'OUTDATED_SIGNAL')
    )
);

CREATE INDEX IF NOT EXISTS idx_investigation_opportunity ON investigation_records(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_investigation_status ON investigation_records(status);

CREATE TABLE IF NOT EXISTS investigation_events (
    event_id VARCHAR(128) PRIMARY KEY,
    investigation_id VARCHAR(128) NOT NULL REFERENCES investigation_records(investigation_id) ON DELETE CASCADE,
    opportunity_id VARCHAR(128) NOT NULL,
    from_status VARCHAR(32),
    to_status VARCHAR(32) NOT NULL,
    resolution_code VARCHAR(64),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor VARCHAR(128) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investigation_events_inv ON investigation_events(investigation_id);
CREATE INDEX IF NOT EXISTS idx_investigation_events_time ON investigation_events(occurred_at ASC);
