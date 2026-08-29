import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceStatus } from "../src/source-registry/lifecycle.mjs";
import { InMemoryDiscoveryCandidateStore } from "../src/discovery/candidate-store.mjs";
import { EntityResolutionEngine, ResolutionDecision } from "../src/discovery/entity-resolution.mjs";
import {
  PipelineStatus,
  StageStatus,
  executeDiscoveryPipeline
} from "../src/discovery/pipeline.mjs";

test("PIPELINE-I001 & PIPELINE-I009: valid APPROVED source without context executes COMPLETED with UNRESOLVED resolution", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const resolutionEngine = new EntityResolutionEngine();

  const sourceRecord = {
    id: "src-marketplace",
    baseUrl: "https://marketplace.com",
    status: SourceStatus.APPROVED
  };

  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src-marketplace",
    sourceType: "startup_listing",
    canonicalUrl: "https://marketplace.com/listing/item-1",
    contentReference: "https://item1.com",
    title: "Item 1 SaaS",
    summary: "Cloud SaaS",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: { tier: "pro", domain: "item1.com" }
  };

  const res = executeDiscoveryPipeline(rawDoc, {
    sourceRecord,
    store,
    resolutionEngine,
    resolutionContext: [],
    at: "2026-08-30T01:00:00.000Z",
    executionId: "exec-001"
  });

  assert.strictEqual(res.pipelineStatus, PipelineStatus.COMPLETED);
  assert.strictEqual(res.stages.intake.status, StageStatus.SUCCESS);
  assert.strictEqual(res.stages.store.status, StageStatus.STORED);
  assert.strictEqual(res.stages.resolution.status, StageStatus.UNRESOLVED);
  assert.strictEqual(res.auditEvents.length, 2);
  assert.strictEqual(res.auditEvents[0].executionId, "exec-001");
  assert.strictEqual(res.auditEvents[1].executionId, "exec-001");
});

test("PIPELINE-I004: exact duplicate replay produces REPLAYED store stage without duplicates", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const resolutionEngine = new EntityResolutionEngine();

  const sourceRecord = {
    id: "src-1",
    baseUrl: "https://src1.com",
    status: SourceStatus.APPROVED
  };

  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src-1",
    sourceType: "listing",
    canonicalUrl: "https://src1.com/p/1",
    title: "Listing 1",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: {}
  };

  const res1 = executeDiscoveryPipeline(rawDoc, {
    sourceRecord,
    store,
    resolutionEngine,
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-101"
  });

  const res2 = executeDiscoveryPipeline(rawDoc, {
    sourceRecord,
    store,
    resolutionEngine,
    at: "2026-08-30T01:05:00Z",
    executionId: "exec-102"
  });

  assert.strictEqual(res1.stages.store.status, StageStatus.STORED);
  assert.strictEqual(res2.stages.store.status, StageStatus.REPLAYED);
  assert.deepStrictEqual(res1.candidate, res2.candidate);
});

test("PIPELINE-I002: unregistered or ineligible source fails closed at intake, downstream NOT_RUN", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src-unknown",
    sourceType: "listing",
    canonicalUrl: "https://unknown.com/p/1",
    title: "Listing",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: {}
  };

  // Unregistered
  const resUnreg = executeDiscoveryPipeline(rawDoc, {
    sourceRecord: null,
    store,
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-unreg"
  });

  assert.strictEqual(resUnreg.pipelineStatus, PipelineStatus.REJECTED_AT_INTAKE);
  assert.strictEqual(resUnreg.stages.intake.status, StageStatus.REJECTED);
  assert.strictEqual(resUnreg.stages.store.status, StageStatus.NOT_RUN);
  assert.strictEqual(resUnreg.stages.resolution.status, StageStatus.NOT_RUN);

  // Ineligible (REJECTED status)
  const resIneligible = executeDiscoveryPipeline(rawDoc, {
    sourceRecord: { id: "src-unknown", baseUrl: "https://unknown.com", status: SourceStatus.REJECTED },
    store,
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-inelig"
  });

  assert.strictEqual(resIneligible.pipelineStatus, PipelineStatus.REJECTED_AT_INTAKE);
  assert.strictEqual(resIneligible.stages.store.status, StageStatus.NOT_RUN);
  assert.strictEqual(resIneligible.stages.resolution.status, StageStatus.NOT_RUN);
});

test("PIPELINE-I002: store conflict stops pipeline; resolution NOT_RUN", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const resolutionEngine = new EntityResolutionEngine();

  const sourceRecord = {
    id: "src-a",
    baseUrl: "https://srca.com",
    status: SourceStatus.APPROVED
  };

  const rawDoc1 = {
    schemaVersion: 1,
    sourceId: "src-a",
    sourceType: "listing",
    canonicalUrl: "https://srca.com/item/10",
    idempotencyKey: "fixed-key",
    title: "Original Title",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: { domain: "orig.com" }
  };

  const rawDocConflicting = {
    schemaVersion: 1,
    sourceId: "src-a",
    sourceType: "listing",
    canonicalUrl: "https://srca.com/item/10",
    idempotencyKey: "fixed-key",
    title: "Conflicting Mutated Title",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: { domain: "orig.com" }
  };

  executeDiscoveryPipeline(rawDoc1, {
    sourceRecord,
    store,
    resolutionEngine,
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-1"
  });

  const resConflict = executeDiscoveryPipeline(rawDocConflicting, {
    sourceRecord,
    store,
    resolutionEngine,
    resolutionContext: [{ discoveryId: "disc:other:url" }],
    at: "2026-08-30T01:05:00Z",
    executionId: "exec-2"
  });

  assert.strictEqual(resConflict.pipelineStatus, PipelineStatus.CONFLICT_AT_STORE);
  assert.strictEqual(resConflict.stages.store.status, StageStatus.CONFLICT);
  assert.strictEqual(resConflict.stages.resolution.status, StageStatus.NOT_RUN);
});

test("PIPELINE-I008: confidential candidate isolates throughout transit and BLOCKED_CONFIDENTIAL on public pairing", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const resolutionEngine = new EntityResolutionEngine();

  const sourceRecord = {
    id: "src-conf",
    baseUrl: "https://confidential.com",
    status: SourceStatus.APPROVED
  };

  const rawDocConfidential = {
    schemaVersion: 1,
    sourceId: "src-conf",
    sourceType: "stealth_listing",
    canonicalUrl: "https://confidential.com/p/stealth-99",
    contentReference: "https://secret.com",
    title: "Stealth Startup",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: {
      is_confidential: true,
      domain: "secret.com",
      websiteUrl: "https://secret.com"
    }
  };

  const publicCandidate = {
    discoveryId: "disc:public-src:https://public.com/p/1",
    sourceId: "public-src",
    title: "Public Match Target",
    contentReference: "https://target.com",
    is_confidential: false,
    metadata: { domain: "target.com" }
  };

  const res = executeDiscoveryPipeline(rawDocConfidential, {
    sourceRecord,
    store,
    resolutionEngine,
    resolutionContext: [publicCandidate],
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-conf"
  });

  assert.strictEqual(res.pipelineStatus, PipelineStatus.RESOLUTION_BLOCKED);
  assert.strictEqual(res.candidate.is_confidential, true);
  assert.strictEqual(res.candidate.contentReference, null, "contentReference must remain null in transit");
  assert.strictEqual(res.candidate.metadata.domain, undefined, "Sensitive domain must be sanitized");
  assert.strictEqual(res.stages.resolution.status, StageStatus.BLOCKED);
});

test("PIPELINE-I010 & Resolution integration: strong matching candidate pair yields CONFIRMED resolution and cluster", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const resolutionEngine = new EntityResolutionEngine();

  const sourceRecord = {
    id: "src-b",
    baseUrl: "https://srcb.com",
    status: SourceStatus.APPROVED
  };

  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src-b",
    sourceType: "listing",
    canonicalUrl: "https://srcb.com/item/50",
    contentReference: "https://shared-domain.com",
    title: "Shared Domain App",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: { domain: "shared-domain.com" }
  };

  const existingCandidate = {
    discoveryId: "disc:src-a:https://srca.com/item/100",
    sourceId: "src-a",
    title: "Shared Domain App",
    contentReference: "https://shared-domain.com",
    is_confidential: false,
    metadata: { domain: "shared-domain.com" }
  };

  const res = executeDiscoveryPipeline(rawDoc, {
    sourceRecord,
    store,
    resolutionEngine,
    resolutionContext: [existingCandidate],
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-match"
  });

  assert.strictEqual(res.pipelineStatus, PipelineStatus.COMPLETED);
  assert.strictEqual(res.stages.resolution.status, StageStatus.CONFIRMED);
  assert.strictEqual(res.stages.resolution.highestDecision, ResolutionDecision.CONFIRMED_MATCH);

  const cluster = resolutionEngine.getClusterByCandidateId(res.candidateId);
  assert.notStrictEqual(cluster, null);
  assert.strictEqual(cluster.memberIds.length, 2);
});

test("PIPELINE-I012: input objects remain completely unmodified after pipeline execution", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const sourceRecord = {
    id: "src-x",
    baseUrl: "https://srcx.com",
    status: SourceStatus.APPROVED
  };

  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src-x",
    sourceType: "listing",
    canonicalUrl: "https://srcx.com/item/1",
    title: "Immutability Test",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: { key: "initial-val" }
  };

  const rawDocSnapshot = JSON.stringify(rawDoc);
  const sourceRecordSnapshot = JSON.stringify(sourceRecord);

  executeDiscoveryPipeline(rawDoc, {
    sourceRecord,
    store,
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-immut"
  });

  assert.strictEqual(JSON.stringify(rawDoc), rawDocSnapshot);
  assert.strictEqual(JSON.stringify(sourceRecord), sourceRecordSnapshot);
});
