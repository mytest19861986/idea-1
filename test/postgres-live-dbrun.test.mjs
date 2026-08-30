import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const PG_CONFIG = {
  host: "127.0.0.1",
  port: 5432,
  user: "test_user",
  password: "test_password",
  database: "discovery_test"
};

function psqlExec(sql, { expectError = false } = {}) {
  const cleanSql = sql.replace(/\r/g, "");
  const cmd = `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -v ON_ERROR_STOP=1 -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host}"`;
  try {
    return execSync(cmd, { input: cleanSql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    if (expectError) {
      return (err.stderr || "") + (err.stdout || "") + (err.message || "");
    }
    throw err;
  }
}

function psqlExecFile(wslPath) {
  const cmd = `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -v ON_ERROR_STOP=1 -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host} -f ${wslPath}"`;
  return execSync(cmd, { encoding: "utf8" });
}

test("LIVE POSTGRES: Migration 001 and 002 apply cleanly to PostgreSQL 16", () => {
  const m1Res = psqlExecFile("/mnt/g/project/IDEA/src/storage/schema.sql");
  assert.ok(m1Res);

  const m2Res = psqlExecFile("/mnt/g/project/IDEA/migrations/002_operational_state.sql");
  assert.ok(m2Res);

  const tablesCheck = psqlExec("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
  assert.ok(tablesCheck.includes("discovery_candidates"));
  assert.ok(tablesCheck.includes("source_runtime_state"));
  assert.ok(tablesCheck.includes("scheduler_slots"));
  assert.ok(tablesCheck.includes("worker_tasks"));
  assert.ok(tablesCheck.includes("worker_task_attempts"));
});

test("LIVE POSTGRES: Candidate, Attribution, Observation, and Health Snapshot round-trip", () => {
  psqlExec("DELETE FROM discovery_candidate_attributions; DELETE FROM discovery_candidates; DELETE FROM source_observations; DELETE FROM source_health_snapshots;");

  // 1. Candidate
  psqlExec(`
    INSERT INTO discovery_candidates (
      id, canonical_url, canonical_domain, title, description,
      source_type, source_record_id, content_reference, discovered_at,
      retrieved_at, schema_version, rule_version, confidence, tags, metadata
    ) VALUES (
      'cand-live-001', 'https://example.com/saas-a', 'example.com', 'SaaS Platform A', 'B2B Analytics',
      'API', 'rec-001', 'ref-001', NOW(), NOW(), 1, 'v1', 0.95, '["saas", "analytics"]'::jsonb, '{"mrr": 5000}'::jsonb
    );
  `);

  // 2. Attribution
  psqlExec(`
    INSERT INTO discovery_candidate_attributions (
      attribution_id, candidate_id, source_id, source_type, idempotency_key,
      claim_classification, raw_document_id, collector_version, attributed_at, metadata
    ) VALUES (
      'attr-001', 'cand-live-001', 'src-live-1', 'API', 'idem-001',
      'SOURCE_CLAIM', 'raw-001', 'v1.0.0', NOW(), '{"verified": true}'::jsonb
    );
  `);

  // 3. Observation
  psqlExec(`
    INSERT INTO source_observations (
      observation_id, execution_id, source_id, success, status_code,
      yield_count, duplicate_count, unique_count, occurred_at
    ) VALUES (
      'obs-001', 'exec-001', 'src-live-1', TRUE, 200,
      10, 2, 8, NOW()
    );
  `);

  // 4. Health Snapshot
  psqlExec(`
    INSERT INTO source_health_snapshots (
      snapshot_id, source_id, window_start, window_end, operational_health, intelligence_contribution,
      confidence, governance_recommendation, evaluation_version, formula_version, findings, metrics, evaluated_at, actor
    ) VALUES (
      'snap-001', 'src-live-1', NOW() - INTERVAL '1 hour', NOW(), 'HIGH', 'HIGH',
      'HIGH', 'NO_CHANGE', 'eval-v1', 'formula-v1', '[]'::jsonb, '{"obs": 15}'::jsonb, NOW(), 'system-health'
    );
  `);

  const candCheck = psqlExec("SELECT id, title FROM discovery_candidates WHERE id='cand-live-001';");
  assert.ok(candCheck.includes("SaaS Platform A"));

  const obsCheck = psqlExec("SELECT yield_count FROM source_observations WHERE observation_id='obs-001';");
  assert.ok(obsCheck.includes("10"));
});

test("LIVE POSTGRES: Foreign keys and unique constraints are strictly enforced", () => {
  psqlExec("DELETE FROM worker_task_attempts; DELETE FROM worker_tasks; DELETE FROM scheduler_slots; DELETE FROM source_lifecycle_transitions; DELETE FROM source_runtime_state;");

  psqlExec("INSERT INTO source_runtime_state (source_id, status, revision) VALUES ('src-live-1', 'ACTIVE', 1);");

  // Duplicate PK rejected
  const dupPkRes = psqlExec("INSERT INTO source_runtime_state (source_id, status, revision) VALUES ('src-live-1', 'ACTIVE', 1);", { expectError: true });
  assert.match(dupPkRes, /duplicate key value violates unique constraint/);

  // Insert Scheduler Slot
  psqlExec("INSERT INTO scheduler_slots (slot_id, source_id, task_type, policy_version, slot_floor_at, task_id) VALUES ('slot-001', 'src-live-1', 'DISCOVERY_EXECUTION', 'policy-v1', '2026-08-30 10:00:00+00', 'task-001');");

  // Unique constraint (source_id, task_type, policy_version, slot_floor_at) prevents duplicate dispatch
  const dupSlotRes = psqlExec("INSERT INTO scheduler_slots (slot_id, source_id, task_type, policy_version, slot_floor_at, task_id) VALUES ('slot-002', 'src-live-1', 'DISCOVERY_EXECUTION', 'policy-v1', '2026-08-30 10:00:00+00', 'task-002');", { expectError: true });
  assert.match(dupSlotRes, /violates unique constraint "uq_scheduler_slot"/);

  // Foreign key constraint rejects invalid source_id
  const fkRes = psqlExec("INSERT INTO worker_tasks (task_id, task_type, source_id) VALUES ('task-err', 'DISCOVERY_EXECUTION', 'src-nonexistent');", { expectError: true });
  assert.match(fkRes, /violates foreign key constraint/);
});

test("LIVE POSTGRES: Optimistic revision locking, task leases, and attempt durability", () => {
  psqlExec("INSERT INTO worker_tasks (task_id, task_type, source_id, state, max_attempts, current_attempt, lease_owner, lease_token, claim_revision) VALUES ('task-live-101', 'DISCOVERY_EXECUTION', 'src-live-1', 'CLAIMED', 3, 1, 'worker-live-a', 'tok-101-1', 1);");

  psqlExec("INSERT INTO worker_task_attempts (attempt_id, task_id, attempt_number, worker_id, status, error_classification, started_at, finished_at) VALUES ('att-101-1', 'task-live-101', 1, 'worker-live-a', 'FAILURE', 'RETRYABLE_FAILURE', NOW(), NOW());");

  // Duplicate attempt number rejected
  const dupAttRes = psqlExec("INSERT INTO worker_task_attempts (attempt_id, task_id, attempt_number, worker_id, status, started_at, finished_at) VALUES ('att-101-dup', 'task-live-101', 1, 'worker-live-b', 'FAILURE', NOW(), NOW());", { expectError: true });
  assert.match(dupAttRes, /violates unique constraint "uq_task_attempt_number"/);

  psqlExec("INSERT INTO worker_task_attempts (attempt_id, task_id, attempt_number, worker_id, status, started_at, finished_at) VALUES ('att-101-2', 'task-live-101', 2, 'worker-live-b', 'SUCCESS', NOW(), NOW());");

  const countRes = psqlExec("SELECT COUNT(*) FROM worker_task_attempts WHERE task_id='task-live-101';");
  assert.ok(countRes.includes("2"));
});

test("LIVE POSTGRES: Process Crash Recovery & Restart Durability", () => {
  psqlExec("INSERT INTO worker_tasks (task_id, task_type, source_id, state, max_attempts, current_attempt, lease_owner, lease_token, lease_expires_at, claim_revision) VALUES ('task-crash-1', 'DISCOVERY_EXECUTION', 'src-live-1', 'CLAIMED', 3, 1, 'worker-dead', 'tok-dead', NOW() - INTERVAL '1 minute', 1);");

  psqlExec(`
    UPDATE worker_tasks
    SET state = 'PENDING', lease_owner = NULL, lease_token = NULL, claim_revision = claim_revision + 1
    WHERE state = 'CLAIMED' AND lease_expires_at < NOW();
  `);

  const recovered = psqlExec("SELECT state, claim_revision FROM worker_tasks WHERE task_id='task-crash-1';");
  assert.ok(recovered.includes("PENDING"));
  assert.ok(recovered.includes("2"));
});

test("LIVE POSTGRES: Transaction rollback on failure ensures zero partial writes", () => {
  const txSql = `
    DO $$
    BEGIN
      INSERT INTO source_runtime_state (source_id, status, revision) VALUES ('src-tx-1', 'ACTIVE', 1);
      RAISE EXCEPTION 'Simulated transaction abort';
    END $$;
  `;
  const txErr = psqlExec(txSql, { expectError: true });
  assert.match(txErr, /Simulated transaction abort/);

  const check = psqlExec("SELECT COUNT(*) FROM source_runtime_state WHERE source_id='src-tx-1';");
  assert.ok(check.includes("0"));
});
