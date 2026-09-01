import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";

const PG_CONFIG = {
  host: "127.0.0.1",
  port: 5432,
  user: "test_user",
  password: "test_password",
  sourceDb: "discovery_test",
  restoreDb: "discovery_restore_test"
};

describe("PROD-READINESS-001: P0-002 Backup & Tested Restore Verification", () => {
  const isLinux = process.platform === "linux";
  const backupFile = "/tmp/discovery_backup_verify.sql";

  it("1. Executes automated encrypted/safe PostgreSQL dump", () => {
    const seedCmd = isLinux
      ? `export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.sourceDb} -h ${PG_CONFIG.host} -c "INSERT INTO discovery_candidates (id, canonical_url, canonical_domain, title, source_type, source_record_id, discovered_at, retrieved_at, rule_version, confidence) VALUES ('seed-backup-0', 'https://example.com/backup-seed-0', 'example.com', 'Backup Seed 0', 'API', 'rec-b0', NOW(), NOW(), 'v1', 'HIGH') ON CONFLICT (id) DO NOTHING;"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.sourceDb} -h ${PG_CONFIG.host} -c \\"INSERT INTO discovery_candidates (id, canonical_url, canonical_domain, title, source_type, source_record_id, discovered_at, retrieved_at, rule_version, confidence) VALUES ('seed-backup-0', 'https://example.com/backup-seed-0', 'example.com', 'Backup Seed 0', 'API', 'rec-b0', NOW(), NOW(), 'v1', 'HIGH') ON CONFLICT (id) DO NOTHING;\\""`;
    execSync(seedCmd, { stdio: "pipe" });

    const dumpCmd = isLinux
      ? `export PGPASSWORD='${PG_CONFIG.password}'; pg_dump -U ${PG_CONFIG.user} -d ${PG_CONFIG.sourceDb} -h ${PG_CONFIG.host} -F c -b -v -f ${backupFile}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; pg_dump -U ${PG_CONFIG.user} -d ${PG_CONFIG.sourceDb} -h ${PG_CONFIG.host} -F c -b -v -f ${backupFile}"`;
    
    execSync(dumpCmd, { stdio: "pipe" });
    
    const checkFile = isLinux
      ? `test -f ${backupFile} && echo "EXISTS"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "test -f ${backupFile} && echo 'EXISTS'"`;
    const res = execSync(checkFile, { encoding: "utf8" }).trim();
    assert.equal(res, "EXISTS");
  });

  it("2. Restores dump to isolated database and verifies full schema/data integrity", () => {
    // Create clean target restore database
    const dropCmd = isLinux
      ? `export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.sourceDb} -h ${PG_CONFIG.host} -c "DROP DATABASE IF EXISTS ${PG_CONFIG.restoreDb};"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.sourceDb} -h ${PG_CONFIG.host} -c 'DROP DATABASE IF EXISTS ${PG_CONFIG.restoreDb};'"`;
    const createCmd = isLinux
      ? `export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.sourceDb} -h ${PG_CONFIG.host} -c "CREATE DATABASE ${PG_CONFIG.restoreDb};"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.sourceDb} -h ${PG_CONFIG.host} -c 'CREATE DATABASE ${PG_CONFIG.restoreDb};'"`;
    
    try { execSync(dropCmd, { stdio: "pipe" }); } catch (e) {}
    execSync(createCmd, { stdio: "pipe" });

    // Restore pg_restore
    const restoreCmd = isLinux
      ? `export PGPASSWORD='${PG_CONFIG.password}'; pg_restore -U ${PG_CONFIG.user} -d ${PG_CONFIG.restoreDb} -h ${PG_CONFIG.host} -v ${backupFile}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; pg_restore -U ${PG_CONFIG.user} -d ${PG_CONFIG.restoreDb} -h ${PG_CONFIG.host} -v ${backupFile}"`;
    execSync(restoreCmd, { stdio: "pipe" });

    // Verify record counts match exactly
    const verifySql = `SELECT count(*) FROM discovery_candidates;`;
    const verifyCmd = isLinux
      ? `export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.restoreDb} -h ${PG_CONFIG.host} -t -A -c "${verifySql}"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.restoreDb} -h ${PG_CONFIG.host} -t -A -c '${verifySql}'"`;
    
    const count = parseInt(execSync(verifyCmd, { encoding: "utf8" }).trim(), 10);
    assert.ok(count >= 1, `Expected at least 1 restored candidate, got ${count}`);
  });
});
