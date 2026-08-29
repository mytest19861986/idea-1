import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryCandidatePersistence,
  InMemoryResolutionPersistence,
  InMemoryObservationPersistence,
  InMemoryHealthSnapshotPersistence,
  InMemoryGovernancePersistence
} from "../src/storage/discovery-persistence.mjs";

test("PERSIST: candidate persisted yields round-trip deep-equivalent domain record", async () => {
  const repo = new InMemoryCandidatePersistence();
  const candidate = {
    id: "cand-1",
    canonicalUrl: "https://example.com/app",
    canonicalDomain: "example.com",
    title: "Example App",
    sourceType: "listing",
    sourceRecordId: "src-1",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    schemaVersion: 1,
    ruleVersion: "rule-v1",
    confidence: "HIGH",
    tags: ["saas"],
    metadata: { key: "val" }
  };
  const attr = {
    sourceId: "src-1",
    sourceType: "listing",
    idempotencyKey: "idem-1",
    claimClassification: "SOURCE_CLAIM",
    collectorVersion: "col-v1",
    attributedAt: "2026-08-30T00:01:00Z"
  };

  const res = await repo.saveCandidate(candidate, attr);
  assert.strictEqual(res.status, "STORED");

  const retrieved = await repo.findCandidateById("cand-1");
  assert.deepStrictEqual(retrieved, candidate);
});

test("PERSIST: discovery_id is authoritative identity (Finding 1 fix)", async () => {
  const repo = new InMemoryCandidatePersistence();
  const cand1 = { id: "cand-1", canonicalUrl: "https://example.com/shared", title: "App 1" };
  const cand2 = { id: "cand-2", canonicalUrl: "https://example.com/shared", title: "App 2" };

  const r1 = await repo.saveCandidate(cand1, { sourceId: "src-1", idempotencyKey: "k1" });
  const r2 = await repo.saveCandidate(cand2, { sourceId: "src-2", idempotencyKey: "k2" });

  assert.strictEqual(r1.status, "STORED");
  assert.strictEqual(r2.status, "STORED");
  assert.strictEqual((await repo.findCandidateById("cand-1")).id, "cand-1");
  assert.strictEqual((await repo.findCandidateById("cand-2")).id, "cand-2");
});

test("PERSIST: same candidate replay is idempotent without duplicates", async () => {
  const repo = new InMemoryCandidatePersistence();
  const candidate = { id: "cand-1", canonicalUrl: "https://example.com/app", title: "Example App" };
  const attr = { sourceId: "src-1", idempotencyKey: "idem-1" };

  await repo.saveCandidate(candidate, attr);
  const res2 = await repo.saveCandidate(candidate, attr);

  assert.strictEqual(res2.status, "REPLAYED");
  const attributions = await repo.getAttributionsForCandidate("cand-1");
  assert.strictEqual(attributions.length, 1);
});

test("PERSIST: multi-source attribution preserves all provenance and appends cleanly", async () => {
  const repo = new InMemoryCandidatePersistence();
  const candidate = { id: "cand-multi", canonicalUrl: "https://multi.com", title: "Multi App" };

  await repo.saveCandidate(candidate, { sourceId: "src-a", idempotencyKey: "k-a", collectorVersion: "v1" });
  const resB = await repo.saveCandidate(candidate, { sourceId: "src-b", idempotencyKey: "k-b", collectorVersion: "v2" });

  assert.strictEqual(resB.status, "ATTRIBUTION_APPENDED");
  const attributions = await repo.getAttributionsForCandidate("cand-multi");
  assert.strictEqual(attributions.length, 2);
  assert.strictEqual(attributions[0].sourceId, "src-a");
  assert.strictEqual(attributions[1].sourceId, "src-b");
});

test("PERSIST: entity resolution decision history retains all evaluated pairs", async () => {
  const resRepo = new InMemoryResolutionPersistence();
  const dec1 = {
    decisionId: "res-1",
    candidateAId: "cand-1",
    candidateBId: "cand-2",
    pairIdentity: "pair:cand-1:cand-2",
    resolutionStatus: "POSSIBLE_MATCH",
    ruleVersion: "v1",
    evaluatedAt: "2026-08-30T00:00:00Z",
    actor: "engine"
  };
  const dec2 = {
    decisionId: "res-2",
    candidateAId: "cand-1",
    candidateBId: "cand-2",
    pairIdentity: "pair:cand-1:cand-2",
    resolutionStatus: "CONFIRMED_MATCH",
    ruleVersion: "v2",
    evaluatedAt: "2026-08-30T01:00:00Z",
    actor: "engine"
  };

  await resRepo.saveResolutionDecision(dec1);
  await resRepo.saveResolutionDecision(dec2);

  const history = await resRepo.getResolutionHistory("pair:cand-1:cand-2");
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].resolutionStatus, "POSSIBLE_MATCH");
  assert.strictEqual(history[1].resolutionStatus, "CONFIRMED_MATCH");
});

test("PERSIST: cluster creation and member replay is idempotent", async () => {
  const resRepo = new InMemoryResolutionPersistence();
  await resRepo.saveCluster({ clusterId: "clust-1", canonicalName: "Acme Corp" });

  const m1 = await resRepo.addClusterMember("clust-1", "cand-1", "src-1", "2026-08-30T00:00:00Z");
  assert.strictEqual(m1.status, "MEMBER_ADDED");

  const m2 = await resRepo.addClusterMember("clust-1", "cand-1", "src-1", "2026-08-30T00:05:00Z");
  assert.strictEqual(m2.status, "REPLAYED");

  const cluster = await resRepo.getClusterByCandidateId("cand-1");
  assert.strictEqual(cluster.clusterId, "clust-1");
});

test("PERSIST: source observations prevent double-counting identity on replay", async () => {
  const obsRepo = new InMemoryObservationPersistence();
  const obs = {
    observationId: "obs:src-1:exec-1:100",
    executionId: "exec-1",
    sourceId: "src-1",
    success: true,
    statusCode: 200,
    yieldCount: 1,
    duplicateCount: 0,
    uniqueCount: 1,
    occurredAt: "2026-08-30T00:00:00Z"
  };

  const r1 = await obsRepo.saveObservation(obs);
  const r2 = await obsRepo.saveObservation(obs);

  assert.strictEqual(r1.status, "STORED");
  assert.strictEqual(r2.status, "REPLAYED");

  const list = await obsRepo.getObservationsForSource("src-1");
  assert.strictEqual(list.length, 1);
});

test("PERSIST: health snapshot deterministic replay vs history (Finding 7 fix)", async () => {
  const healthRepo = new InMemoryHealthSnapshotPersistence();
  const snap1 = {
    sourceId: "src-1",
    windowStart: "2026-08-30T00:00:00Z",
    windowEnd: "2026-08-30T01:00:00Z",
    evaluationVersion: "eval-v1",
    formulaVersion: "form-v1",
    operationalHealth: "HIGH",
    intelligenceContribution: "HIGH",
    evaluatedAt: "2026-08-30T01:00:00Z"
  };

  const r1 = await healthRepo.saveSnapshot(snap1);
  const r2 = await healthRepo.saveSnapshot(snap1);

  assert.strictEqual(r1.status, "STORED");
  assert.strictEqual(r2.status, "REPLAYED");

  const snap2 = {
    sourceId: "src-1",
    windowStart: "2026-08-30T01:00:00Z",
    windowEnd: "2026-08-30T02:00:00Z",
    evaluationVersion: "eval-v1",
    formulaVersion: "form-v1",
    operationalHealth: "DEGRADED",
    intelligenceContribution: "LOW",
    evaluatedAt: "2026-08-30T02:00:00Z"
  };

  const r3 = await healthRepo.saveSnapshot(snap2);
  assert.strictEqual(r3.status, "STORED");

  const history = await healthRepo.getSnapshotsForSource("src-1");
  assert.strictEqual(history.length, 2);
});

test("PERSIST: governance application history is append-only for all attempts (Finding 6 fix)", async () => {
  const govRepo = new InMemoryGovernancePersistence();
  const decision = {
    decisionId: "gov:dec:src-1:100",
    sourceId: "src-1",
    currentState: "ACTIVE",
    proposedState: "DEGRADED",
    decision: "ALLOW_AUTOMATIC_TRANSITION"
  };

  await govRepo.saveDecision(decision);

  const attempt1 = {
    decisionId: "gov:dec:src-1:100",
    sourceId: "src-1",
    fromState: "ACTIVE",
    toState: "DEGRADED",
    applicationStatus: "APPLIED",
    appliedAt: "2026-08-30T00:00:00Z",
    actor: "applier"
  };

  const attempt2 = {
    decisionId: "gov:dec:src-1:100",
    sourceId: "src-1",
    fromState: "ACTIVE",
    toState: "DEGRADED",
    applicationStatus: "REPLAYED",
    appliedAt: "2026-08-30T00:01:00Z",
    actor: "applier"
  };

  await govRepo.saveApplication(attempt1);
  await govRepo.saveApplication(attempt2);

  const history = await govRepo.getApplicationsForDecision("gov:dec:src-1:100");
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].applicationStatus, "APPLIED");
  assert.strictEqual(history[1].applicationStatus, "REPLAYED");
});

test("PERSIST: SOURCE_CLAIM classification, UNKNOWN values, timestamps, and confidentiality survive round-trip", async () => {
  const repo = new InMemoryCandidatePersistence();
  const confCandidate = {
    id: "cand-conf",
    canonicalUrl: "https://conf.com/deal/1",
    canonicalDomain: "conf.com",
    title: "Stealth Tech",
    sourceType: "listing",
    sourceRecordId: "src-conf",
    discoveredAt: "2026-08-30T00:00:00Z",
    retrievedAt: "2026-08-30T00:01:00Z",
    schemaVersion: 1,
    ruleVersion: "rule-v1",
    confidence: "UNKNOWN",
    tags: [],
    metadata: { is_confidential: true }
  };
  const attr = {
    sourceId: "src-conf",
    sourceType: "listing",
    idempotencyKey: "k-conf",
    claimClassification: "SOURCE_CLAIM",
    collectorVersion: "col-v1",
    attributedAt: "2026-08-30T00:01:00Z"
  };

  await repo.saveCandidate(confCandidate, attr);

  const retrieved = await repo.findCandidateById("cand-conf");
  assert.strictEqual(retrieved.confidence, "UNKNOWN");
  assert.strictEqual(retrieved.metadata.is_confidential, true);
  assert.strictEqual(JSON.stringify(retrieved).includes("secret-domain"), false);

  const attrs = await repo.getAttributionsForCandidate("cand-conf");
  assert.strictEqual(attrs[0].claimClassification, "SOURCE_CLAIM");
  assert.strictEqual(attrs[0].attributedAt, "2026-08-30T00:01:00Z");
});
