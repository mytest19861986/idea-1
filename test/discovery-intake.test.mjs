import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceStatus } from "../src/source-registry/lifecycle.mjs";
import {
  validateRawDocument,
  isSourceEligibleForIntake,
  computeDeterministicDiscoveryId,
  processDiscoveryIntake
} from "../src/discovery/discovery-intake.mjs";

test("validateRawDocument enforces HTTPS and required schema fields", () => {
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
  const id1 = computeDeterministicDiscoveryId("trustmrr", "https://trustmrr.com/startup/saas-app");
  const id2 = computeDeterministicDiscoveryId("trustmrr", "https://trustmrr.com/startup/saas-app");
  assert.strictEqual(id1, "disc:trustmrr:https://trustmrr.com/startup/saas-app");
  assert.strictEqual(id1, id2);
});

test("processDiscoveryIntake handles SOURCE_NOT_REGISTERED branch", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "unregistered-source",
    sourceType: "marketplace",
    canonicalUrl: "https://example.com/item/1",
    title: "Item 1",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {}
  };

  const result = processDiscoveryIntake(rawDoc, { sourceRecord: null });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "SOURCE_NOT_REGISTERED");
  assert.strictEqual(result.auditEvent.eventType, "DISCOVERY_INTAKE_REJECTED");
  assert.strictEqual(result.auditEvent.reason, "SOURCE_NOT_REGISTERED");
});

test("processDiscoveryIntake handles SOURCE_MISMATCH branch", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "trustmrr",
    sourceType: "marketplace",
    canonicalUrl: "https://example.com/item/1",
    title: "Item 1",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {}
  };

  const mismatchedSource = {
    id: "different-source",
    baseUrl: "https://different.com",
    status: SourceStatus.APPROVED
  };

  const result = processDiscoveryIntake(rawDoc, { sourceRecord: mismatchedSource });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "SOURCE_MISMATCH");
  assert.strictEqual(result.auditEvent.eventType, "DISCOVERY_INTAKE_REJECTED");
  assert.strictEqual(result.auditEvent.reason, "SOURCE_MISMATCH");
});

test("processDiscoveryIntake rejects unapproved sources with audit event", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "unapproved-source",
    sourceType: "marketplace",
    canonicalUrl: "https://example.com/item/123",
    title: "Sample Item",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:00:00Z",
    metadata: {}
  };

  const candidateSource = {
    id: "unapproved-source",
    baseUrl: "https://example.com",
    status: SourceStatus.CANDIDATE
  };

  const result = processDiscoveryIntake(rawDoc, { sourceRecord: candidateSource });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "SOURCE_INELIGIBLE");
  assert.strictEqual(result.auditEvent.eventType, "DISCOVERY_INTAKE_REJECTED");
});

test("processDiscoveryIntake is idempotent across duplicate replays", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "trustmrr",
    sourceType: "marketplace_startup_listing",
    canonicalUrl: "https://trustmrr.com/startup/revenue-saas",
    contentReference: "https://revenuesaas.com",
    title: "Revenue SaaS",
    summary: "B2B Analytics tool",
    discoveredAt: "2026-08-30T01:00:00Z",
    retrievedAt: "2026-08-30T01:05:00Z",
    collectorId: "trustmrr-http-collector",
    collectorVersion: "1.0.0",
    metadata: {
      financials: {
        mrr: 15000,
        arr: 180000,
        claim_type: "FACT", // Attempt to supply FACT
        provenance: {
          verified_by: "stripe",
          verified_status: "VERIFIED_BY_PROVIDER"
        }
      }
    }
  };

  const sourceRecord = {
    id: "trustmrr",
    baseUrl: "https://trustmrr.com/",
    status: SourceStatus.APPROVED
  };

  const replayTimestamp = "2026-08-30T01:10:00.000Z";
  const run1 = processDiscoveryIntake(rawDoc, { sourceRecord, actor: "test-runner", processedAt: replayTimestamp });
  const run2 = processDiscoveryIntake(rawDoc, { sourceRecord, actor: "test-runner", processedAt: replayTimestamp });

  assert.strictEqual(run1.ok, true);
  assert.strictEqual(run2.ok, true);
  assert.deepStrictEqual(run1.discoveryRecord, run2.discoveryRecord, "Replay must yield identical discovery record");
  assert.deepStrictEqual(run1.auditEvent, run2.auditEvent, "Replay must yield identical audit event");
  assert.strictEqual(run1.discoveryRecord.financials.claim_type, "SOURCE_CLAIM", "Caller-supplied FACT must be overwritten to SOURCE_CLAIM");

  // Verify deep immutability
  assert.throws(() => { run1.discoveryRecord.provenance.verified_by = "tampered"; }, /Cannot assign to read only property/);
});

test("processDiscoveryIntake isolates confidential listings and sanitizes metadata (TRUSTMRR-G003)", () => {
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "trustmrr",
    sourceType: "marketplace_startup_listing",
    canonicalUrl: "https://trustmrr.com/startup/confidential-998",
    contentReference: "https://secret-domain.com",
    title: "Confidential Micro-SaaS",
    discoveredAt: "2026-08-30T01:00:00Z",
    retrievedAt: "2026-08-30T01:05:00Z",
    metadata: {
      is_confidential: true,
      domain: "secret-domain.com",
      websiteUrl: "https://secret-domain.com",
      contactUrl: "https://secret-domain.com/contact",
      safeCategory: "Developer Tools",
      financials: {
        mrr: 5000,
        claim_type: "SOURCE_CLAIM"
      }
    }
  };

  const sourceRecord = {
    id: "trustmrr",
    baseUrl: "https://trustmrr.com/",
    status: SourceStatus.APPROVED
  };

  const result = processDiscoveryIntake(rawDoc, { sourceRecord });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.discoveryRecord.is_confidential, true);
  assert.strictEqual(result.discoveryRecord.contentReference, null, "confidential listings must have null contentReference");
  assert.strictEqual(result.discoveryRecord.metadata.domain, undefined, "domain must be sanitized");
  assert.strictEqual(result.discoveryRecord.metadata.websiteUrl, undefined, "websiteUrl must be sanitized");
  assert.strictEqual(result.discoveryRecord.metadata.contactUrl, undefined, "contactUrl must be sanitized");
  assert.strictEqual(result.discoveryRecord.metadata.safeCategory, "Developer Tools", "non-sensitive metadata must be preserved");
  assert.strictEqual(result.auditEvent.is_confidential, true);
});
