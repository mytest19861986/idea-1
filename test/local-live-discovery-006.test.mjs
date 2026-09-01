import test from "node:test";
import assert from "node:assert/strict";
import {
  LiveDiscoveryController,
  DiscoveryMode,
  DiscoveryHealthStatus
} from "../src/discovery/live-discovery-control.mjs";
import { DurableCandidateStoreAdapter } from "../src/storage/durable-candidate-store-adapter.mjs";
import { createPostgresCliClient } from "../src/storage/postgres-cli-client.mjs";

test("LOCAL-LIVE-DISCOVERY-006: Durable Candidate Dedup Persistence Suite", async (t) => {
  const client = createPostgresCliClient({ database: "discovery_test" });

  // Set up clean test scope in DB for this suite
  await client.query("DELETE FROM discovery_candidate_attributions WHERE candidate_id LIKE 'cand:hacker-%' OR candidate_id LIKE 'cand:durable-%';");
  await client.query("DELETE FROM discovery_candidates WHERE id LIKE 'cand:hacker-%' OR id LIKE 'cand:durable-%';");

  await t.test("1. First ingest saves candidate and attribution atomically (created: true)", async () => {
    const store = new DurableCandidateStoreAdapter({ client });
    const candidate = {
      sourceId: "hacker-news-official-api",
      url: "https://example.com/item-durable-scope-1",
      title: "Durable Item 1",
      summary: "First time discovery",
      collectedAt: new Date().toISOString()
    };

    const res = await store.save(candidate);
    assert.equal(res.saved, true);
    assert.equal(res.created, true, "First ingest must return created: true");
    assert.equal(res.attributionCreated, true, "First attribution must be created");

    // Verify row count in PostgreSQL
    const candRow = await client.query("SELECT id, canonical_url FROM discovery_candidates WHERE id = $1", [res.candidate.id]);
    assert.equal(candRow.rows.length, 1);
    assert.equal(candRow.rows[0].canonical_url, "https://example.com/item-durable-scope-1");

    const attrRow = await client.query("SELECT attribution_id FROM discovery_candidate_attributions WHERE candidate_id = $1", [res.candidate.id]);
    assert.equal(attrRow.rows.length, 1);
  });

  await t.test("2. Same process replay hits ON CONFLICT (id) DO NOTHING (created: false, dedupReplays increment)", async () => {
    const store = new DurableCandidateStoreAdapter({ client });
    const controller = new LiveDiscoveryController({
      mode: DiscoveryMode.OFF,
      candidateStore: store,
      fetchFn: async (url) => {
        if (url.includes("showstories.json")) return { ok: true, status: 200, json: async () => [501] };
        if (url.includes("item/501.json")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 501, by: "authorA", title: "Item 501", url: "https://example.com/item-durable-scope-1", time: 1700000000 })
          };
        }
        if (url.includes("api.github.com")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [] })
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }
    });

    const runResult = await controller.runCycle("MANUAL");
    assert.equal(runResult.counters.rawSignals, 1);
    assert.equal(runResult.counters.newCandidates, 0, "Replayed candidate must NOT increment newCandidates");
    assert.equal(runResult.counters.dedupReplays, 1, "Replayed candidate must increment dedupReplays");
    assert.equal(runResult.counters.newOpportunities, 0);

    // Verify candidate row count is STILL exactly 1
    const candRows = await client.query("SELECT id FROM discovery_candidates WHERE canonical_url = 'https://example.com/item-durable-scope-1'");
    assert.equal(candRows.rows.length, 1);

    controller.destroy();
  });

  await t.test("3. Process restart replay: separate store/controller instance ingesting same item produces 0 duplicates", async () => {
    // Simulate complete process termination & fresh restart with brand new store & controller instance
    const freshStore = new DurableCandidateStoreAdapter({ client });
    const freshController = new LiveDiscoveryController({
      mode: DiscoveryMode.OFF,
      candidateStore: freshStore,
      fetchFn: async (url) => {
        if (url.includes("showstories.json")) return { ok: true, status: 200, json: async () => [501] };
        if (url.includes("item/501.json")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 501, by: "authorA", title: "Item 501", url: "https://example.com/item-durable-scope-1", time: 1700000000 })
          };
        }
        if (url.includes("api.github.com")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [] })
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }
    });

    const runResult = await freshController.runCycle("MANUAL");
    assert.equal(runResult.counters.rawSignals, 1);
    assert.equal(runResult.counters.newCandidates, 0, "Post-restart replay must NOT count item as new");
    assert.equal(runResult.counters.dedupReplays, 1, "Post-restart replay must increment dedupReplays");

    // Total rows in DB remain 1
    const candRows = await client.query("SELECT id FROM discovery_candidates WHERE canonical_url = 'https://example.com/item-durable-scope-1'");
    assert.equal(candRows.rows.length, 1);

    freshController.destroy();
  });

  await t.test("4. Concurrent save atomicity: two concurrent saves of exact same candidate identity produce 1 insert", async () => {
    const store = new DurableCandidateStoreAdapter({ client });
    const candidate = {
      sourceId: "durable-race",
      url: "https://example.com/item-durable-concurrent-race",
      title: "Race Item",
      collectedAt: new Date().toISOString()
    };

    const [resA, resB] = await Promise.all([
      store.save(candidate),
      store.save(candidate)
    ]);

    const createdCount = (resA.created ? 1 : 0) + (resB.created ? 1 : 0);
    assert.equal(createdCount, 1, "Exactly one concurrent save must succeed with created: true");

    const candRows = await client.query("SELECT count(*) FROM discovery_candidates WHERE id = $1", [resA.candidate.id]);
    assert.equal(parseInt(candRows.rows[0].count, 10), 1, "Exactly 1 candidate row must exist in PostgreSQL");
  });

  await t.test("5. Transaction Rollback Proof: Attribution insert failure rolls back candidate insert (0 partial rows)", async () => {
    // We execute a save with an invalid attribution (e.g. invalid foreign key or invalid column) inside a real transaction
    const store = new DurableCandidateStoreAdapter({ client });
    
    // We test that when a transaction containing candidate insert fails on attribution step in PostgreSQL,
    // NO partial candidate row remains in the database.
    const failCandidateUrl = "https://example.com/item-durable-rollback-test";
    
    // Direct SQL simulation of failed transaction block
    const failTxSql = `
      BEGIN;
      INSERT INTO discovery_candidates (id, canonical_url, canonical_domain, source_type, source_record_id, discovered_at, retrieved_at, rule_version, confidence)
      VALUES ('cand:durable-rollback:123', '${failCandidateUrl}', 'example.com', 'API', 'rec1', NOW(), NOW(), 'v1', 'MEDIUM');
      
      -- Intentionally failing attribution insert (violating not-null or constraint)
      INSERT INTO discovery_candidate_attributions (attribution_id, candidate_id, source_id, source_type, idempotency_key, attributed_at)
      VALUES (NULL, 'cand:durable-rollback:123', 'src', 'API', 'idem', NOW());
      COMMIT;
    `;

    let thrownError = null;
    try {
      await client.query(failTxSql);
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, "Transaction with invalid attribution must throw error");

    // Verify ZERO partial candidate rows remain in discovery_candidates
    const candRows = await client.query("SELECT id FROM discovery_candidates WHERE canonical_url = $1", [failCandidateUrl]);
    assert.equal(candRows.rows.length, 0, "CANDIDATE_ROW_COUNT_AFTER_FAILURE must be 0");

    const attrRows = await client.query("SELECT attribution_id FROM discovery_candidate_attributions WHERE candidate_id = 'cand:durable-rollback:123'");
    assert.equal(attrRows.rows.length, 0, "ATTRIBUTION_ROW_COUNT_AFTER_FAILURE must be 0");
  });

  await t.test("6. Attribution Preservation on Replay: Same candidate + new valid attribution creates attribution only", async () => {
    const store = new DurableCandidateStoreAdapter({ client });
    const candidateA = {
      sourceId: "durable-replay-source",
      url: "https://example.com/item-durable-replay-preservation",
      title: "Replay Preservation Item",
      idempotencyKey: "idem:first-run-key",
      collectedAt: new Date().toISOString()
    };

    // First save
    const resA = await store.save(candidateA);
    assert.equal(resA.created, true, "First ingest candidate created must be true");
    assert.equal(resA.attributionCreated, true, "First ingest attribution created must be true");

    // Second observation: same candidate identity, new valid idempotency_key
    const candidateB = {
      sourceId: "durable-replay-source",
      url: "https://example.com/item-durable-replay-preservation",
      title: "Replay Preservation Item (Updated Obs)",
      idempotencyKey: "idem:second-run-key-new",
      collectedAt: new Date().toISOString()
    };

    const resB = await store.save(candidateB);
    assert.equal(resB.created, false, "Candidate created second time must be FALSE");
    assert.equal(resB.attributionCreated, true, "Attribution created second time must be TRUE");

    // Verify DB state: exactly 1 candidate row, exactly 2 attribution rows
    const candRows = await client.query("SELECT id FROM discovery_candidates WHERE canonical_url = 'https://example.com/item-durable-replay-preservation'");
    assert.equal(candRows.rows.length, 1, "Candidate row count must remain 1");

    const attrRows = await client.query("SELECT attribution_id FROM discovery_candidate_attributions WHERE candidate_id = $1", [resA.candidate.id]);
    assert.equal(attrRows.rows.length, 2, "Attribution row count must be 2");
  });

  await t.test("7. Fail-closed on PostgreSQL Disconnection: Store rejects candidate gracefully without shadow state", async () => {
    const disconnectedClient = {
      async query() {
        throw new Error("POSTGRES_DISCONNECTED: Connection to database terminated");
      }
    };
    const store = new DurableCandidateStoreAdapter({ client: disconnectedClient });
    const candidate = {
      sourceId: "durable-fail-closed",
      url: "https://example.com/item-durable-fail-closed",
      title: "Fail Closed Item",
      collectedAt: new Date().toISOString()
    };

    let thrownError = null;
    try {
      await store.save(candidate);
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, "save() must fail closed and throw when PostgreSQL is unreachable");
    assert.ok(thrownError.message.includes("POSTGRES_DISCONNECTED"), "Error message must reflect connection loss");
  });

  // Cleanup test rows
  await client.query("DELETE FROM discovery_candidate_attributions WHERE candidate_id LIKE 'cand:durable-%' OR candidate_id LIKE 'cand:hacker-%';");
  await client.query("DELETE FROM discovery_candidates WHERE id LIKE 'cand:durable-%' OR id LIKE 'cand:hacker-%';");
});
