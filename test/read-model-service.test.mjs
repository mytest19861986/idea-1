import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { PostgresOpportunityReadService } from "../src/storage/read-model-service.mjs";

const PG_CONFIG = {
  host: "127.0.0.1",
  port: 5432,
  user: "test_user",
  password: "test_password",
  database: "discovery_test"
};

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

      // Query parsing helper for test
      const lines = raw.split("\n").filter(Boolean);
      if (sql.includes("COUNT(a.attribution_id)")) {
        const rows = lines.map(line => {
          const parts = line.split("|");
          return {
            id: parts[0],
            title: parts[1],
            description: parts[2],
            canonical_url: parts[3],
            canonical_domain: parts[4],
            source_type: parts[5],
            source_record_id: parts[6],
            confidence: parts[7],
            discovered_at: parts[8],
            retrieved_at: parts[9],
            tags: parts[10] ? JSON.parse(parts[10]) : [],
            metadata: parts[11] ? JSON.parse(parts[11]) : {},
            source_count: parts[12],
            primary_classification: parts[13] || "SOURCE_CLAIM"
          };
        });
        return { rows };
      } else if (sql.includes("FROM discovery_candidates")) {
        const parts = lines[0].split("|");
        return {
          rows: [{
            id: parts[0],
            title: parts[1],
            description: parts[2],
            canonical_url: parts[3],
            canonical_domain: parts[4],
            source_type: parts[5],
            source_record_id: parts[6],
            confidence: parts[7],
            discovered_at: parts[8],
            retrieved_at: parts[9],
            tags: parts[10] ? JSON.parse(parts[10]) : [],
            metadata: parts[11] ? JSON.parse(parts[11]) : {}
          }]
        };
      } else if (sql.includes("FROM discovery_candidate_attributions")) {
        const rows = lines.map(l => {
          const p = l.split("|");
          return {
            attribution_id: p[0],
            source_id: p[1],
            source_type: p[2],
            idempotency_key: p[3],
            claim_classification: p[4],
            collector_version: p[5],
            attributed_at: p[6],
            metadata: p[7] ? JSON.parse(p[7]) : {}
          };
        });
        return { rows };
      }

      return { rows: [] };
    }
  };
}

describe("WEB-PRODUCT-004: Live PostgreSQL Read Model & ViewModel Integration", () => {
  const psqlClient = createPsqlClient();
  const readService = new PostgresOpportunityReadService(psqlClient);

  it("1. Lists opportunities as source-neutral OpportunitySummaryViewModel array from PostgreSQL", async () => {
    const res = await readService.listOpportunities({ limit: 10 });
    assert.ok(res);
    assert.ok(Array.isArray(res.items));
    assert.ok(res.totalCount >= 1, "Must contain at least 1 real persisted opportunity from Pilot execution");

    const sample = res.items[0];
    assert.ok(sample.opportunityId);
    assert.ok(sample.title);
    assert.ok(sample.opportunityScore !== undefined);
    assert.ok(sample.evidenceConfidence !== undefined);
    assert.ok(sample.primaryEvidenceClassification);
    assert.ok(sample.freshness);
    assert.equal(typeof sample.isConfidential, "boolean");

    console.log("Successfully retrieved real Pilot opportunity summary from PostgreSQL:", sample.title);
  });

  it("2. Retrieves full OpportunityDetailViewModel by ID with preserved evidence and audit boundaries", async () => {
    const listRes = await readService.listOpportunities({ limit: 1 });
    const sampleId = listRes.items[0].opportunityId;

    const detail = await readService.getOpportunityDetail(sampleId);
    assert.ok(detail);
    assert.equal(detail.opportunityId, sampleId);
    assert.ok(detail.title);
    assert.ok(detail.summary);
    assert.ok(detail.scoreDimensions);
    assert.ok(Array.isArray(detail.evidenceLedger));
    assert.ok(Array.isArray(detail.risks));
    assert.ok(detail.provenance);

    console.log("Successfully retrieved real Opportunity detail with evidence ledger from PostgreSQL!");
  });
});
