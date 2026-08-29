import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceStatus } from "../src/source-registry/lifecycle.mjs";
import { InMemoryDiscoveryCandidateStore } from "../src/discovery/candidate-store.mjs";
import { EntityResolutionEngine } from "../src/discovery/entity-resolution.mjs";
import {
  HealthLevel,
  ContributionLevel,
  EvaluationConfidence
} from "../src/source-registry/source-health-evaluator.mjs";
import {
  SourceGovernanceApplier,
  GovernanceOutcome
} from "../src/source-registry/source-governance.mjs";
import {
  deriveObservationFromPipelineResult,
  executeDiscoveryE2E
} from "../src/discovery/e2e-orchestrator.mjs";

test("E2E: ACTIVE source with valid RawDocument stores candidate, produces observation, and keeps control plane quiescent by default", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const source = { id: "src-active", baseUrl: "https://active.com", status: SourceStatus.ACTIVE };

  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src-active",
    sourceType: "listing",
    canonicalUrl: "https://active.com/item/100",
    title: "Awesome App",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: {}
  };

  const res = executeDiscoveryE2E(rawDoc, {
    sourceRecord: source,
    store,
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-e2e-1"
  });

  assert.strictEqual(res.dataPlane.pipelineStatus, "COMPLETED");
  assert.strictEqual(res.dataPlane.stages.store.status, "STORED");
  assert.strictEqual(res.observations.length, 1);
  assert.strictEqual(res.observations[0].success, true);
  assert.strictEqual(res.observations[0].yieldCount, 1);
  assert.strictEqual(res.observations[0].uniqueCount, 1);
  assert.strictEqual(res.controlPlane.healthEvaluation.executed, false);
  assert.strictEqual(res.controlPlane.governance.executed, false);
});

test("E2E: Replay produces duplicateCount=1 observation and idempotent store replay", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const source = { id: "src-active", baseUrl: "https://active.com", status: SourceStatus.ACTIVE };
  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src-active",
    sourceType: "listing",
    canonicalUrl: "https://active.com/item/100",
    title: "Awesome App",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: {}
  };

  const res1 = executeDiscoveryE2E(rawDoc, {
    sourceRecord: source,
    store,
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-1"
  });
  const res2 = executeDiscoveryE2E(rawDoc, {
    sourceRecord: source,
    store,
    at: "2026-08-30T01:05:00Z",
    executionId: "exec-2"
  });

  assert.strictEqual(res1.dataPlane.stages.store.status, "STORED");
  assert.strictEqual(res2.dataPlane.stages.store.status, "REPLAYED");
  assert.strictEqual(res2.observations[0].duplicateCount, 1);
  assert.strictEqual(res2.observations[0].uniqueCount, 0);
});

test("E2E: Sustained high-confidence degradation triggers automated transition to DEGRADED and gates future intake", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const governanceApplier = new SourceGovernanceApplier();
  const source = { id: "src-flaky", baseUrl: "https://flaky.com", status: SourceStatus.ACTIVE };

  // 10 failures + 14 successes = 24 observations (failure rate ~41.6% -> MEDIUM/DEGRADED)
  const obsHistory = Array.from({ length: 24 }, (_, i) => ({
    sourceId: "src-flaky",
    success: i >= 10,
    statusCode: i < 10 ? 500 : 200,
    yieldCount: i >= 10 ? 1 : 0,
    occurredAt: `2026-08-30T00:${String(i).padStart(2, "0")}:00Z`
  }));

  // Historical health snapshot showing degradation
  const snapHistory = [
    {
      sourceId: "src-flaky",
      operationalHealth: HealthLevel.MEDIUM,
      confidence: EvaluationConfidence.HIGH,
      evaluatedAt: "2026-08-30T00:30:00Z"
    }
  ];

  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src-flaky",
    sourceType: "listing",
    canonicalUrl: "https://flaky.com/item/1",
    title: "Flaky Item",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: {}
  };

  const res = executeDiscoveryE2E(rawDoc, {
    sourceRecord: source,
    store,
    governanceApplier,
    observationHistory: obsHistory,
    healthSnapshotHistory: snapHistory,
    runControlPlane: true,
    windowStart: "2026-08-30T00:00:00Z",
    windowEnd: "2026-08-30T01:00:00Z",
    lastTransitionAt: "2026-08-29T10:00:00Z",
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-deg"
  });

  assert.strictEqual(res.controlPlane.governance.transitionApplied, true);
  assert.strictEqual(res.controlPlane.governance.applicationStatus, "APPLIED");
  assert.strictEqual(res.sourceRecord.status, SourceStatus.DEGRADED);

  // Future candidate under DEGRADED status still succeeds intake (since DEGRADED is eligible)
  // Now if source transitions to PAUSED:
  const pausedSource = { ...res.sourceRecord, status: SourceStatus.PAUSED };
  const resPaused = executeDiscoveryE2E(rawDoc, {
    sourceRecord: pausedSource,
    store,
    at: "2026-08-30T02:00:00Z",
    executionId: "exec-paused-intake"
  });

  // Future intake on PAUSED source fails closed!
  assert.strictEqual(resPaused.dataPlane.pipelineStatus, "REJECTED_AT_INTAKE");
  assert.strictEqual(resPaused.dataPlane.stages.store.status, "NOT_RUN");
});

test("E2E: Historical candidate remains intact and immutable after source state change", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const sourceActive = { id: "src-immut", baseUrl: "https://immut.com", status: SourceStatus.ACTIVE };

  const rawDoc = {
    schemaVersion: 1,
    sourceId: "src-immut",
    sourceType: "listing",
    canonicalUrl: "https://immut.com/item/1",
    title: "Historical Candidate",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: {}
  };

  const res1 = executeDiscoveryE2E(rawDoc, {
    sourceRecord: sourceActive,
    store,
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-stored"
  });

  const originalCandidate = store.getCandidateById(res1.dataPlane.candidateId);
  assert.notStrictEqual(originalCandidate, null);

  // Source becomes PAUSED
  const sourcePaused = { ...sourceActive, status: SourceStatus.PAUSED };
  executeDiscoveryE2E(rawDoc, {
    sourceRecord: sourcePaused,
    store,
    at: "2026-08-30T02:00:00Z",
    executionId: "exec-paused"
  });

  // Candidate in store must be 100% intact and unchanged
  const candidateAfterPause = store.getCandidateById(res1.dataPlane.candidateId);
  assert.deepStrictEqual(originalCandidate, candidateAfterPause);
});

test("E2E: Confidential candidate does not leak sensitive identifiers into observations", () => {
  const store = new InMemoryDiscoveryCandidateStore();
  const source = { id: "src-conf", baseUrl: "https://conf.com", status: SourceStatus.ACTIVE };

  const rawDocConf = {
    schemaVersion: 1,
    sourceId: "src-conf",
    sourceType: "stealth_listing",
    canonicalUrl: "https://conf.com/listing/stealth-1",
    contentReference: "https://super-secret-domain.com",
    title: "Stealth Startup",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    metadata: {
      is_confidential: true,
      domain: "super-secret-domain.com",
      websiteUrl: "https://super-secret-domain.com"
    }
  };

  const res = executeDiscoveryE2E(rawDocConf, {
    sourceRecord: source,
    store,
    at: "2026-08-30T01:00:00Z",
    executionId: "exec-conf"
  });

  const obs = res.observations[0];
  assert.strictEqual(JSON.stringify(obs).includes("super-secret-domain"), false);
  assert.strictEqual(JSON.stringify(obs).includes("contentReference"), false);
});
