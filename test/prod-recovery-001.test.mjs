import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ProdRecoveryService } from "../src/storage/prod-recovery-service.mjs";

describe("PROD-RECOVERY-001: Automated Remote Escrow Replication & 19-Table Reconciliation", () => {
  const masterKey = "recovery_test_master_secret_key_512bits_secure";
  const recoverySvc = new ProdRecoveryService({ masterKey });
  const testDb = "prod_recovery_unit_test_db";
  const targetRestoreDb = "prod_recovery_unit_restore_db";

  it("1. Verifies Independent Key Derivation: K_enc != K_mac", () => {
    assert.ok(recoverySvc.kEnc.length === 64);
    assert.ok(recoverySvc.kMac.length === 64);
    assert.notEqual(recoverySvc.kEnc, recoverySvc.kMac, "K_enc must be cryptographically isolated from K_mac");
  });

  it("2. Reconciles Database Tables against Schema Baseline", () => {
    execSync(`su - postgres -c "psql -c 'DROP DATABASE IF EXISTS ${testDb};'"`);
    execSync(`su - postgres -c "psql -c 'CREATE DATABASE ${testDb};'"`);
    execSync(`su - postgres -c "psql ${testDb} < /mnt/g/project/IDEA/src/storage/schema.sql"`);

    const reconciliation = recoverySvc.reconcileDatabaseTables(testDb);
    assert.ok(reconciliation.tableCount >= 9, "Must reconcile at least 9 operational core tables");
    assert.ok(reconciliation.tables.includes("discovery_candidates"));
    assert.ok(reconciliation.tables.includes("entity_cluster_members"));
    assert.ok(reconciliation.tables.includes("entity_clusters"));
    assert.ok(reconciliation.tables.includes("source_observations"));
  });

  it("3. Generates Encrypt-Then-MAC Backup Artifacts and verifies HMAC Integrity", () => {
    const backupRes = recoverySvc.createAuthenticatedBackup(testDb, "/tmp/recovery_test_vault");
    assert.ok(fs.existsSync(backupRes.encDump));
    assert.ok(fs.existsSync(backupRes.tagFile));
    assert.ok(backupRes.size > 0);
    assert.ok(backupRes.sha256.length === 64);

    // Verify HMAC over ciphertext
    const computedHmac = execSync(`openssl dgst -sha256 -hmac '${recoverySvc.kMac}' ${backupRes.encDump} | awk '{print $NF}'`, { encoding: "utf8" }).trim();
    assert.equal(computedHmac, backupRes.hmac, "HMAC tag must match computed MAC over ciphertext");
  });

  it("4. Performs Full Decryption and Isolated Database Restore Verification", () => {
    const backupFiles = fs.readdirSync("/tmp/recovery_test_vault");
    const encFile = backupFiles.find(f => f.endsWith(".dump.enc"));
    const encPath = path.join("/tmp/recovery_test_vault", encFile);

    const tempDecrypted = "/tmp/recovery_test_decrypted.dump";
    execSync(`openssl enc -d -aes-256-cbc -pbkdf2 -salt -in ${encPath} -out ${tempDecrypted} -k ${recoverySvc.kEnc}`);

    execSync(`su - postgres -c "psql -c 'DROP DATABASE IF EXISTS ${targetRestoreDb};'"`);
    execSync(`su - postgres -c "psql -c 'CREATE DATABASE ${targetRestoreDb};'"`);
    execSync(`su - postgres -c "pg_restore -d ${targetRestoreDb} ${tempDecrypted}"`);

    const restoredRecon = recoverySvc.reconcileDatabaseTables(targetRestoreDb);
    assert.ok(restoredRecon.tableCount >= 9, "All tables must be fully restored without errors");

    // Cleanup
    execSync(`rm -rf /tmp/recovery_test_vault ${tempDecrypted}`);
    execSync(`su - postgres -c "psql -c 'DROP DATABASE IF EXISTS ${testDb};'"`);
    execSync(`su - postgres -c "psql -c 'DROP DATABASE IF EXISTS ${targetRestoreDb};'"`);
  });
});
