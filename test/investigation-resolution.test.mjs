import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { PostgresInvestigationResolutionStore, InvestigationStatus, ResolutionCode } from "../src/discovery/investigation-resolution-store.mjs";

const PG_CONFIG = {
  host: "127.0.0.1",
  port: 5432,
  user: "test_user",
  password: "test_password",
  database: "discovery_test"
};

function psqlExec(sql) {
  const isInsideWsl = process.platform === "linux";
  const cmd = isInsideWsl
    ? `export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host}`
    : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host}"`;
  return execSync(cmd, { input: sql, encoding: "utf8" });
}

function createPsqlClient() {
  return {
    async query(sql, params = []) {
      let finalSql = sql;
      params.forEach((p, idx) => {
        const val = p === null ? "NULL" : (typeof p === "number" ? p : `'${String(p).replace(/'/g, "''")}'`);
        finalSql = finalSql.replace(`$${idx + 1}`, val);
      });

      const isInsideWsl = process.platform === "linux";
      const cmd = isInsideWsl
        ? `export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host} -t -A -F '|' -c "${finalSql.replace(/"/g, '\\"')}"`
        : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host} -t -A -F '|' -c \\"${finalSql.replace(/"/g, '\\"')}\\""`;

      const raw = execSync(cmd, { encoding: "utf8" }).trim();
      if (!raw) return { rows: [] };

      const lines = raw.split("\n").filter(Boolean);
      const rows = lines.map(line => {
        const parts = line.split("|");
        return {
          investigation_id: parts[0],
          opportunity_id: parts[1],
          reason_code: parts[2],
          operations_policy_version: parts[3],
          priority_at_creation: parts[4],
          status: parts[5],
          acknowledged_at: parts[6],
          resolved_at: parts[7],
          resolution_code: parts[8],
          resolution_note: parts[9],
          revision: parts[10] ? parseInt(parts[10], 10) : 1,
          created_at: parts[11],
          updated_at: parts[12]
        };
      });
      return { rows };
    }
  };
}

describe("WEB-PRODUCT-007: Investigation Resolution & Review Cadence", () => {
  const baseTime = new Date("2026-08-30T12:00:00.000Z");
  const psqlClient = createPsqlClient();
  const store = new PostgresInvestigationResolutionStore(psqlClient, { clock: () => baseTime });

  before(() => {
    // Run migration 004 in PostgreSQL
    psqlExec(`
      CREATE TABLE IF NOT EXISTS investigation_records (
        investigation_id VARCHAR(128) PRIMARY KEY,
        opportunity_id VARCHAR(128) NOT NULL,
        reason_code VARCHAR(64) NOT NULL,
        operations_policy_version VARCHAR(64) NOT NULL DEFAULT 'operations-policy-v1',
        priority_at_creation VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        acknowledged_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        resolution_code VARCHAR(64),
        resolution_note TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS investigation_events (
        event_id VARCHAR(128) PRIMARY KEY,
        investigation_id VARCHAR(128) NOT NULL,
        opportunity_id VARCHAR(128) NOT NULL,
        from_status VARCHAR(32),
        to_status VARCHAR(32) NOT NULL,
        resolution_code VARCHAR(64),
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor VARCHAR(128) NOT NULL,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });

  it("1. Creates new investigation lifecycle record (OPEN, revision 1)", async () => {
    const invId = "inv:opp-hn-live-001:stale-check";
    psqlExec(`DELETE FROM investigation_events WHERE investigation_id = '${invId}'; DELETE FROM investigation_records WHERE investigation_id = '${invId}';`);

    const res = await store.updateInvestigation({
      investigationId: invId,
      opportunityId: "disc:hacker-news-official-api:https://news.ycombinator.com/item?id=49497227",
      status: InvestigationStatus.OPEN,
      reasonCode: "INVESTIGATE_EVIDENCE_GAP",
      priorityAtCreation: "P1_HIGH"
    });

    assert.ok(res.ok);
    assert.equal(res.status, "CREATED");
    assert.equal(res.investigation.status, InvestigationStatus.OPEN);
    assert.equal(res.investigation.revision, 1);
  });

  it("2. Transition OPEN -> RESOLVED with ResolutionCode and optimistic concurrency revision 2", async () => {
    const invId = "inv:opp-hn-live-001:stale-check";

    const res = await store.updateInvestigation({
      investigationId: invId,
      opportunityId: "disc:hacker-news-official-api:https://news.ycombinator.com/item?id=49497227",
      status: InvestigationStatus.RESOLVED,
      resolutionCode: ResolutionCode.EVIDENCE_COLLECTED,
      resolutionNote: "Verified GitHub repository commits and live deployment endpoint",
      expectedRevision: 1
    });

    assert.ok(res.ok);
    assert.equal(res.status, "UPDATED");
    assert.equal(res.investigation.status, InvestigationStatus.RESOLVED);
    assert.equal(res.investigation.resolution_code, ResolutionCode.EVIDENCE_COLLECTED);
    assert.equal(res.investigation.revision, 2);
  });

  it("3. Review Cadence: evaluates DUE_FOR_REVIEW and OVERDUE deterministically", () => {
    // 0 days ago -> NOT_DUE
    const notDue = store.calculateReviewCadence({ lastReviewedAt: baseTime.toISOString(), portfolioState: "SHORTLIST" });
    assert.equal(notDue.status, "NOT_DUE");

    // 8 days ago for SHORTLIST (threshold 7d) -> DUE_FOR_REVIEW
    const due = store.calculateReviewCadence({ lastReviewedAt: new Date("2026-08-22T12:00:00.000Z").toISOString(), portfolioState: "SHORTLIST" });
    assert.equal(due.status, "DUE_FOR_REVIEW");

    // 20 days ago for SHORTLIST (threshold 7d * 2 = 14d) -> OVERDUE
    const overdue = store.calculateReviewCadence({ lastReviewedAt: new Date("2026-08-10T12:00:00.000Z").toISOString(), portfolioState: "SHORTLIST" });
    assert.equal(overdue.status, "OVERDUE");
  });
});
