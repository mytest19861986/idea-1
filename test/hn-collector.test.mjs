import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE_ID,
  COLLECTOR_ID,
  OFFICIAL_ALLOWED_HOST,
  collectorIdentity,
  buildHnItemCanonicalUrl,
  validateEndpointUrl,
  normalizeHnItem,
  createHnCollector
} from "../src/collection/hn-collector.mjs";

test("HN-COLLECTOR: Identity and Constants validate against contract", () => {
  assert.equal(SOURCE_ID, "hacker-news-official-api");
  assert.equal(COLLECTOR_ID, "hn-firebase-collector");
  assert.equal(collectorIdentity.sourceId, "hacker-news-official-api");
  assert.equal(collectorIdentity.collectorId, "hn-firebase-collector");
  assert.equal(OFFICIAL_ALLOWED_HOST, "hacker-news.firebaseio.com");
});

test("HN-COLLECTOR: validateEndpointUrl enforces HTTPS and official host allowlist", () => {
  assert.equal(validateEndpointUrl("https://hacker-news.firebaseio.com/v0"), "https://hacker-news.firebaseio.com/v0");
  assert.throws(() => validateEndpointUrl("http://hacker-news.firebaseio.com/v0"), /Only HTTPS is permitted/);
  assert.throws(() => validateEndpointUrl("https://hn.algolia.com/api"), /Only official host/);
  assert.throws(() => validateEndpointUrl("https://news.ycombinator.com"), /Only official host/);
});

test("HN-COLLECTOR: buildHnItemCanonicalUrl produces valid deterministic URLs", () => {
  assert.equal(buildHnItemCanonicalUrl(12345), "https://news.ycombinator.com/item?id=12345");
  assert.throws(() => buildHnItemCanonicalUrl(null), /must be a valid integer/);
  assert.throws(() => buildHnItemCanonicalUrl("invalid"), /must be a valid integer/);
});

test("HN-COLLECTOR: normalizeHnItem enforces SOURCE_CLAIM and DERIVED_METRIC taxonomies", () => {
  const rawStory = {
    id: 998877,
    type: "story",
    by: "pg_founder",
    time: 1700000000,
    title: "Show HN: Fast Vector DB in Zig",
    url: "https://github.com/example/fast-vector",
    score: 150,
    descendants: 42,
    kids: [1, 2, 3, 4, 5]
  };

  const doc = normalizeHnItem(rawStory, {
    retrievedAt: "2026-08-30T12:00:00.000Z",
    discoveredAt: "2026-08-30T12:00:00.000Z"
  });

  assert.ok(doc);
  assert.equal(doc.sourceId, "hacker-news-official-api");
  assert.equal(doc.canonicalUrl, "https://news.ycombinator.com/item?id=998877");
  assert.equal(doc.title, "Show HN: Fast Vector DB in Zig");
  assert.equal(doc.contentReference, "https://github.com/example/fast-vector");
  assert.equal(doc.author, "pg_founder");

  // Invariant HN-G005: claims preserved as SOURCE_CLAIM
  assert.equal(doc.metadata.claims.claim_type, "SOURCE_CLAIM");
  assert.equal(doc.metadata.claims.score, 150);
  assert.equal(doc.metadata.claims.descendants, 42);

  // Invariant HN-G005: derived metrics tagged
  assert.equal(doc.metadata.derivedMetrics.classification, "DERIVED_METRIC");
  assert.ok(doc.metadata.derivedMetrics.ageHours > 0);
  assert.ok(doc.metadata.derivedMetrics.pointsPerHour >= 0);
  assert.ok(doc.metadata.derivedMetrics.engagementVelocity >= 0);

  // Invariant HN-G006: public username isolated
  assert.equal(doc.metadata.authorUsername, "pg_founder");
  assert.equal(doc.metadata.externalId, "hn:998877");
});

test("HN-COLLECTOR: normalizeHnItem safely skips dead and deleted records", () => {
  const deletedItem = { id: 101, deleted: true, type: "story" };
  const deadItem = { id: 102, dead: true, type: "story" };

  assert.equal(normalizeHnItem(deletedItem), null);
  assert.equal(normalizeHnItem(deadItem), null);
});

test("HN-COLLECTOR: Deterministic mock collector executes bounded feed ingestion", async () => {
  const mockDb = {
    "https://hacker-news.firebaseio.com/v0/showstories.json": [1001, 1002, 1003],
    "https://hacker-news.firebaseio.com/v0/item/1001.json": {
      id: 1001,
      type: "story",
      title: "Show HN: Autonomous Agent Terminal",
      url: "https://agent-terminal.dev",
      by: "dev_lead",
      score: 85,
      descendants: 20,
      time: 1725000000
    },
    "https://hacker-news.firebaseio.com/v0/item/1002.json": {
      id: 1002,
      deleted: true
    },
    "https://hacker-news.firebaseio.com/v0/item/1003.json": {
      id: 1003,
      type: "story",
      title: "Show HN: Rust WASM Parser",
      url: "https://wasm-parser.rs",
      by: "wasm_guru",
      score: 120,
      descendants: 15,
      time: 1725000100
    }
  };

  const mockFetch = async (url) => {
    const data = mockDb[url];
    if (!data) return { ok: false, status: 404 };
    return {
      ok: true,
      status: 200,
      json: async () => data
    };
  };

  const logs = [];
  const collector = createHnCollector({
    fetchFn: mockFetch,
    maxItems: 5,
    logger: { log: (evt) => logs.push(evt) }
  });

  const result = await collector.fetchFeed({ feedType: "showstories", limit: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.yieldCount, 2); // 1 skipped (deleted)
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].title, "Show HN: Autonomous Agent Terminal");
  assert.equal(result.documents[1].title, "Show HN: Rust WASM Parser");

  // Verify telemetry events generated
  assert.ok(logs.some((l) => l.event === "hn_collector_feed_fetch_started"));
  assert.ok(logs.some((l) => l.event === "hn_collector_item_normalized"));
  assert.ok(logs.some((l) => l.event === "hn_collector_item_skipped"));
  assert.ok(logs.some((l) => l.event === "hn_collector_feed_fetch_completed"));
});

test("HN-COLLECTOR: Handles 4xx errors as FINAL and 5xx errors with bounded retry", async () => {
  let attempts500 = 0;
  const mockFetch500 = async () => {
    attempts500++;
    return { ok: false, status: 503, json: async () => ({}) };
  };

  const collector500 = createHnCollector({
    fetchFn: mockFetch500,
    maxRetries: 2
  });

  const res500 = await collector500.fetchFeed({ feedType: "topstories" });
  assert.equal(res500.ok, false);
  assert.equal(res500.failure.kind, "RETRYABLE");
  assert.equal(attempts500, 3); // Initial + 2 retries

  let attempts400 = 0;
  const mockFetch400 = async () => {
    attempts400++;
    return { ok: false, status: 403, json: async () => ({}) };
  };

  const collector400 = createHnCollector({
    fetchFn: mockFetch400,
    maxRetries: 2
  });

  const res400 = await collector400.fetchFeed({ feedType: "topstories" });
  assert.equal(res400.ok, false);
  assert.equal(res400.failure.kind, "FINAL");
  assert.equal(attempts400, 1); // 4xx fails closed immediately without retry
});
