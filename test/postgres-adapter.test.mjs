import { test } from "node:test";
import assert from "node:assert/strict";
import { PostgresDiscoveryPersistenceAdapter } from "../src/storage/postgres-adapter.mjs";

test("POSTGRES_ADAPTER: parameterized SQL query generation for discovery candidate and attribution", async () => {
  const adapter = new PostgresDiscoveryPersistenceAdapter(null);
  const candidate = {
    id: "cand-pg-1",
    canonicalUrl: "https://pg.example.com",
    canonicalDomain: "pg.example.com",
    title: "Postgres App",
    sourceType: "listing",
    sourceRecordId: "rec-1",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    ruleVersion: "rule-v1",
    confidence: "HIGH"
  };
  const attribution = {
    sourceId: "src-pg-1",
    sourceType: "listing",
    idempotencyKey: "idem-pg-1",
    collectorVersion: "col-v1",
    attributedAt: "2026-08-30T00:01:00Z"
  };

  const res = await adapter.saveCandidate(candidate, attribution);
  assert.ok(res.candidateSql.includes("INSERT INTO discovery_candidates"));
  assert.strictEqual(res.candidateParams[0], "cand-pg-1");
  assert.ok(res.attributionSql.includes("INSERT INTO discovery_candidate_attributions"));
  assert.strictEqual(res.attributionParams[1], "cand-pg-1");
});

test("POSTGRES_ADAPTER: fails closed when no live client provided for query execution", async () => {
  const adapter = new PostgresDiscoveryPersistenceAdapter(null);
  await assert.rejects(
    async () => adapter.query("SELECT 1"),
    /POSTGRES_RUNTIME_UNAVAILABLE/
  );
});

test("POSTGRES_ADAPTER: generates parameterized observation insert with ON CONFLICT DO NOTHING", async () => {
  const adapter = new PostgresDiscoveryPersistenceAdapter(null);
  const obs = {
    observationId: "obs:1",
    executionId: "exec:1",
    sourceId: "src:1",
    success: true,
    statusCode: 200,
    yieldCount: 5,
    duplicateCount: 1,
    uniqueCount: 4,
    occurredAt: "2026-08-30T00:00:00Z"
  };
  const res = await adapter.saveObservation(obs);
  assert.ok(res.sql.includes("INSERT INTO source_observations"));
  assert.ok(res.sql.includes("ON CONFLICT (observation_id) DO NOTHING"));
  assert.strictEqual(res.params[0], "obs:1");
});
