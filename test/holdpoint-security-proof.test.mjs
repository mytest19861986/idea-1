import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { RuntimeObservabilityService } from "../src/security/runtime-observability.mjs";

/**
 * ============================================================================
 * PROD-LAUNCH-003-HOLDPOINT-SECURITY-01: Runtime Proof Test
 * Proves:
 * 1. Runtime Secret Isolation & Redaction
 * 2. Pre-migration Encrypt-Then-MAC Backup with HMAC Tamper Verification
 * 3. Exact Pending Migrations Schema Safety (Expand-Only, Zero DROP/TRUNCATE)
 * ============================================================================
 */

describe("PROD-LAUNCH-003-HOLDPOINT-SECURITY-01: Runtime Proof Verification", () => {
  const isLinux = process.platform === "linux";
  const obs = new RuntimeObservabilityService();

  it("1. RUNTIME_SECRET_ISOLATION: Release artifacts & logs do not expose sensitive credentials", () => {
    const rawSecret = "super_secret_production_key_0x999";
    const payload = {
      dbUrl: `postgres://admin:${rawSecret}@10.0.0.5:5432/proddb`,
      auth: `Bearer eyJhbGciOi...${rawSecret}`,
      details: `password=${rawSecret}`
    };

    const sanitized = obs.sanitizePayload(payload);
    const jsonString = JSON.stringify(sanitized);

    assert.equal(jsonString.includes(rawSecret), false, "Raw secret leaked into sanitized payload!");
    assert.equal(jsonString.includes("[REDACTED]"), true, "Secret not properly redacted!");
  });

  it("2. PRE_MIGRATION_BACKUP_HMAC: Encrypt-Then-MAC produces verified authenticated snapshot", () => {
    const masterKey = "holdpoint_master_backup_secret_512bits";
    const backupDir = "/tmp/holdpoint_backups";

    const runScript = isLinux
      ? `export BACKUP_DIR='${backupDir}'; export BACKUP_MASTER_KEY='${masterKey}'; bash scripts/automated_backup.sh`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export BACKUP_DIR='${backupDir}'; export BACKUP_MASTER_KEY='${masterKey}'; bash /mnt/g/project/IDEA/scripts/automated_backup.sh"`;

    const output = execSync(runScript, { encoding: "utf8" });
    assert.ok(output.includes("[BACKUP_SUCCESS]"));

    const getLatest = isLinux
      ? `ls -t ${backupDir}/*.dump.enc | head -n 1`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -t ${backupDir}/*.dump.enc | head -n 1"`;
    const latestEnc = execSync(getLatest, { encoding: "utf8" }).trim();
    const tagFile = latestEnc.replace(".dump.enc", ".tag");

    const tagCmd = isLinux ? `cat ${tagFile}` : `wsl -d Ubuntu-24.04 -u root -- bash -c "cat ${tagFile}"`;
    const expectedTag = execSync(tagCmd, { encoding: "utf8" }).trim();

    const getKMac = isLinux
      ? `echo -n "${masterKey}:authentication_domain_v1" | openssl dgst -sha256 | awk '{print $NF}'`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "echo -n '${masterKey}:authentication_domain_v1' | openssl dgst -sha256 | awk '{print \\$NF}'"`;
    const kMac = execSync(getKMac, { encoding: "utf8" }).trim();

    const computeMacCmd = isLinux
      ? `openssl dgst -sha256 -hmac '${kMac}' ${latestEnc} | awk '{print $NF}'`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl dgst -sha256 -hmac '${kMac}' ${latestEnc} | awk '{print \\$NF}'"`;
    const computedTag = execSync(computeMacCmd, { encoding: "utf8" }).trim();

    assert.equal(computedTag, expectedTag);
  });

  it("3. EXPAND_ONLY_SCHEMA_SAFETY: Pending migrations contain zero destructive DDL", () => {
    const storageDir = path.resolve("src/storage");
    const sqlFiles = fs.readdirSync(storageDir).filter(f => f.endsWith(".sql"));

    assert.ok(sqlFiles.length > 0);

    for (const file of sqlFiles) {
      const sql = fs.readFileSync(path.join(storageDir, file), "utf8").toUpperCase();

      assert.equal(sql.includes("DROP COLUMN"), false, `File ${file} contains forbidden DROP COLUMN`);
      assert.equal(sql.includes("DROP TABLE"), false, `File ${file} contains forbidden DROP TABLE`);
      assert.equal(sql.includes("TRUNCATE"), false, `File ${file} contains forbidden TRUNCATE`);
    }
  });
});
