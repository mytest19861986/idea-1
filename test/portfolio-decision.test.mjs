import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { PostgresPortfolioDecisionStore, PortfolioState } from "../src/discovery/portfolio-decision-store.mjs";

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
        const val = typeof p === "number" ? p : `'${String(p).replace(/'/g, "''")}'`;
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
          decision_id: parts[0],
          opportunity_id: parts[1],
          state: parts[2],
          decision_reason: parts[3],
          priority: parts[4],
          tags: parts[5] ? JSON.parse(parts[5]) : [],
          revision: parts[6] ? parseInt(parts[6], 10) : 1,
          created_at: parts[7],
          updated_at: parts[8],
          history: []
        };
      });
      return { rows };
    }
  };
}

describe("WEB-PRODUCT-005: Portfolio Persistence & Optimistic Concurrency", () => {
  const psqlClient = createPsqlClient();
  const store = new PostgresPortfolioDecisionStore(psqlClient);

  before(async () => {
    // Initialize real table schema in PostgreSQL
    psqlExec(`
      CREATE TABLE IF NOT EXISTS portfolio_decisions (
        decision_id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        decision_reason TEXT,
        priority TEXT DEFAULT 'MEDIUM',
        tags JSONB DEFAULT '[]'::jsonb,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS portfolio_decision_events (
        event_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL REFERENCES portfolio_decisions(decision_id),
        opportunity_id TEXT NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor TEXT NOT NULL,
        reason TEXT
      );
    `);
  });

  it("1. Persists new portfolio decision into PostgreSQL (SHORTLIST, revision 1)", async () => {
    const oppId = "disc:hacker-news-official-api:https://news.ycombinator.com/item?id=49497227";
    psqlExec(`DELETE FROM portfolio_decision_events WHERE opportunity_id = '${oppId}'; DELETE FROM portfolio_decisions WHERE opportunity_id = '${oppId}';`);
    const res = await store.setDecision({
      opportunityId: oppId,
      state: PortfolioState.SHORTLIST,
      decisionReason: "High traction and low build complexity identified during pilot",
      priority: "HIGH",
      tags: ["ai-widget", "pilot-winner"]
    });

    assert.ok(res.ok);
    assert.equal(res.status, "CREATED");
    assert.equal(res.decision.state, PortfolioState.SHORTLIST);
    assert.equal(res.decision.revision, 1);
    console.log("Successfully created durable portfolio decision in PostgreSQL:", res.decision);
  });

  it("2. Optimistic Concurrency: revision increments on valid expectedRevision, CONFLICT on stale revision", async () => {
    const oppId = "disc:hacker-news-official-api:https://news.ycombinator.com/item?id=49497227";
    
    // Stale update (expectedRevision 999 != 1) -> CONFLICT
    const conflictRes = await store.setDecision({
      opportunityId: oppId,
      state: PortfolioState.HOLD,
      expectedRevision: 999
    });
    assert.equal(conflictRes.ok, false);
    assert.equal(conflictRes.status, "CONFLICT");

    // Valid update (expectedRevision 1) -> UPDATED (revision 2)
    const validRes = await store.setDecision({
      opportunityId: oppId,
      state: PortfolioState.INVESTIGATE,
      expectedRevision: 1,
      decisionReason: "Requested deeper pricing validation"
    });
    assert.ok(validRes.ok);
    assert.equal(validRes.status, "UPDATED");
    assert.equal(validRes.decision.revision, 2);
    assert.equal(validRes.decision.state, PortfolioState.INVESTIGATE);
    console.log("Successfully updated portfolio decision with revision 2:", validRes.decision);
  });
});
