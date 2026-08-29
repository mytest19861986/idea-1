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

test("processDiscoveryIntake accepts approved source and preserves SOURCE_CLAIM and provenance", () => {
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
        claim_type: "SOURCE_CLAIM",
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

  const result = processDiscoveryIntake(rawDoc, { sourceRecord, actor: "test-runner" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, "ACCEPTED");
  assert.strictEqual(result.discoveryRecord.discoveryId, "disc:trustmrr:https://trustmrr.com/startup/revenue-saas");
  assert.strictEqual(result.discoveryRecord.financials.claim_type, "SOURCE_CLAIM");
  assert.strictEqual(result.discoveryRecord.provenance.verified_by, "stripe");
  assert.strictEqual(result.discoveryRecord.contentReference, "https://revenuesaas.com");
  assert.strictEqual(result.discoveryRecord.is_confidential, false);

  assert.strictEqual(result.auditEvent.eventType, "DISCOVERY_INTAKE_ACCEPTED");
  assert.strictEqual(result.auditEvent.actor, "test-runner");
});

test("processDiscoveryIntake isolates confidential listings (TRUSTMRR-G003)", () => {
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
  assert.strictEqual(result.auditEvent.is_confidential, true);
});
