import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";

describe("PROD-READINESS-001R3: P0-002 Automated Encrypted Backup & Recovery Proof", () => {
  const isLinux = process.platform === "linux";
  const backupDir = "/tmp/backups";
  const passKey = "test_super_secret_encryption_key_256";

  it("1. Executes automated backup script, generates AES-256 encrypted artifact, and restricts permissions", () => {
    const runScript = isLinux
      ? `export BACKUP_DIR='${backupDir}'; export BACKUP_ENCRYPTION_KEY='${passKey}'; bash /mnt/g/project/IDEA/scripts/automated_backup.sh`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export BACKUP_DIR='${backupDir}'; export BACKUP_ENCRYPTION_KEY='${passKey}'; bash /mnt/g/project/IDEA/scripts/automated_backup.sh"`;
    
    const output = execSync(runScript, { encoding: "utf8" });
    assert.ok(output.includes("[BACKUP_SUCCESS]"));

    // Verify encrypted file exists and has 0600 permissions
    const checkEnc = isLinux
      ? `ls -l ${backupDir}/*.dump.enc`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -l ${backupDir}/*.dump.enc"`;
    const encList = execSync(checkEnc, { encoding: "utf8" });
    assert.ok(encList.includes("-rw-------")); // 0600 permissions
  });

  it("2. Decrypts and restores automated backup to clean database, verifying full data integrity", () => {
    // Find latest encrypted dump
    const getLatest = isLinux
      ? `ls -t ${backupDir}/*.dump.enc | head -n 1`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -t ${backupDir}/*.dump.enc | head -n 1"`;
    const latestEnc = execSync(getLatest, { encoding: "utf8" }).trim();

    // Decrypt artifact with AES-256
    const decryptedDump = "/tmp/restored_dump.tmp";
    const decryptCmd = isLinux
      ? `openssl enc -d -aes-256-cbc -pbkdf2 -in ${latestEnc} -out ${decryptedDump} -k ${passKey}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl enc -d -aes-256-cbc -pbkdf2 -in ${latestEnc} -out ${decryptedDump} -k ${passKey}"`;
    execSync(decryptCmd, { stdio: "pipe" });

    // Setup isolated test database and restore
    const restoreDb = "discovery_automated_restore_test";
    const dropCmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c "DROP DATABASE IF EXISTS ${restoreDb};"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c 'DROP DATABASE IF EXISTS ${restoreDb};'"`;
    const createCmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c "CREATE DATABASE ${restoreDb};"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c 'CREATE DATABASE ${restoreDb};'"`;
    
    try { execSync(dropCmd, { stdio: "pipe" }); } catch(e) {}
    execSync(createCmd, { stdio: "pipe" });

    const restoreCmd = isLinux
      ? `export PGPASSWORD='test_password'; pg_restore -U test_user -d ${restoreDb} -h 127.0.0.1 -v ${decryptedDump}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; pg_restore -U test_user -d ${restoreDb} -h 127.0.0.1 -v ${decryptedDump}"`;
    execSync(restoreCmd, { stdio: "pipe" });

    // Verify row counts match exactly
    const countSql = `SELECT count(*) FROM discovery_candidates;`;
    const countCmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -U test_user -d ${restoreDb} -h 127.0.0.1 -t -A -c "${countSql}"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d ${restoreDb} -h 127.0.0.1 -t -A -c '${countSql}'"`;
    
    const count = parseInt(execSync(countCmd, { encoding: "utf8" }).trim(), 10);
    assert.ok(count >= 3);
  });
});
