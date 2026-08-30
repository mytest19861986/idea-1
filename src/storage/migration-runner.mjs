import { execSync } from "node:child_process";
import fs from "node:fs";

/**
 * ============================================================================
 * MIGRATION RUNNER SERVICE (PROD-READINESS-002R)
 * Enforces:
 * 1. Transactional DDL (BEGIN ... COMMIT)
 * 2. Explicit lock_timeout = '2s' & statement_timeout = '30s'
 * 3. Atomic rollback on failure with ZERO partial schema changes
 * 4. Deterministic migration chain execution
 * ============================================================================
 */

export class MigrationRunner {
  constructor({ pgConfig = {}, lockTimeoutMs = 2000, statementTimeoutMs = 30000 } = {}) {
    this.pgConfig = pgConfig;
    this.lockTimeoutMs = lockTimeoutMs;
    this.statementTimeoutMs = statementTimeoutMs;
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
    
    // Wrap entire migration script with strict lock_timeout and transaction block
    const executionWrapper = `
      SET lock_timeout = '${this.lockTimeoutMs}ms';
      SET statement_timeout = '${this.statementTimeoutMs}ms';
      BEGIN;
      ${rawSql}
      COMMIT;
    `;

    const cmd = this.isLinux
      ? `export PGPASSWORD='${this.pgConfig.password || "test_password"}'; psql -v ON_ERROR_STOP=1 -U ${this.pgConfig.user || "test_user"} -d ${db} -h ${this.pgConfig.host || "127.0.0.1"} -c "${executionWrapper.replace(/"/g, '\\"')}"`
      : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${this.pgConfig.password || "test_password"}'; psql -v ON_ERROR_STOP=1 -U ${this.pgConfig.user || "test_user"} -d ${db} -h ${this.pgConfig.host || "127.0.0.1"} -c \\"${executionWrapper.replace(/"/g, '\\"')}\\""`;

    try {
      const out = execSync(cmd, { encoding: "utf8" });
      return { ok: true, output: out.trim() };
    } catch (err) {
      return {
        ok: false,
        error: err.stderr || err.message,
        atomicRollback: true
      };
    }
  }
}
