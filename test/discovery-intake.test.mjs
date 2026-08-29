import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceStatus } from "../src/source-registry/lifecycle.mjs";
import {
  validateIsoTimestamp,
  validateRawDocument,
  isSourceEligibleForIntake,
  computeDeterministicDiscoveryId,
  sanitizeConfidentialRecursively,
  processDiscoveryIntake
} from "../src/discovery/discovery-intake.mjs";

test("validateIsoTimestamp strictly validates valid ISO UTC timestamps and rejects invalid strings", () => {
  assert.strictEqual(validateIsoTimestamp("2026-08-30T01:00:00.000Z", "test"), "2026-08-30T01:00:00.000Z");
  assert.strictEqual(validateIsoTimestamp("2026-08-30T01:00:00Z", "test"), "2026-08-30T01:00:00Z");

  assert.throws(() => validateIsoTimestamp("yesterday", "discoveredAt"), /must be a valid ISO 8601 timestamp string/);
  assert.throws(() => validateIsoTimestamp("2026-02-31T00:00:00Z", "discoveredAt"), /represents an impossible or invalid calendar date/);
  assert.throws(() => validateIsoTimestamp("", "discoveredAt"), /must be a non-empty string/);
  assert.throws(() => validateIsoTimestamp(null, "discoveredAt"), /must be a non-empty string/);
});

test("validateRawDocument enforces schema, HTTPS, valid timestamps, and idempotency key syntax", () => {
  assert.throws(() => validateRawDocument(null), /raw document is required/);
  assert.throws(() => validateRawDocument({ schemaVersion: 2 }), /unsupported schemaVersion/);
  assert.throws(() => validateRawDocument({ schemaVersion: 1, sourceId: "" }), /sourceId is required/);
  assert.throws(() => validateRawDocument({
    schemaVersion: 1,
    sourceId: "src1",
    sourceType: "marketplace",
    canonicalUrl: "http://insecure.com/p",
    title: "Test",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {}
  }), /canonicalUrl must use HTTPS/);

  assert.throws(() => validateRawDocument({
    schemaVersion: 1,
    sourceId: "src1",
    sourceType: "marketplace",
    canonicalUrl: "https://secure.com/p",
    title: "Test",
    discoveredAt: "not-a-date",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {}
  }), /discoveredAt must be a valid ISO 8601 timestamp string/);

  assert.throws(() => validateRawDocument({
    schemaVersion: 1,
    sourceId: "src1",
    sourceType: "marketplace",
    canonicalUrl: "https://secure.com/p",
    title: "Test",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    idempotencyKey: "",
    metadata: {}
  }), /idempotencyKey must be a non-empty string/);
});

test("isSourceEligibleForIntake gates lifecycle states strictly", () => {
  assert.strictEqual(isSourceEligibleForIntake(SourceStatus.APPROVED), true);
  assert.strictEqual(isSourceEligibleForIntake(SourceStatus.ACTIVE), true);

  assert.strictEqual(isSourceEligibleForIntake(SourceStatus.CANDIDATE), false);
  assert.strictEqual(isSourceEligibleForIntake(SourceStatus.DISCOVERED), false);
  assert.strictEqual(isSourceEligibleForIntake(SourceStatus.EVALUATING), false);
  assert.strictEqual(isSourceEligibleForIntake(SourceStatus.PAUSED), false);
  assert.strictEqual(isSourceEligibleForIntake(SourceStatus.DEGRADED), false);
  assert.strictEqual(isSourceEligibleForIntake(SourceStatus.REJECTED), false);
  assert.strictEqual(isSourceEligibleForIntake(SourceStatus.RETIRED), false);
});

test("computeDeterministicDiscoveryId is deterministic across invocations", () => {
  const id1 = computeDeterministicDiscoveryId("source-x", "https://example.com/items/42");
  const id2 = computeDeterministicDiscoveryId("source-x", "https://example.com/items/42");
  assert.strictEqual(id1, "disc:source-x:https://example.com/items/42");
  assert.strictEqual(id1, id2);
});

test("processDiscoveryIntake fails explicitly when processedAt is missing (FINDING-001: Clock Dependency Removed)", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src1",
    sourceType: "dataset",
    canonicalUrl: "https://example.com/data/1",
    title: "Data Item 1",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {}
  };

  const sourceRecord = {
    id: "src1",
    baseUrl: "https://example.com",
    status: SourceStatus.APPROVED
  };

  const resMissing = processDiscoveryIntake(rawDoc, { sourceRecord });
  assert.strictEqual(resMissing.ok, false);
  assert.strictEqual(resMissing.status, "INVALID_PROCESSED_AT");
  assert.match(resMissing.reason, /processedAt must be a non-empty string/);

  const resInvalid = processDiscoveryIntake(rawDoc, { sourceRecord, processedAt: "invalid-date" });
  assert.strictEqual(resInvalid.ok, false);
  assert.strictEqual(resInvalid.status, "INVALID_PROCESSED_AT");
  assert.match(resInvalid.reason, /processedAt must be a valid ISO 8601 timestamp/);
});

test("processDiscoveryIntake does NOT fabricate collector provenance defaults (FINDING-002: No Synthetic Provenance)", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "generic-source",
    sourceType: "web_listing",
    canonicalUrl: "https://example.com/listing/99",
    title: "Unversioned Item",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {}
  };

  const sourceRecord = {
    id: "generic-source",
    baseUrl: "https://example.com",
    status: SourceStatus.APPROVED
  };

  const res = processDiscoveryIntake(rawDoc, {
    sourceRecord,
    processedAt: "2026-08-30T01:00:00Z"
  });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.discoveryRecord.provenance.collectorId, null, "Must NOT fabricate 'unknown-collector'");
  assert.strictEqual(res.discoveryRecord.provenance.collectorVersion, null, "Must NOT fabricate '1.0.0'");
});

test("processDiscoveryIntake is generic and source-agnostic without financial/TrustMRR coupling (FINDING-003)", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "hiring-board",
    sourceType: "job_post",
    canonicalUrl: "https://jobs.example.com/post/77",
    contentReference: "https://company.example.com",
    title: "Senior Engineer Job",
    summary: "Remote position",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {
      salaryRange: "$150k-$180k",
      skills: ["Rust", "Distributed Systems"]
    }
  };

  const sourceRecord = {
    id: "hiring-board",
    baseUrl: "https://jobs.example.com",
    status: SourceStatus.APPROVED
  };

  const res = processDiscoveryIntake(rawDoc, {
    sourceRecord,
    processedAt: "2026-08-30T01:00:00Z"
  });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.discoveryRecord.sourceId, "hiring-board");
  assert.strictEqual(res.discoveryRecord.metadata.salaryRange, "$150k-$180k");
  assert.strictEqual(res.discoveryRecord.financials, undefined, "Generic intake must not inject financial fields");
});

test("sanitizeConfidentialRecursively cleans deeply nested objects and arrays (FINDING-004: Recursive Isolation)", () => {
  const inputMetadata = {
    safeField: "value1",
    websiteUrl: "https://leak.example.com",
    nested: {
      domain: "secret-domain.com",
      safeNested: 123,
      deep: {
        contact_url: "https://secret.example.com/contact"
      }
    },
    arrayField: [
      { rawHtmlRef: "https://secret.example.com/page.html", safeItem: "ok" },
      "string-item"
    ]
  };

  const cleaned = sanitizeConfidentialRecursively(inputMetadata);
  assert.strictEqual(cleaned.safeField, "value1");
  assert.strictEqual(cleaned.websiteUrl, undefined);
  assert.strictEqual(cleaned.nested.domain, undefined);
  assert.strictEqual(cleaned.nested.safeNested, 123);
  assert.strictEqual(cleaned.nested.deep.contact_url, undefined);
  assert.strictEqual(cleaned.arrayField[0].rawHtmlRef, undefined);
  assert.strictEqual(cleaned.arrayField[0].safeItem, "ok");
});

test("processDiscoveryIntake isolates confidential listings and deep sanitizes (TRUSTMRR-G003)", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "source-a",
    sourceType: "startup_listing",
    canonicalUrl: "https://source-a.com/item/confidential-1",
    contentReference: "https://secret.com",
    title: "Stealth Startup",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {
      is_confidential: true,
      domain: "secret.com",
      nested: {
        websiteUrl: "https://secret.com"
      }
    }
  };

  const sourceRecord = {
    id: "source-a",
    baseUrl: "https://source-a.com",
    status: SourceStatus.APPROVED
  };

  const res = processDiscoveryIntake(rawDoc, {
    sourceRecord,
    processedAt: "2026-08-30T01:00:00Z"
  });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.discoveryRecord.is_confidential, true);
  assert.strictEqual(res.discoveryRecord.contentReference, null);
  assert.strictEqual(res.discoveryRecord.metadata.domain, undefined);
  assert.strictEqual(res.discoveryRecord.metadata.nested.websiteUrl, undefined);
});

test("processDiscoveryIntake handles error branches (SOURCE_NOT_REGISTERED, SOURCE_MISMATCH, SOURCE_INELIGIBLE)", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "source-1",
    sourceType: "listing",
    canonicalUrl: "https://source-1.com/p/1",
    title: "Listing 1",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {}
  };

  const processedAt = "2026-08-30T01:00:00Z";

  // Unregistered
  const resUnreg = processDiscoveryIntake(rawDoc, { sourceRecord: null, processedAt });
  assert.strictEqual(resUnreg.ok, false);
  assert.strictEqual(resUnreg.status, "SOURCE_NOT_REGISTERED");

  // Mismatch
  const resMismatch = processDiscoveryIntake(rawDoc, {
    sourceRecord: { id: "source-2", baseUrl: "https://source-2.com", status: SourceStatus.APPROVED },
    processedAt
  });
  assert.strictEqual(resMismatch.ok, false);
  assert.strictEqual(resMismatch.status, "SOURCE_MISMATCH");

  // Ineligible
  const resIneligible = processDiscoveryIntake(rawDoc, {
    sourceRecord: { id: "source-1", baseUrl: "https://source-1.com", status: SourceStatus.REJECTED },
    processedAt
  });
  assert.strictEqual(resIneligible.ok, false);
  assert.strictEqual(resIneligible.status, "SOURCE_INELIGIBLE");
});

test("processDiscoveryIntake is strictly deterministic and idempotent end-to-end", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "source-1",
    sourceType: "listing",
    canonicalUrl: "https://source-1.com/p/100",
    contentReference: "https://ext.com",
    title: "Deterministic Item",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: { tag: "saas" }
  };

  const sourceRecord = {
    id: "source-1",
    baseUrl: "https://source-1.com",
    status: SourceStatus.APPROVED
  };

  const processedAt = "2026-08-30T02:00:00.000Z";
  const run1 = processDiscoveryIntake(rawDoc, { sourceRecord, processedAt, actor: "test-actor" });
  const run2 = processDiscoveryIntake(rawDoc, { sourceRecord, processedAt, actor: "test-actor" });

  assert.strictEqual(run1.ok, true);
  assert.strictEqual(run2.ok, true);
  assert.deepStrictEqual(run1, run2, "Replay must yield 100% deep-equal output");

  // Verify deep freeze immutability
  assert.throws(() => { run1.discoveryRecord.title = "mutated"; }, /Cannot assign to read only property/);
  assert.throws(() => { run1.discoveryRecord.provenance.discoveredAt = "mutated"; }, /Cannot assign to read only property/);
  assert.throws(() => { run1.discoveryRecord.metadata.tag = "mutated"; }, /Cannot assign to read only property/);
});
