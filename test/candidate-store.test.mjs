import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDiscoveryCandidateStore } from "../src/discovery/candidate-store.mjs";

test("InMemoryDiscoveryCandidateStore enforces mandatory ISO timestamp 'at'", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const candidate = {
    schemaVersion: 1,
    discoveryId: "disc:src1:https://example.com/item/1",
    idempotencyKey: "src1:https://example.com/item/1",
    sourceId: "src1",
    canonicalUrl: "https://example.com/item/1",
    title: "Item 1",
    is_confidential: false
  };

  assert.throws(() => store.putCandidate(candidate), /at must be a non-empty string/);
  assert.throws(() => store.putCandidate(candidate, { at: "not-a-timestamp" }), /at must be a valid ISO 8601 timestamp/);
});

test("STORE-I001: Same candidate exact replay is idempotent", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const candidate = {
    schemaVersion: 1,
    discoveryId: "disc:src1:https://example.com/item/1",
    idempotencyKey: "src1:https://example.com/item/1",
    sourceId: "src1",
    canonicalUrl: "https://example.com/item/1",
    title: "Item 1",
    is_confidential: false,
    contentReference: "https://item1.example.com"
  };

  const res1 = store.putCandidate(candidate, { at: "2026-08-30T01:00:00Z" });
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(res1.status, "STORED");

  const res2 = store.putCandidate(candidate, { at: "2026-08-30T01:05:00Z" });
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.status, "REPLAYED");
  assert.deepStrictEqual(res1.record, res2.record, "Replayed candidate must match original stored candidate");
});

test("STORE-I002: Same idempotency key with conflicting payload is rejected", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const candidate1 = {
    schemaVersion: 1,
    discoveryId: "disc:src1:https://example.com/item/1",
    idempotencyKey: "key-123",
    sourceId: "src1",
    canonicalUrl: "https://example.com/item/1",
    title: "Original Title",
    is_confidential: false
  };

  const candidate2 = {
    schemaVersion: 1,
    discoveryId: "disc:src1:https://example.com/item/1",
    idempotencyKey: "key-123",
    sourceId: "src1",
    canonicalUrl: "https://example.com/item/1",
    title: "Conflicting Material Title",
    is_confidential: false
  };

  store.putCandidate(candidate1, { at: "2026-08-30T01:00:00Z" });
  const resConflict = store.putCandidate(candidate2, { at: "2026-08-30T01:05:00Z" });

  assert.strictEqual(resConflict.ok, false);
  assert.strictEqual(resConflict.status, "CONFLICT_REJECTED");
  assert.match(resConflict.reason, /Material payload conflict/);
});

test("STORE-I003: Idempotency key collision across different discovery IDs is rejected", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const candidate1 = {
    schemaVersion: 1,
    discoveryId: "disc:src1:https://example.com/item/1",
    idempotencyKey: "shared-key",
    sourceId: "src1",
    canonicalUrl: "https://example.com/item/1",
    title: "Item 1",
    is_confidential: false
  };

  const candidate2 = {
    schemaVersion: 1,
    discoveryId: "disc:src2:https://example.com/item/2",
    idempotencyKey: "shared-key", // Collision
    sourceId: "src2",
    canonicalUrl: "https://example.com/item/2",
    title: "Item 2",
    is_confidential: false
  };

  store.putCandidate(candidate1, { at: "2026-08-30T01:00:00Z" });
  const resCol = store.putCandidate(candidate2, { at: "2026-08-30T01:05:00Z" });

  assert.strictEqual(resCol.ok, false);
  assert.strictEqual(resCol.status, "IDEMPOTENCY_COLLISION");
});

test("STORE-I004 & STORE-I007: Append-only multi-source attribution preserves provenance", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const candidate = {
    schemaVersion: 1,
    discoveryId: "disc:src-primary:https://example.com/app",
    idempotencyKey: "app-idemp",
    sourceId: "src-primary",
    canonicalUrl: "https://example.com/app",
    title: "Cross-Marketplace App",
    is_confidential: false,
    provenance: {
      collectorId: "col-primary",
      collectorVersion: "1.2.0",
      discoveredAt: "2026-08-30T00:00:00Z",
      retrievedAt: "2026-08-30T00:05:00Z",
      intakeProcessedAt: "2026-08-30T01:00:00Z"
    }
  };

  store.putCandidate(candidate, { at: "2026-08-30T01:00:00Z" });

  // Append Secondary Source Attribution
  const attrSecondary = {
    sourceId: "src-secondary",
    canonicalUrl: "https://marketplace2.com/app",
    collectorId: "col-secondary",
    collectorVersion: "2.0.0",
    discoveredAt: "2026-08-30T01:10:00Z",
    retrievedAt: "2026-08-30T01:12:00Z",
    is_confidential: false
  };

  const resAttr = store.appendAttribution(candidate.discoveryId, attrSecondary, { at: "2026-08-30T01:15:00Z" });
  assert.strictEqual(resAttr.ok, true);
  assert.strictEqual(resAttr.status, "ATTRIBUTION_APPENDED");

  // Replay identical attribution
  const resAttrReplay = store.appendAttribution(candidate.discoveryId, attrSecondary, { at: "2026-08-30T01:20:00Z" });
  assert.strictEqual(resAttrReplay.ok, true);
  assert.strictEqual(resAttrReplay.status, "ATTRIBUTION_REPLAYED");

  const history = store.getAttributionHistory(candidate.discoveryId);
  assert.strictEqual(history.length, 2, "Must contain exactly primary and secondary attributions");
  assert.strictEqual(history[0].sourceId, "src-primary");
  assert.strictEqual(history[1].sourceId, "src-secondary");
});

test("STORE-I006: Confidentiality round-trip preserves isolation and rejects public downgrades", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const confidentialCandidate = {
    schemaVersion: 1,
    discoveryId: "disc:src1:https://example.com/stealth",
    idempotencyKey: "stealth-key",
    sourceId: "src1",
    canonicalUrl: "https://example.com/stealth",
    title: "Stealth Entity",
    is_confidential: true,
    contentReference: null
  };

  store.putCandidate(confidentialCandidate, { at: "2026-08-30T01:00:00Z" });

  const fetched = store.getCandidateById(confidentialCandidate.discoveryId);
  assert.strictEqual(fetched.is_confidential, true);
  assert.strictEqual(fetched.contentReference, null);

  // Attempt to overwrite with public representation
  const publicAttempt = {
    ...confidentialCandidate,
    is_confidential: false,
    contentReference: "https://unmasked.com"
  };

  const resPublic = store.putCandidate(publicAttempt, { at: "2026-08-30T01:05:00Z" });
  assert.strictEqual(resPublic.ok, false);
  assert.strictEqual(resPublic.status, "CONFLICT_REJECTED");
});

test("Lookup APIs (getCandidateById, getCandidateBySourceIdentity, findByIdempotencyKey) work accurately", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const candidate = {
    schemaVersion: 1,
    discoveryId: "disc:src-alpha:https://alpha.com/listing/50",
    idempotencyKey: "key-alpha-50",
    sourceId: "src-alpha",
    canonicalUrl: "https://alpha.com/listing/50",
    title: "Alpha Listing",
    is_confidential: false
  };

  store.putCandidate(candidate, { at: "2026-08-30T01:00:00Z" });

  assert.strictEqual(store.getCandidateById(candidate.discoveryId).title, "Alpha Listing");
  assert.strictEqual(store.getCandidateBySourceIdentity("src-alpha", "https://alpha.com/listing/50").title, "Alpha Listing");
  assert.strictEqual(store.findByIdempotencyKey("key-alpha-50").title, "Alpha Listing");

  assert.strictEqual(store.getCandidateById("non-existent"), null);
  assert.strictEqual(store.findByIdempotencyKey("non-existent"), null);
});
