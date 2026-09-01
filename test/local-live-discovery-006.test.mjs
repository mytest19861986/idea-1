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

  // Cleanup test rows
  await client.query("DELETE FROM discovery_candidate_attributions WHERE candidate_id LIKE 'cand:durable-%';");
  await client.query("DELETE FROM discovery_candidates WHERE id LIKE 'cand:durable-%';");
});
