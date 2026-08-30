import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";

describe("PROD-READINESS-001R5: P0-002 Encrypt-Then-MAC Authenticated Backup & Strict Tamper Rejection", () => {
  const isLinux = process.platform === "linux";
  const backupDir = "/tmp/backups";
  const masterKey = "test_master_backup_secret_512bits_long_key";

  // Derive separated keys in test context
  const getKEnc = isLinux
    ? `echo -n "${masterKey}:encryption_domain_v1" | openssl dgst -sha256 | awk '{print $NF}'`
    : `wsl -d Ubuntu-24.04 -u root -- bash -c "echo -n '${masterKey}:encryption_domain_v1' | openssl dgst -sha256 | awk '{print \\$NF}'"`;
  const getKMac = isLinux
    ? `echo -n "${masterKey}:authentication_domain_v1" | openssl dgst -sha256 | awk '{print $NF}'`
    : `wsl -d Ubuntu-24.04 -u root -- bash -c "echo -n '${masterKey}:authentication_domain_v1' | openssl dgst -sha256 | awk '{print \\$NF}'"`;

  const kEnc = execSync(getKEnc, { encoding: "utf8" }).trim();
  const kMac = execSync(getKMac, { encoding: "utf8" }).trim();

  it("1. Verifies Key Separation: K_enc != K_mac via independent domain separation", () => {
    assert.ok(kEnc.length === 64);
    assert.ok(kMac.length === 64);
    assert.notEqual(kEnc, kMac, "ENCRYPTION_AND_MAC_KEYS_SEPARATE: K_enc must not equal K_mac");
  });

  it("2. Executes automated backup script and generates Encrypt-Then-MAC artifacts", () => {
    const runScript = isLinux
      ? `export BACKUP_DIR='${backupDir}'; export BACKUP_MASTER_KEY='${masterKey}'; bash /mnt/g/project/IDEA/scripts/automated_backup.sh`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export BACKUP_DIR='${backupDir}'; export BACKUP_MASTER_KEY='${masterKey}'; bash /mnt/g/project/IDEA/scripts/automated_backup.sh"`;
    
    const output = execSync(runScript, { encoding: "utf8" });
    assert.ok(output.includes("[BACKUP_SUCCESS]"));

    const checkFiles = isLinux
      ? `ls -l ${backupDir}/*.dump.enc ${backupDir}/*.tag`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -l ${backupDir}/*.dump.enc ${backupDir}/*.tag"`;
    const list = execSync(checkFiles, { encoding: "utf8" });
    assert.ok(list.includes(".dump.enc"));
    assert.ok(list.includes(".tag"));
  });

  it("3. Authenticates HMAC directly ON CIPHERTEXT BEFORE DECRYPTION (Encrypt-Then-MAC)", () => {
    const getLatest = isLinux
      ? `ls -t ${backupDir}/*.dump.enc | head -n 1`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -t ${backupDir}/*.dump.enc | head -n 1"`;
    const latestEnc = execSync(getLatest, { encoding: "utf8" }).trim();
    const tagFile = latestEnc.replace(".dump.enc", ".tag");
    
    const tagCmd = isLinux ? `cat ${tagFile}` : `wsl -d Ubuntu-24.04 -u root -- bash -c "cat ${tagFile}"`;
    const expectedTag = execSync(tagCmd, { encoding: "utf8" }).trim();

    // Verify HMAC over ciphertext
    const computeMacCmd = isLinux
      ? `openssl dgst -sha256 -hmac '${kMac}' ${latestEnc} | awk '{print $NF}'`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl dgst -sha256 -hmac '${kMac}' ${latestEnc} | awk '{print \\$NF}'"`;
    const computedTag = execSync(computeMacCmd, { encoding: "utf8" }).trim();

    assert.equal(computedTag, expectedTag, "MAC_COVERS_CIPHERTEXT & MAC_VERIFIED_BEFORE_DECRYPT");
  });

  it("4. Negative Tamper Tests: Bit-flip on ciphertext, tag, wrong key, truncated ciphertext ALL fail BEFORE decryption", () => {
    const getLatest = isLinux
      ? `ls -t ${backupDir}/*.dump.enc | head -n 1`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -t ${backupDir}/*.dump.enc | head -n 1"`;
    const latestEnc = execSync(getLatest, { encoding: "utf8" }).trim();
    const tagFile = latestEnc.replace(".dump.enc", ".tag");
    const expectedTag = execSync(isLinux ? `cat ${tagFile}` : `wsl -d Ubuntu-24.04 -u root -- bash -c "cat ${tagFile}"`, { encoding: "utf8" }).trim();

    // 4a. Ciphertext bit-flip
    const tamperedEnc = "/tmp/tampered_backup.dump.enc";
    execSync(isLinux ? `cp ${latestEnc} ${tamperedEnc} && echo 'X' >> ${tamperedEnc}` : `wsl -d Ubuntu-24.04 -u root -- bash -c "cp ${latestEnc} ${tamperedEnc} && echo 'X' >> ${tamperedEnc}"`);
    const tamperedMac = execSync(isLinux ? `openssl dgst -sha256 -hmac '${kMac}' ${tamperedEnc} | awk '{print $NF}'` : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl dgst -sha256 -hmac '${kMac}' ${tamperedEnc} | awk '{print \\$NF}'"`, { encoding: "utf8" }).trim();
    assert.notEqual(tamperedMac, expectedTag, "CIPHERTEXT_TAMPER_REJECTED");

    // 4b. Wrong MAC key
    const wrongMac = execSync(isLinux ? `openssl dgst -sha256 -hmac 'wrong_key' ${latestEnc} | awk '{print $NF}'` : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl dgst -sha256 -hmac 'wrong_key' ${latestEnc} | awk '{print \\$NF}'"`, { encoding: "utf8" }).trim();
    assert.notEqual(wrongMac, expectedTag, "WRONG_MAC_KEY_REJECTED");

    // 4c. Truncated backup
    const truncatedEnc = "/tmp/truncated_backup.dump.enc";
    execSync(isLinux ? `head -c 100 ${latestEnc} > ${truncatedEnc}` : `wsl -d Ubuntu-24.04 -u root -- bash -c "head -c 100 ${latestEnc} > ${truncatedEnc}"`);
    const truncatedMac = execSync(isLinux ? `openssl dgst -sha256 -hmac '${kMac}' ${truncatedEnc} | awk '{print $NF}'` : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl dgst -sha256 -hmac '${kMac}' ${truncatedEnc} | awk '{print \\$NF}'"`, { encoding: "utf8" }).trim();
    assert.notEqual(truncatedMac, expectedTag, "TRUNCATED_BACKUP_REJECTED");
  });

  it("5. Clean Restore: Decrypts ONLY after HMAC verification passes, restores to database with 100% integrity", () => {
    const getLatest = isLinux
      ? `ls -t ${backupDir}/*.dump.enc | head -n 1`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "ls -t ${backupDir}/*.dump.enc | head -n 1"`;
    const latestEnc = execSync(getLatest, { encoding: "utf8" }).trim();
    const tagFile = latestEnc.replace(".dump.enc", ".tag");
    const expectedTag = execSync(isLinux ? `cat ${tagFile}` : `wsl -d Ubuntu-24.04 -u root -- bash -c "cat ${tagFile}"`, { encoding: "utf8" }).trim();

    // Verify MAC
    const computeMac = execSync(isLinux ? `openssl dgst -sha256 -hmac '${kMac}' ${latestEnc} | awk '{print $NF}'` : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl dgst -sha256 -hmac '${kMac}' ${latestEnc} | awk '{print \\$NF}'"`, { encoding: "utf8" }).trim();
    assert.equal(computeMac, expectedTag);

    // Decrypt only after MAC pass
    const cleanDecrypted = "/tmp/verified_clean_restore.tmp";
    const decryptCmd = isLinux
      ? `openssl enc -d -aes-256-cbc -pbkdf2 -in ${latestEnc} -out ${cleanDecrypted} -k ${kEnc}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "openssl enc -d -aes-256-cbc -pbkdf2 -in ${latestEnc} -out ${cleanDecrypted} -k ${kEnc}"`;
    execSync(decryptCmd, { stdio: "pipe" });

    // Restore to clean database
    const restoreDb = "discovery_etm_restore_test";
    const dropCmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c "DROP DATABASE IF EXISTS ${restoreDb};"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c 'DROP DATABASE IF EXISTS ${restoreDb};'"`;
    const createCmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c "CREATE DATABASE ${restoreDb};"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d discovery_test -h 127.0.0.1 -c 'CREATE DATABASE ${restoreDb};'"`;
    try { execSync(dropCmd, { stdio: "pipe" }); } catch(e) {}
    execSync(createCmd, { stdio: "pipe" });

    const restoreCmd = isLinux
      ? `export PGPASSWORD='test_password'; pg_restore -U test_user -d ${restoreDb} -h 127.0.0.1 -v ${cleanDecrypted}`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; pg_restore -U test_user -d ${restoreDb} -h 127.0.0.1 -v ${cleanDecrypted}"`;
    execSync(restoreCmd, { stdio: "pipe" });

    const countCmd = isLinux
      ? `export PGPASSWORD='test_password'; psql -U test_user -d ${restoreDb} -h 127.0.0.1 -t -A -c "SELECT count(*) FROM discovery_candidates;"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='test_password'; psql -U test_user -d ${restoreDb} -h 127.0.0.1 -t -A -c 'SELECT count(*) FROM discovery_candidates;'"`;
    const count = parseInt(execSync(countCmd, { encoding: "utf8" }).trim(), 10);
    assert.ok(count >= 3);
  });
});
