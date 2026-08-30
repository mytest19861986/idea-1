-- ============================================================================
-- DISCOVERY PLATFORM: OPERATIONAL STATE SCHEMA (PKG-STATE-019)
-- Additive Migration: 002_operational_state.sql
-- Invariants: STATE-I001 through STATE-I035
-- ============================================================================

-- 1. Source Runtime State & Optimistic Concurrency
CREATE TABLE IF NOT EXISTS source_runtime_state (
  source_id VARCHAR(64) PRIMARY KEY,
  status VARCHAR(32) NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_transition_at TIMESTAMPTZ,
  last_transition_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_runtime_status ON source_runtime_state(status);

-- 2. Source Lifecycle Transitions (Immutable Audit Ledger)
CREATE TABLE IF NOT EXISTS source_lifecycle_transitions (
  transition_id VARCHAR(128) PRIMARY KEY,
  source_id VARCHAR(64) NOT NULL REFERENCES source_runtime_state(source_id) ON DELETE CASCADE,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  from_revision INTEGER NOT NULL,
  to_revision INTEGER NOT NULL,
  reason TEXT NOT NULL,
  decision_id VARCHAR(128),
  actor VARCHAR(64) NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_transitions_source_id ON source_lifecycle_transitions(source_id, occurred_at);

-- 3. Scheduler Slots (Durable Slot Replay Protection)
CREATE TABLE IF NOT EXISTS scheduler_slots (
  slot_id VARCHAR(160) PRIMARY KEY,
  source_id VARCHAR(64) NOT NULL REFERENCES source_runtime_state(source_id) ON DELETE CASCADE,
  task_type VARCHAR(64) NOT NULL,
  policy_version VARCHAR(64) NOT NULL,
  slot_floor_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DISPATCHED',
  task_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_scheduler_slot UNIQUE (source_id, task_type, policy_version, slot_floor_at)
);

CREATE INDEX IF NOT EXISTS idx_scheduler_slots_source ON scheduler_slots(source_id, slot_floor_at);

-- 4. Source Scheduling State (Cadence Tracking)
CREATE TABLE IF NOT EXISTS source_scheduling_state (
  source_id VARCHAR(64) PRIMARY KEY REFERENCES source_runtime_state(source_id) ON DELETE CASCADE,
  last_dispatched_slot_id VARCHAR(160),
  last_dispatched_at TIMESTAMPTZ,
  next_eligible_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Worker Tasks (Durable Queue & Lease Ledger)
CREATE TABLE IF NOT EXISTS worker_tasks (
  task_id VARCHAR(128) PRIMARY KEY,
  task_type VARCHAR(64) NOT NULL,
  source_id VARCHAR(64) NOT NULL REFERENCES source_runtime_state(source_id) ON DELETE CASCADE,
  state VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  max_attempts INTEGER NOT NULL DEFAULT 3,
  current_attempt INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  lease_owner VARCHAR(64),
  lease_token VARCHAR(128),
  lease_expires_at TIMESTAMPTZ,
  claim_revision INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_tasks_claimable ON worker_tasks(state, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_worker_tasks_source ON worker_tasks(source_id, task_type);

-- 6. Worker Task Attempts (Immutable Attempt Ledger)
CREATE TABLE IF NOT EXISTS worker_task_attempts (
  attempt_id VARCHAR(160) PRIMARY KEY,
  task_id VARCHAR(128) NOT NULL REFERENCES worker_tasks(task_id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  error_message TEXT,
  error_classification VARCHAR(64),
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_task_attempt_number UNIQUE (task_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_worker_task_attempts_task_id ON worker_task_attempts(task_id, started_at);
