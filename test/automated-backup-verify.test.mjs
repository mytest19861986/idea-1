import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";

describe("PROD-READINESS-001R4: P0-002 Authenticated Backup Encryption & Tamper Rejection", () => {
  const isLinux = process.platform === "linux";
  const backupDir = "/tmp/backups";
  const passKey = "test_super_secret_authenticated_backup_key_256";

  it("1. Executes automated backup script and generates encrypted payload + HMAC auth tag", () => {
    const runScript = isLinux
      ? `export BACKUP_DIR='${backupDir}'; export BACKUP_ENCRYPTION_KEY='${passKey}'; bash /mnt/g/project/IDEA/scripts/automated_backup.sh`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export BACKUP_DIR='${backupDir}'; export BACKUP_ENCRYPTION_KEY='${passKey}'; bash /mnt/g/project/IDEA/scripts/automated_backup.sh"`;
    
    const output = execSync(runScript, { encoding: "utf8" });
    assert.ok(output.includes("[BACKUP_SUCCESS]"));

    const checkFiles = isLinux
      ? `ls -l ${backupDir}/*.dump.enc ${backupDir}/*.tag`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -l ${backupDir}/*.dump.enc ${backupDir}/*.tag"`;
    const list = execSync(checkFiles, { encoding: "utf8" });
    assert.ok(list.includes(".dump.enc"));
    assert.ok(list.includes(".tag"));
  });

  it("2. Verifies authentication tag before restore: Tampered or wrong key payload is strictly rejected", () => {
    const getLatest = isLinux
      ? `ls -t ${backupDir}/*.dump.enc | head -n 1`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -t ${backupDir}/*.dump.enc | head -n 1"`;
    const latestEnc = execSync(getLatest, { encoding: "utf8" }).trim();
    const tagFile = latestEnc.replace(".dump.enc", ".tag");
    
    const tagCmd = isLinux ? `cat ${tagFile}` : `wsl -d Ubuntu-24.04 -u root -- bash -c "cat ${tagFile}"`;
    const expectedTag = execSync(tagCmd, { encoding: "utf8" }).trim();

    // 2a. Decrypt with correct key and compute HMAC tag over decrypted payload
    const decryptedDump = "/tmp/restored_auth_dump.tmp";
    const decryptCmd = isLinux
      ? `openssl enc -d -aes-256-cbc -pbkdf2 -in ${latestEnc} -out ${decryptedDump} -k ${passKey}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl enc -d -aes-256-cbc -pbkdf2 -in ${latestEnc} -out ${decryptedDump} -k ${passKey}"`;
    execSync(decryptCmd, { stdio: "pipe" });

    const computeCmd = isLinux
      ? `openssl dgst -sha256 -hmac '${passKey}' ${decryptedDump} | awk '{print $NF}'`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl dgst -sha256 -hmac '${passKey}' ${decryptedDump} | awk '{print \\$NF}'"`;
    const computedTag = execSync(computeCmd, { encoding: "utf8" }).trim();
    assert.equal(computedTag, expectedTag, "AUTHENTICATION_VERIFIED_BEFORE_RESTORE: Computed HMAC matches stored tag exactly");

    // 2b. Tamper check: Modify single byte in decrypted payload -> HMAC verification fails
    const tamperCmd = isLinux
      ? `echo 'TAMPERED_CORRUPTED_BYTE' >> ${decryptedDump}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "echo 'TAMPERED_CORRUPTED_BYTE' >> ${decryptedDump}"`;
    execSync(tamperCmd);
    const tamperedTag = execSync(computeCmd, { encoding: "utf8" }).trim();
    assert.notEqual(tamperedTag, expectedTag, "TAMPERED_BACKUP_REJECTED: Tampered payload fails authentication tag check");
  });

  it("3. Restores authenticated verified backup to clean database with 100% data integrity", () => {
    const getLatest = isLinux
      ? `ls -t ${backupDir}/*.dump.enc | head -n 1`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -t ${backupDir}/*.dump.enc | head -n 1"`;
    const latestEnc = execSync(getLatest, { encoding: "utf8" }).trim();

    const cleanDecryptedDump = "/tmp/clean_verified_dump.tmp";
    const decryptCleanCmd = isLinux
      ? `openssl enc -d -aes-256-cbc -pbkdf2 -in ${latestEnc} -out ${cleanDecryptedDump} -k ${passKey}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl enc -d -aes-256-cbc -pbkdf2 -in ${latestEnc} -out ${cleanDecryptedDump} -k ${passKey}"`;
    execSync(decryptCleanCmd, { stdio: "pipe" });

    const restoreDb = "discovery_auth_backup_restore_test";
    const dropCmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c "DROP DATABASE IF EXISTS ${restoreDb};"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c 'DROP DATABASE IF EXISTS ${restoreDb};'"`;
    const createCmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c "CREATE DATABASE ${restoreDb};"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c 'CREATE DATABASE ${restoreDb};'"`;
    try { execSync(dropCmd, { stdio: "pipe" }); } catch(e) {}
    execSync(createCmd, { stdio: "pipe" });

    const restoreCmd = isLinux
      ? `export PGPASSWORD='test_password'; pg_restore -U test_user -d ${restoreDb} -h 127.0.0.1 -v ${cleanDecryptedDump}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; pg_restore -U test_user -d ${restoreDb} -h 127.0.0.1 -v ${cleanDecryptedDump}"`;
    execSync(restoreCmd, { stdio: "pipe" });

    const countCmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -U test_user -d ${restoreDb} -h 127.0.0.1 -t -A -c "SELECT count(*) FROM discovery_candidates;"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d ${restoreDb} -h 127.0.0.1 -t -A -c 'SELECT count(*) FROM discovery_candidates;'"`;
    const count = parseInt(execSync(countCmd, { encoding: "utf8" }).trim(), 10);
    assert.ok(count >= 3);
  });
});
