-- ============================================================================
-- Migration: 002_portfolio_decision_workflows.sql
-- Package: WEB-PRODUCT-005 (Saved Decision Workflows & Portfolio Persistence)
-- Invariants: Immutable Audit Events, Optimistic Concurrency, Clean Separation
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_decisions (
    decision_id VARCHAR(128) PRIMARY KEY,
    opportunity_id VARCHAR(128) NOT NULL UNIQUE REFERENCES discovery_candidates(id) ON DELETE RESTRICT,
    state VARCHAR(32) NOT NULL,
    decision_reason TEXT,
    priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_portfolio_state CHECK (state IN ('WATCH', 'INVESTIGATE', 'SHORTLIST', 'HOLD'))
);

CREATE INDEX IF NOT EXISTS idx_portfolio_opportunity ON portfolio_decisions(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_state ON portfolio_decisions(state);

CREATE TABLE IF NOT EXISTS portfolio_decision_events (
    event_id VARCHAR(128) PRIMARY KEY,
    decision_id VARCHAR(128) NOT NULL REFERENCES portfolio_decisions(decision_id) ON DELETE CASCADE,
    opportunity_id VARCHAR(128) NOT NULL,
    from_state VARCHAR(32),
    to_state VARCHAR(32) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor VARCHAR(128) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_events_decision ON portfolio_decision_events(decision_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_events_time ON portfolio_decision_events(occurred_at ASC);
