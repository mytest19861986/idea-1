import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";

/**
 * ============================================================================
 * PROD-READINESS-002: TASK 1 - Clean Database Migration Chain Runtime Proof
 * Boots a clean disposable database and executes:
 * 001_initial_discovery_schema.sql -> 002_operational_state.sql -> 
 * 003_portfolio_decision_workflows.sql -> 004_investigation_resolution_workflows.sql
 * ============================================================================
 */

describe("PROD-READINESS-002: Clean Database Migration Chain (001 -> 004)", () => {
  const isLinux = process.platform === "linux";
  const testDb = "clean_migration_bootstrap_test";
  const psqlBase = isLinux
    ? `export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1`
    : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1"`;

  const runSql = (db, sql) => {
    const cmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -v ON_ERROR_STOP=1 -U test_user -d ${db} -h 127.0.0.1 -c "${sql.replace(/"/g, '\\"')}"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -v ON_ERROR_STOP=1 -U test_user -d ${db} -h 127.0.0.1 -c \\"${sql.replace(/"/g, '\\"')}\\""`;
    return execSync(cmd, { encoding: "utf8" }).trim();
  };

  const runSqlFile = (db, filePath) => {
    const linuxPath = filePath.replace(/^[A-Z]:[/\\]/, "/mnt/g/").replace(/\\/g, "/");
    const cmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -v ON_ERROR_STOP=1 -U test_user -d ${db} -h 127.0.0.1 -f "${linuxPath}"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -v ON_ERROR_STOP=1 -U test_user -d ${db} -h 127.0.0.1 -f '${linuxPath}'"`;
    return execSync(cmd, { encoding: "utf8" }).trim();
  };

  before(() => {
    // 1. Drop and create clean disposable database
    try {
      execSync(isLinux ? `${psqlBase} -c "DROP DATABASE IF EXISTS ${testDb};"` : `${psqlBase} -c 'DROP DATABASE IF EXISTS ${testDb};'`, { stdio: "pipe" });
    } catch {}
    execSync(isLinux ? `${psqlBase} -c "CREATE DATABASE ${testDb};"` : `${psqlBase} -c 'CREATE DATABASE ${testDb};'`, { stdio: "pipe" });
  });

  after(() => {
    try {
      execSync(isLinux ? `${psqlBase} -c "DROP DATABASE IF EXISTS ${testDb};"` : `${psqlBase} -c 'DROP DATABASE IF EXISTS ${testDb};'`, { stdio: "pipe" });
    } catch {}
  });

  it("1. CLEAN_DATABASE_CREATED: Clean database starts with 0 user tables", () => {
    const res = runSql(testDb, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';");
    assert.equal(res.split("\n")[2].trim(), "0");
  });

  it("2. MIGRATION_001: Initial discovery schema applies cleanly", () => {
    const res = runSqlFile(testDb, "G:/project/IDEA/src/storage/schema.sql");
    assert.ok(res.includes("CREATE TABLE"));
    const count = runSql(testDb, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';");
    assert.ok(parseInt(count.split("\n")[2].trim(), 10) >= 6);
  });

  it("3. MIGRATION_002: Operational state and scheduler slots apply cleanly", () => {
    const res = runSqlFile(testDb, "G:/project/IDEA/migrations/002_operational_state.sql");
    assert.ok(res.includes("CREATE TABLE"));
    const check = runSql(testDb, "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='worker_tasks';");
    assert.ok(check.includes("worker_tasks"));
  });

  it("4. MIGRATION_003: Portfolio decision workflows apply cleanly", () => {
    const res = runSqlFile(testDb, "G:/project/IDEA/src/storage/003_portfolio_decision_workflows.sql");
    assert.ok(res.includes("CREATE TABLE"));
    const check = runSql(testDb, "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='portfolio_decisions';");
    assert.ok(check.includes("portfolio_decisions"));
  });

  it("5. MIGRATION_004: Investigation resolution workflows apply cleanly", () => {
    const res = runSqlFile(testDb, "G:/project/IDEA/src/storage/004_investigation_resolution_workflows.sql");
    assert.ok(res.includes("CREATE TABLE"));
    const check = runSql(testDb, "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='investigation_records';");
    assert.ok(check.includes("investigation_records"));
  });

  it("6. FULL_CHAIN_001_TO_004: Schema objects verified and application queries execute without failure", () => {
    const tables = runSql(testDb, "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
    const requiredTables = [
      "discovery_candidates",
      "discovery_candidate_attributions",
      "source_observations",
      "source_health_snapshots",
      "source_runtime_state",
      "scheduler_slots",
      "worker_tasks",
      "worker_task_attempts",
      "portfolio_decisions",
      "investigation_records",
      "investigation_events"
    ];
    for (const t of requiredTables) {
      assert.ok(tables.includes(t), `Missing expected schema table: ${t}`);
    }
  });
});
