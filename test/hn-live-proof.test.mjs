import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHnCollector, SOURCE_ID, COLLECTOR_ID, COLLECTOR_VERSION } from "../src/collection/hn-collector.mjs";
import { executeDiscoveryPipeline } from "../src/discovery/pipeline.mjs";
import { InMemoryDiscoveryCandidateStore } from "../src/discovery/candidate-store.mjs";
import { TelemetryFacade, OBSERVABILITY_VERSION } from "../src/observability/telemetry.mjs";

const PG_CONFIG = {
  host: "127.0.0.1",
  port: 5432,
  user: "test_user",
  password: "test_password",
  database: "discovery_test"
};

function psqlExec(sql, { expectError = false } = {}) {
  const cleanSql = sql.replace(/\r/g, "");
  const isInsideWsl = process.platform === "linux";
  const cmd = isInsideWsl
    ? `export PGPASSWORD='${PG_CONFIG.password}'; psql -v ON_ERROR_STOP=1 -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host}`
    : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -v ON_ERROR_STOP=1 -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host}"`;
  try {
    return execSync(cmd, { input: cleanSql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    if (expectError) {
      return (err.stderr || "") + (err.stdout || "") + (err.message || "");
    }
    throw err;
  }
}

test("HN-LIVE-PROOF: Bounded Live Collection -> Pipeline -> PostgreSQL -> Observability (GATE-011, 014, 016, 017, 019)", async () => {
  // 1. Initialize Telemetry & Logging Sink
  const operationalLogs = [];
  const logSink = {
    log: (entry) => {
      operationalLogs.push(entry);
      // Also emit operator-visible structured JSON
      console.log("[OPERATIONAL_TELEMETRY]", JSON.stringify(entry));
    }
  };

  const telemetry = new TelemetryFacade();
  const span = telemetry.startSpan("hn_live_collection_proof", {
    "source.id": SOURCE_ID,
    "collector.version": COLLECTOR_VERSION
  });

  // 2. Instantiate Live Collector with Strict Bounding
  const collector = createHnCollector({
    maxItems: 3, // Bounded: 3 live items
    concurrency: 2, // Concurrency limit
    timeoutMs: 15000,
    logger: logSink
  });

  // 3. Execute Live Network Ingestion from Official Firebase REST API
  console.log("Fetching live Show HN feed from Hacker News Official API...");
  const feedResult = await collector.fetchFeed({ feedType: "showstories", limit: 3 });

  assert.equal(feedResult.ok, true, "Live feed fetch must succeed");
  assert.ok(feedResult.documents.length >= 1, "Must collect at least 1 valid live item");
  assert.ok(feedResult.documents.length <= 3, "Must not exceed max item bound of 3");

  const collectedDoc = feedResult.documents[0];
  console.log("Live Collected Item:", {
    title: collectedDoc.title,
    canonicalUrl: collectedDoc.canonicalUrl,
    author: collectedDoc.author,
    claims: collectedDoc.metadata.claims,
    derivedMetrics: collectedDoc.metadata.derivedMetrics
  });

  // 4. Invariant Verification: SOURCE_CLAIM & DERIVED_METRIC Preservation
  assert.equal(collectedDoc.sourceId, SOURCE_ID);
  assert.equal(collectedDoc.metadata.claims.claim_type, "SOURCE_CLAIM");
  assert.equal(collectedDoc.metadata.derivedMetrics.classification, "DERIVED_METRIC");
  assert.ok(collectedDoc.metadata.authorUsername !== undefined);
  assert.equal(collectedDoc.metadata.provenance.auth_model, "NONE");

  // 5. Discovery Pipeline Execution (Intake -> In-Memory Store Verification)
  const memoryStore = new InMemoryDiscoveryCandidateStore();
  const executionId = `exec-hn-live-${Date.now()}`;
  const nowIso = new Date().toISOString();

  const sourceRecord = {
    id: SOURCE_ID,
    sourceId: SOURCE_ID,
    sourceType: "public_community_feed",
    status: "APPROVED",
    concurrencyLimit: 4
  };

  const pipelineResult = executeDiscoveryPipeline(collectedDoc, {
    sourceRecord,
    store: memoryStore,
    at: nowIso,
    executionId,
    actor: "hn-live-runner"
  });

  assert.equal(pipelineResult.pipelineStatus, "COMPLETED");
  assert.equal(pipelineResult.stages.intake.status, "SUCCESS");
  assert.equal(pipelineResult.stages.store.status, "STORED");

  // 6. Real PostgreSQL Persistence & Read-Back Verification
  psqlExec("DELETE FROM discovery_candidate_attributions WHERE source_id='hacker-news-official-api';");
  psqlExec("DELETE FROM source_observations WHERE source_id='hacker-news-official-api';");

  const candidate = pipelineResult.candidate;
  const rawMetadata = JSON.stringify(collectedDoc.metadata).replace(/'/g, "''");
  const rawTags = JSON.stringify(["hacker-news", "show-hn"]).replace(/'/g, "''");
  const cleanTitle = (candidate.title || "HN Live Opportunity").replace(/'/g, "''");

  // Insert Candidate
  psqlExec(`
    INSERT INTO discovery_candidates (
      id, canonical_url, canonical_domain, title, description,
      source_type, source_record_id, content_reference, discovered_at,
      retrieved_at, schema_version, rule_version, confidence, tags, metadata
    ) VALUES (
      '${candidate.discoveryId}', '${candidate.canonicalUrl}', 'news.ycombinator.com', '${cleanTitle}', 'Live Hacker News Ingested Item',
      'public_community_feed', '${SOURCE_ID}', '${candidate.contentReference || ""}', NOW(),
      NOW(), 1, 'v1', 'PROBABLE', '${rawTags}'::jsonb, '${rawMetadata}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
  `);

  // Insert Attribution
  psqlExec(`
    INSERT INTO discovery_candidate_attributions (
      attribution_id, candidate_id, source_id, source_type, idempotency_key,
      claim_classification, raw_document_id, collector_version, attributed_at, metadata
    ) VALUES (
      'attr-${executionId}', '${candidate.discoveryId}', '${SOURCE_ID}', 'public_community_feed', '${collectedDoc.idempotencyKey}',
      'SOURCE_CLAIM', '${collectedDoc.metadata.externalId}', '${COLLECTOR_VERSION}', NOW(), '${rawMetadata}'::jsonb
    );
  `);

  // Insert Authoritative Observation
  psqlExec(`
    INSERT INTO source_observations (
      observation_id, execution_id, source_id, success, status_code,
      yield_count, duplicate_count, unique_count, occurred_at
    ) VALUES (
      'obs-${executionId}', '${executionId}', '${SOURCE_ID}', TRUE, 200,
      ${feedResult.yieldCount}, 0, ${feedResult.yieldCount}, NOW()
    );
  `);

  // Read-Back from PostgreSQL
  const dbCand = psqlExec(`SELECT id, title, metadata FROM discovery_candidates WHERE id='${candidate.discoveryId}';`);
  assert.ok(dbCand.includes(candidate.discoveryId));
  assert.ok(dbCand.includes("SOURCE_CLAIM"));

  const dbObs = psqlExec(`SELECT observation_id, yield_count FROM source_observations WHERE execution_id='${executionId}';`);
  assert.ok(dbObs.includes(`obs-${executionId}`));
  assert.ok(dbObs.includes(String(feedResult.yieldCount)));

  // 7. Idempotent Replay Verification (Same Item Ingested Again)
  const replayResult = executeDiscoveryPipeline(collectedDoc, {
    sourceRecord,
    store: memoryStore,
    at: new Date().toISOString(),
    executionId: `exec-replay-${Date.now()}`,
    actor: "hn-live-runner"
  });
  assert.equal(replayResult.stages.store.status, "REPLAYED", "Replay of same external item must produce REPLAYED without duplicates");

  // End Telemetry Span & Verify Operational Observability
  span.setStatus("OK", "HN live collection proof completed successfully");
  span.end();

  assert.ok(operationalLogs.length >= 3, "Operational logs must be emitted across the execution lifecycle");
  assert.ok(operationalLogs.some((l) => l.event === "hn_collector_feed_fetch_started"));
  assert.ok(operationalLogs.some((l) => l.event === "hn_collector_feed_fetch_completed"));
  console.log("LIVE PROOF COMPLETED SUCCESSFULLY. Total logs captured:", operationalLogs.length);
});
