import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export function collectCategoryEvidence() {
  const isLinux = process.platform === "linux";
  const runCmd = (cmd) => {
    try {
      const fullCmd = isLinux ? cmd : `wsl -d Ubuntu-24.04 -u root -- bash -c "${cmd.replace(/"/g, '\\"')}"`;
      return {
        cmd,
        exitCode: 0,
        output: execSync(fullCmd, { encoding: "utf8" }).trim()
      };
    } catch (err) {
      return {
        cmd,
        exitCode: err.status || 1,
        output: err.stdout ? err.stdout.toString() : err.message
      };
    }
  };

  // Safe git config
  runCmd("git config --global --add safe.directory /mnt/g/project/IDEA");

  // 1. Secret Isolation
  const gitScan = runCmd("git log -p -n 10 | grep -iE 'password=|secret=' | head -n 5 || true");
  const logRedactionTest = runCmd("cd /mnt/g/project/IDEA && node --test test/holdpoint-security-proof.test.mjs");

  // 2. Auth & RBAC
  const rbacTest = runCmd("cd /mnt/g/project/IDEA && node --test test/auth-boundary.test.mjs");

  // 3. TLS Perimeter
  const tlsTest = runCmd("cd /mnt/g/project/IDEA && node --test test/tls-handshake-verify.test.mjs");

  // 4. Backup Authenticity & Tamper Detection
  const backupTest = runCmd("cd /mnt/g/project/IDEA && node --test test/automated-backup-verify.test.mjs");

  // 5. Migration Safety
  const migrationScan = runCmd("grep -rnE 'DROP COLUMN|DROP TABLE|TRUNCATE' /mnt/g/project/IDEA/src/storage/*.sql || true");
  const migrationBootstrapTest = runCmd("cd /mnt/g/project/IDEA && node --test test/clean-migration-bootstrap.test.mjs");

  // 6. Single Runner Guard
  const migrationRunnerSource = fs.readFileSync(path.resolve("src/storage/migration-runner.mjs"), "utf8");
  const hasPgAdvisoryLock = migrationRunnerSource.includes("pg_advisory_lock") || migrationRunnerSource.includes("pg_try_advisory_lock");

  // 7. Release Rollback
  const rollbackTest = runCmd("cd /mnt/g/project/IDEA && node --test test/prod-readiness-002r-final-evidence.test.mjs");

  return {
    cat1: { gitScan, logRedactionTest },
    cat2: { rbacTest },
    cat3: { tlsTest },
    cat4: { backupTest },
    cat5: { migrationScan, migrationBootstrapTest },
    cat6: { technicalSingleRunnerGuard: hasPgAdvisoryLock ? "IMPLEMENTED" : "NOT_IMPLEMENTED" },
    cat7: { rollbackTest }
  };
}
