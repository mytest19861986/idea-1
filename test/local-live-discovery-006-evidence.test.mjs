import { test } from "node:test";
import assert from "node:assert/strict";
import { DurableCandidateStoreAdapter } from "../src/storage/durable-candidate-store-adapter.mjs";
import { createPostgresCliClient } from "../src/storage/postgres-cli-client.mjs";
import { LiveDiscoveryController, DiscoveryMode } from "../src/discovery/live-discovery-control.mjs";

test("LOCAL_LIVE_DISCOVERY_006: Comprehensive Evidence Closure Suite", async (t) => {
  const client = createPostgresCliClient({ database: "discovery_test" });

  await t.test("Section 2: Fail-Closed Evidence Detail", async () => {
    const disconnectedClient = {
      async query() {
        throw new Error("POSTGRES_UNAVAILABLE: Connection refused on 127.0.0.1:5432");
      }
    };
    const store = new DurableCandidateStoreAdapter({ client: disconnectedClient });
    const controller = new LiveDiscoveryController({
      mode: DiscoveryMode.OFF,
      candidateStore: store,
      fetchFn: async (url) => {
        if (url.includes("showstories.json")) return { ok: true, status: 200, json: async () => [9991] };
        if (url.includes("item/9991.json")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 9991, by: "authorA", title: "Item 9991", url: "https://example.com/fail-closed-item", time: 1700000000 })
          };
        }
        return { ok: true, status: 200, json: async () => ({ items: [] }) };
      }
    });

    let runError = null;
    let runResult = null;
    try {
      runResult = await controller.runCycle("MANUAL");
    } catch (err) {
      runError = err;
    }

    assert.ok(runError || (runResult && runResult.counters.newCandidates === 0));
    if (runResult) {
      assert.equal(runResult.counters.newCandidates, 0, "NEW_CANDIDATES must be 0 on PG disconnect");
      assert.equal(runResult.counters.newOpportunities, 0, "NEW_OPPORTUNITIES must be 0 on PG disconnect");
    }
    controller.destroy();
  });

  await t.test("Section 5: Cross-Source Provenance Invariant", async () => {
    const commonUrl = "https://example.com/cross-source-evidence-unique-item";
    await client.query("DELETE FROM discovery_candidate_attributions WHERE candidate_id LIKE 'cand:hacker-evidence-%' OR candidate_id LIKE 'cand:github-evidence-%';");
    await client.query("DELETE FROM discovery_candidates WHERE canonical_url = $1;", [commonUrl]);

    const store = new DurableCandidateStoreAdapter({ client });

    const candA = {
      sourceId: "hacker-evidence-src",
      url: commonUrl,
      title: "HN Item",
      collectedAt: new Date().toISOString()
    };
    const candB = {
      sourceId: "github-evidence-src",
      url: commonUrl,
      title: "GitHub Item",
      collectedAt: new Date().toISOString()
    };

    const resA = await store.save(candA);
    const resB = await store.save(candB);

    assert.equal(resA.created, true);
    assert.equal(resB.created, true);
    assert.notEqual(resA.candidate.id, resB.candidate.id, "Candidate IDs must differ for distinct sources");

    const rows = await client.query("SELECT id, canonical_url FROM discovery_candidates WHERE canonical_url = $1", [commonUrl]);
    assert.equal(rows.rows.length, 2, "Both cross-source candidates must exist distinctly in DB");
  });

  await t.test("Section 6: Identity Drift Edge Case", async () => {
    await client.query("DELETE FROM discovery_candidate_attributions WHERE candidate_id LIKE 'cand:drift-%';");
    await client.query("DELETE FROM discovery_candidates WHERE id LIKE 'cand:drift-%';");

    const store = new DurableCandidateStoreAdapter({ client });
    const sourceId = "drift-source";
    const sourceRecordId = "rec-drift-001";

    const firstCand = {
      sourceId,
      externalId: sourceRecordId,
      url: "https://example.com/drift-v1",
      title: "Drift V1",
      collectedAt: new Date().toISOString()
    };
    const secondCand = {
      sourceId,
      externalId: sourceRecordId,
      url: "https://example.com/drift-v2",
      title: "Drift V2",
      collectedAt: new Date().toISOString()
    };

    const res1 = await store.save(firstCand);
    const res2 = await store.save(secondCand);

    assert.equal(res1.created, true);
    assert.equal(res2.created, true, "Different URL yields new candidate ID (OPEN_LIMITATION)");
    assert.notEqual(res1.candidate.id, res2.candidate.id);
  });

  await t.test("Section 7: Opportunity Counter Independence", async () => {
    await client.query("DELETE FROM discovery_candidate_attributions WHERE candidate_id LIKE 'cand:opp-test-%';");
    await client.query("DELETE FROM discovery_candidates WHERE id LIKE 'cand:opp-test-%';");

    const store = new DurableCandidateStoreAdapter({ client });
    const controller = new LiveDiscoveryController({
      mode: DiscoveryMode.OFF,
      candidateStore: store,
      // No analysis pipeline -> opportunities accepted = 0
      pipeline: null,
      fetchFn: async (url) => {
        if (url.includes("showstories.json")) return { ok: true, status: 200, json: async () => [8881] };
        if (url.includes("item/8881.json")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 8881, by: "authorA", title: "Item 8881", url: "https://example.com/item-opp-test-1", time: 1700000000 })
          };
        }
        return { ok: true, status: 200, json: async () => ({ items: [] }) };
      }
    });

    const res = await controller.runCycle("MANUAL");
    assert.equal(res.counters.newCandidates, 1, "Candidate created increment must be 1");
    assert.equal(res.counters.newOpportunities, 0, "Opportunity increment must remain 0 when not accepted");

    controller.destroy();
  });
});
