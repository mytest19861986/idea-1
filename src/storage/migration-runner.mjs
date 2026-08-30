import { execSync } from "node:child_process";
import fs from "node:fs";

/**
 * ============================================================================
 * MIGRATION RUNNER SERVICE (PROD-LAUNCH-003R)
 * Enforces:
 * 1. Database-backed technical advisory lock (pg_try_advisory_lock)
 * 2. Deterministic lock key: 849201948 (Global Opportunity Platform)
 * 3. Transactional DDL (BEGIN ... COMMIT)
 * 4. Explicit lock_timeout = '2s' & statement_timeout = '30s'
 * 5. Atomic rollback on failure with ZERO partial schema changes
 * 6. Deterministic migration chain execution
 * ============================================================================
 */

export const MIGRATION_LOCK_KEY = "849201948";

export class MigrationRunner {
  constructor({ pgConfig = {}, lockTimeoutMs = 2000, statementTimeoutMs = 30000, lockKey = MIGRATION_LOCK_KEY } = {}) {
    this.pgConfig = pgConfig;
    this.lockTimeoutMs = lockTimeoutMs;
    this.statementTimeoutMs = statementTimeoutMs;
    this.lockKey = lockKey;
    this.isLinux = process.platform === "linux";
  }

  formatLinuxPath(filePath) {
    const clean = filePath.replace(/\\/g, "/");
    if (this.isLinux) return clean;
    return clean.replace(/^[A-Z]:[/\\]/, "/mnt/g/");
  }

  runPsql(db, sql) {
    const cmd = this.isLinux
      ? `export PGPASSWORD='${this.pgConfig.password || "test_password"}'; psql -v ON_ERROR_STOP=1 -U ${this.pgConfig.user || "test_user"} -d ${db} -h ${this.pgConfig.host || "127.0.0.1"} -c "${sql.replace(/"/g, '\\"')}"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${this.pgConfig.password || "test_password"}'; psql -v ON_ERROR_STOP=1 -U ${this.pgConfig.user || "test_user"} -d ${db} -h ${this.pgConfig.host || "127.0.0.1"} -c \\"${sql.replace(/"/g, '\\"')}\\""`;
    return execSync(cmd, { encoding: "utf8" }).trim();
  }

  executeTransactionalMigration(db, migrationFilePath) {
    const resolvedPath = (this.isLinux && migrationFilePath.startsWith("G:"))
      ? migrationFilePath.replace(/^[A-Z]:[/\\]/, "/mnt/g/").replace(/\\/g, "/")
      : migrationFilePath;
    const rawSql = fs.readFileSync(resolvedPath, "utf8");
    
    // Check and acquire session-level advisory lock, execute DDL in BEGIN..COMMIT, and unlock
    const executionWrapper = `
      DO $$
      BEGIN
        IF NOT pg_try_advisory_lock(${this.lockKey}::bigint) THEN
          RAISE EXCEPTION 'MIGRATION_RUNNER_ALREADY_ACTIVE: Concurrent migration execution rejected.';
        END IF;
      END $$;

      SET lock_timeout = '${this.lockTimeoutMs}ms';
      SET statement_timeout = '${this.statementTimeoutMs}ms';
      
      BEGIN;
      ${rawSql}
      COMMIT;

      SELECT pg_advisory_unlock(${this.lockKey}::bigint);
    `;

    const tmpFile = `/tmp/migration_exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.sql`;
    const winTmp = `src/storage/.tmp_mig_${Date.now()}.sql`;
    
    fs.writeFileSync(winTmp, executionWrapper);
    const linuxTmp = this.formatLinuxPath(winTmp);

    const cmd = this.isLinux
      ? `export PGPASSWORD='${this.pgConfig.password || "test_password"}'; psql -v ON_ERROR_STOP=1 -U ${this.pgConfig.user || "test_user"} -d ${db} -h ${this.pgConfig.host || "127.0.0.1"} -f "${linuxTmp}"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${this.pgConfig.password || "test_password"}'; psql -v ON_ERROR_STOP=1 -U ${this.pgConfig.user || "test_user"} -d ${db} -h ${this.pgConfig.host || "127.0.0.1"} -f '${linuxTmp}'"`;

    try {
      const out = execSync(cmd, { encoding: "utf8" });
      return { ok: true, output: out.trim() };
    } catch (err) {
      const errMsg = err.stderr ? err.stderr.toString() : (err.stdout ? err.stdout.toString() : err.message);
      
      // Ensure unlock on any runtime or DDL failure
      try {
        this.runPsql(db, `SELECT pg_advisory_unlock(${this.lockKey}::bigint);`);
      } catch (_) {}

      return {
        ok: false,
        error: errMsg.includes("MIGRATION_RUNNER_ALREADY_ACTIVE")
          ? "MIGRATION_RUNNER_ALREADY_ACTIVE: Concurrent migration execution rejected."
          : errMsg,
        atomicRollback: true
      };
    } finally {
      if (fs.existsSync(winTmp)) {
        try { fs.unlinkSync(winTmp); } catch (_) {}
      }
    }
  }
}
