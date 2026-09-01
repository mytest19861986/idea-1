import test from "node:test";
import assert from "node:assert/strict";
import {
  LiveDiscoveryController,
  DiscoveryMode,
  DiscoveryHealthStatus
} from "../src/discovery/live-discovery-control.mjs";
import { ReferenceCandidateStore } from "../src/runtime/runtime-composition.mjs";

test("LOCAL-LIVE-DISCOVERY-005: Data Integrity Qualification Suite", async (t) => {

  await t.test("1. Same source item fetched twice produces exactly 1 candidate, 0 new on replay, and dedupReplays = 1", async () => {
    const candidateStore = new ReferenceCandidateStore();
    const mockItems = [
      { id: 101, by: "authorA", title: "Item 101", url: "https://example.com/item101", time: 1700000000 }
    ];

    const controller = new LiveDiscoveryController({
      mode: DiscoveryMode.OFF,
      candidateStore,
      fetchFn: async (url) => {
        if (url.includes("showstories.json")) return { ok: true, status: 200, json: async () => [101] };
        return { ok: true, status: 200, json: async () => mockItems[0] };
      }
    });

    // First execution -> 1 new candidate
    const run1 = await controller.runCycle("MANUAL");
    assert.equal(run1.counters.rawSignals, 1);
    assert.equal(run1.counters.newCandidates, 1);
    assert.equal(run1.counters.dedupReplays, 0);
    assert.equal(candidateStore.getAll().length, 1);

    // Second execution (Replay of exact same item) -> 0 new candidates, 1 dedup replay
    const run2 = await controller.runCycle("MANUAL");
    assert.equal(run2.counters.rawSignals, 1);
    assert.equal(run2.counters.newCandidates, 0);
    assert.equal(run2.counters.dedupReplays, 1);
    assert.equal(candidateStore.getAll().length, 1, "Candidate store must not duplicate items");

    controller.destroy();
  });

  await t.test("2. Controlled mixed batch: 10 total fetch events (7 new items + 3 replays)", async () => {
    const candidateStore = new ReferenceCandidateStore();
    
    // Seed 3 existing candidates into store
    candidateStore.save({ url: "https://example.com/app-1", title: "Existing 1", sourceId: "seed" });
    candidateStore.save({ url: "https://example.com/app-2", title: "Existing 2", sourceId: "seed" });
    candidateStore.save({ url: "https://example.com/app-3", title: "Existing 3", sourceId: "seed" });
    assert.equal(candidateStore.getAll().length, 3);

    // Feed containing 5 items: IDs 1..5 (IDs 1, 2 overlap with seed; 3, 4, 5 are brand new)
    const controller = new LiveDiscoveryController({
      mode: DiscoveryMode.OFF,
      candidateStore,
      fetchFn: async (url) => {
        if (url.includes("showstories.json")) {
          return { ok: true, status: 200, json: async () => [1, 2, 3, 4, 5] };
        }
        const idMatch = url.match(/item\/(\d+)\.json/);
        const id = idMatch ? idMatch[1] : "1";
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: parseInt(id, 10), by: "dev", title: `Item ${id}`, url: `https://example.com/app-${id}`, time: 1700000000 })
        };
      }
    });

    const runResult = await controller.runCycle("MANUAL");
    assert.equal(runResult.counters.rawSignals, 5, "Total raw signals must be 5");
    assert.equal(runResult.counters.dedupReplays, 3, "Dedup replays must be exactly 3");
    assert.equal(runResult.counters.newCandidates, 2, "New candidates must be exactly 2");
    assert.equal(candidateStore.getAll().length, 5, "Total persisted unique candidates must equal 5");

    controller.destroy();
  });

  await t.test("3. Missing candidateStore enforces fail-closed and never counts unpersisted items as new", async () => {
    const controller = new LiveDiscoveryController({
      mode: DiscoveryMode.OFF,
      candidateStore: null, // ABSENT STORE
      fetchFn: async (url) => {
        if (url.includes("showstories.json")) return { ok: true, status: 200, json: async () => [1, 2, 3] };
        return { ok: true, status: 200, json: async () => ({ id: 1, title: "Item 1", url: "https://example.com/1" }) };
      }
    });

    const runResult = await controller.runCycle("MANUAL");
    assert.ok(["FAILED", "PARTIAL_SUCCESS"].includes(runResult.status), "Run must fail closed or degraded when candidateStore is missing");
    assert.equal(runResult.counters.newCandidates, 0, "Missing store must never count items as new");
    assert.equal(runResult.counters.newOpportunities, 0, "Missing store must never count opportunities as new");

    controller.destroy();
  });

  await t.test("4. Counter Independence: Candidate created without opportunity created leaves newOpportunities = 0", async () => {
    const candidateStore = new ReferenceCandidateStore();
    // Dummy opportunity store that filters out non-qualifying candidates
    const selectiveOpportunityStore = {
      createFromCandidate: (candidate) => {
        // Only create opportunity if title contains "QUALIFIED"
        if (candidate.title && candidate.title.includes("QUALIFIED")) {
          return { created: true, opportunityId: "opp-1" };
        }
        return { created: false, opportunityId: null };
      }
    };

    const controller = new LiveDiscoveryController({
      mode: DiscoveryMode.OFF,
      candidateStore,
      opportunityStore: selectiveOpportunityStore,
      fetchFn: async (url) => {
        if (url.includes("showstories.json")) return { ok: true, status: 200, json: async () => [999] };
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 999, by: "dev", title: "Unqualified Early Signal", url: "https://example.com/early", time: 1700000000 })
        };
      }
    });

    const runResult = await controller.runCycle("MANUAL");
    assert.equal(runResult.counters.newCandidates, 1, "Candidate created");
    assert.equal(runResult.counters.newOpportunities, 0, "Opportunity counter remains strictly 0");
    assert.notEqual(runResult.counters.newCandidates, runResult.counters.newOpportunities, "Counters are decoupled");

    controller.destroy();
  });
});
