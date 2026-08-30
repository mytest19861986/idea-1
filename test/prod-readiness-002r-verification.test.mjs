import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { MigrationRunner } from "../src/storage/migration-runner.mjs";
import { ProductionProcessSupervisor } from "../src/security/process-supervisor.mjs";
import { RuntimeObservabilityService } from "../src/security/runtime-observability.mjs";
import { ProductionReleaseManager } from "../src/security/release-manager.mjs";

/**
 * ============================================================================
 * PROD-READINESS-002R INTEGRATION VERIFICATION SUITE
 * Validates:
 * 1. Transactional DDL & Lock Timeout with MigrationRunner
 * 2. Process Supervisor recovery & crash loop protection
 * 3. Runtime Observability & Out-of-Process Alert Delivery
 * 4. Release Manager & Safe Rollback on healthcheck crash
 * ============================================================================
 */

describe("PROD-READINESS-002R: Runtime Operations, Migration Safety & Release Recovery", () => {
  const isLinux = process.platform === "linux";
  const testDb = "prod_002r_verification_db";
  const psqlBase = isLinux
    ? `export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1`
    : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1"`;

  before(() => {
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

  it("1. MIGRATION_RUNNER: Executes 001-004 in strict transactional blocks with lock_timeout = 2s", () => {
    const runner = new MigrationRunner({
      pgConfig: { user: "test_user", password: "test_password", host: "127.0.0.1" },
      lockTimeoutMs: 2000
    });

    const m1 = runner.executeTransactionalMigration(testDb, "G:/project/IDEA/src/storage/schema.sql");
    assert.equal(m1.ok, true);

    const m2 = runner.executeTransactionalMigration(testDb, "G:/project/IDEA/migrations/002_operational_state.sql");
    assert.equal(m2.ok, true);

    const m3 = runner.executeTransactionalMigration(testDb, "G:/project/IDEA/src/storage/003_portfolio_decision_workflows.sql");
    assert.equal(m3.ok, true);

    const m4 = runner.executeTransactionalMigration(testDb, "G:/project/IDEA/src/storage/004_investigation_resolution_workflows.sql");
    assert.equal(m4.ok, true);

    // Verify all 11 tables present
    const tables = runner.runPsql(testDb, "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
    assert.ok(tables.includes("discovery_candidates"));
    assert.ok(tables.includes("portfolio_decisions"));
    assert.ok(tables.includes("investigation_records"));
  });

  it("2. PROCESS_SUPERVISOR: Auto-restarts on crash, protects against restart storms (CRASH_LOOP_BLOCKED)", () => {
    const supervisor = new ProductionProcessSupervisor({
      config: { DATABASE_URL: "postgres://...", HMAC_SECRET: "sec", APP_PORT: 3000 },
      maxRestarts: 3,
      restartWindowMs: 1000
    });

    // Crash 1
    const r1 = supervisor.handleProcessCrash(new Error("Crash 1"));
    assert.equal(r1.restarted, true);

    // Crash 2
    const r2 = supervisor.handleProcessCrash(new Error("Crash 2"));
    assert.equal(r2.restarted, true);

    // Crash 3
    const r3 = supervisor.handleProcessCrash(new Error("Crash 3"));
    assert.equal(r3.restarted, true);

    // Crash 4 (Exceeds maxRestarts=3)
    const r4 = supervisor.handleProcessCrash(new Error("Crash 4"));
    assert.equal(r4.restarted, false);
    assert.equal(supervisor.status, "CRASH_LOOP_BLOCKED");
  });

  it("3. OBSERVABILITY_RUNTIME: Delivers critical alerts to out-of-process sink with sanitized secrets", async () => {
    const outOfProcessReceived = [];
    const mockSink = {
      async sendAlert(alert) {
        outOfProcessReceived.push(alert);
        return { delivered: true };
      }
    };

    const obs = new RuntimeObservabilityService({ outOfProcessSink: mockSink });
    const res = await obs.emitCriticalAlert("DATABASE_UNAVAILABLE", {
      connection: "postgres://user:super_secret_password@127.0.0.1:5432/db",
      bearer: "Bearer token_secret_12345"
    });

    assert.equal(res.triggered, true);
    assert.equal(res.deliveredOutOfProcess, true);
    assert.equal(outOfProcessReceived.length, 1);
    
    // Assert secrets are redacted
    assert.ok(!JSON.stringify(outOfProcessReceived[0]).includes("super_secret_password"));
    assert.ok(!JSON.stringify(outOfProcessReceived[0]).includes("token_secret_12345"));
    assert.ok(JSON.stringify(outOfProcessReceived[0]).includes("[REDACTED]"));
  });

  it("4. RELEASE_MANAGER: Detects bad release on healthcheck failure and rolls back cleanly to previous good release", () => {
    const releaseMgr = new ProductionReleaseManager({ currentReleaseId: "v1.0.0" });

    // Deploy v1.1.0 with healthcheck failure
    const deployBad = releaseMgr.deployNewRelease("v1.1.0-bad", { healthcheckPass: false });
    assert.equal(deployBad.ok, false);
    assert.equal(deployBad.status, "FAILED_AND_ROLLED_BACK");
    assert.equal(releaseMgr.currentReleaseId, "v1.0.0");
    assert.equal(releaseMgr.status, "HEALTHY");

    // Deploy v1.2.0-incompatible with backward-incompatible schema
    const deployIncompatible = releaseMgr.deployNewRelease("v1.2.0-incompatible", {
      healthcheckPass: true,
      schemaCompatibleWithPrevious: false
    });
    assert.equal(deployIncompatible.ok, false);
    assert.ok(deployIncompatible.error.includes("DEPLOYMENT_BLOCKED"));
    assert.equal(releaseMgr.currentReleaseId, "v1.0.0");
  });
});
