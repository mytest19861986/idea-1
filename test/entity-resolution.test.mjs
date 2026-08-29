import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ResolutionDecision,
  RULE_VERSION,
  extractNormalizedDomain,
  normalizeEntityName,
  computePairIdentity,
  evaluateCandidatePair,
  EntityResolutionEngine
} from "../src/discovery/entity-resolution.mjs";

test("extractNormalizedDomain correctly normalizes varied URL formats and hostnames", () => {
  assert.strictEqual(extractNormalizedDomain("https://www.example.com/path"), "example.com");
  assert.strictEqual(extractNormalizedDomain("http://sub.domain.co.uk/page?q=1"), "sub.domain.co.uk");
  assert.strictEqual(extractNormalizedDomain("startup.io"), "startup.io");
  assert.strictEqual(extractNormalizedDomain(null), null);
  assert.strictEqual(extractNormalizedDomain(""), null);
});

test("computePairIdentity is order-independent and deterministic ((A,B) == (B,A))", () => {
  const pair1 = computePairIdentity("disc:src1:urlA", "disc:src2:urlB");
  const pair2 = computePairIdentity("disc:src2:urlB", "disc:src1:urlA");
  assert.strictEqual(pair1, pair2);
  assert.strictEqual(pair1, "pair:disc:src1:urlA:disc:src2:urlB");
});

test("evaluateCandidatePair: exact canonical domain match yields CONFIRMED_MATCH", () => {
  const candidateA = {
    discoveryId: "disc:source-1:https://source-1.com/item/42",
    sourceId: "source-1",
    title: "Awesome SaaS",
    contentReference: "https://awesomesaas.com",
    is_confidential: false,
    metadata: { domain: "awesomesaas.com" }
  };

  const candidateB = {
    discoveryId: "disc:source-2:https://source-2.com/item/99",
    sourceId: "source-2",
    title: "Awesome SaaS App",
    contentReference: "https://www.awesomesaas.com/product",
    is_confidential: false,
    metadata: { domain: "awesomesaas.com" }
  };

  const res = evaluateCandidatePair(candidateA, candidateB, { at: "2026-08-30T01:00:00Z" });
  assert.strictEqual(res.decision, ResolutionDecision.CONFIRMED_MATCH);
  assert.strictEqual(res.confidence, 1.0);
  assert.strictEqual(res.ruleVersion, RULE_VERSION);
  assert.strictEqual(res.contradictions.length, 0);
  assert.strictEqual(res.signals[0].key, "exact_canonical_domain_match");
});

test("evaluateCandidatePair: same name but different verified domains yields CONFIRMED_DISTINCT (no auto-confirm)", () => {
  const candidateA = {
    discoveryId: "disc:source-1:https://source-1.com/item/1",
    sourceId: "source-1",
    title: "Apex",
    contentReference: "https://apex-security.com",
    is_confidential: false,
    metadata: { domain: "apex-security.com" }
  };

  const candidateB = {
    discoveryId: "disc:source-2:https://source-2.com/item/2",
    sourceId: "source-2",
    title: "Apex",
    contentReference: "https://apex-finance.com",
    is_confidential: false,
    metadata: { domain: "apex-finance.com" }
  };

  const res = evaluateCandidatePair(candidateA, candidateB, { at: "2026-08-30T01:00:00Z" });
  assert.strictEqual(res.decision, ResolutionDecision.CONFIRMED_DISTINCT);
  assert.strictEqual(res.contradictions.includes("CANONICAL_DOMAIN_MISMATCH"), true);
});

test("evaluateCandidatePair: same name without domains yields POSSIBLE_MATCH (no auto-merge)", () => {
  const candidateA = {
    discoveryId: "disc:source-1:https://source-1.com/item/10",
    sourceId: "source-1",
    title: "Nova Tools",
    is_confidential: false,
    metadata: {}
  };

  const candidateB = {
    discoveryId: "disc:source-2:https://source-2.com/item/20",
    sourceId: "source-2",
    title: "Nova Tools",
    is_confidential: false,
    metadata: {}
  };

  const res = evaluateCandidatePair(candidateA, candidateB, { at: "2026-08-30T01:00:00Z" });
  assert.strictEqual(res.decision, ResolutionDecision.POSSIBLE_MATCH);
  assert.strictEqual(res.confidence, 0.4);
});

test("evaluateCandidatePair: strong stable external identifier match yields CONFIRMED_MATCH", () => {
  const candidateA = {
    discoveryId: "disc:source-1:https://source-1.com/item/100",
    sourceId: "source-1",
    title: "Project Alpha",
    is_confidential: false,
    metadata: { stableExternalId: "ext-org/project-alpha" }
  };

  const candidateB = {
    discoveryId: "disc:source-2:https://source-2.com/item/200",
    sourceId: "source-2",
    title: "Alpha Core Engine",
    is_confidential: false,
    metadata: { stableExternalId: "ext-org/project-alpha" }
  };

  const res = evaluateCandidatePair(candidateA, candidateB, { at: "2026-08-30T01:00:00Z" });
  assert.strictEqual(res.decision, ResolutionDecision.CONFIRMED_MATCH);
  assert.strictEqual(res.confidence, 1.0);
  assert.strictEqual(res.signals[0].key, "stable_external_id_match");
});

test("evaluateCandidatePair: cross-confidentiality linkage is strictly BLOCKED_CONFIDENTIAL", () => {
  const candidateConf = {
    discoveryId: "disc:source-1:https://source-1.com/stealth/1",
    sourceId: "source-1",
    title: "Stealth Stealthy Startup",
    is_confidential: true,
    metadata: {}
  };

  const candidatePublic = {
    discoveryId: "disc:source-2:https://source-2.com/item/2",
    sourceId: "source-2",
    title: "Stealth Stealthy Startup",
    is_confidential: false,
    metadata: {}
  };

  const res = evaluateCandidatePair(candidateConf, candidatePublic, { at: "2026-08-30T01:00:00Z" });
  assert.strictEqual(res.decision, ResolutionDecision.BLOCKED_CONFIDENTIAL);
  assert.strictEqual(res.confidence, 0.0);
  assert.strictEqual(res.contradictions[0], "CROSS_CONFIDENTIALITY_LINKAGE_BLOCKED");
});

test("evaluateCandidatePair is order-independent and deterministic across replay", () => {
  const candidateA = {
    discoveryId: "disc:source-1:https://source-1.com/a",
    sourceId: "source-1",
    title: "Service A",
    contentReference: "https://service-a.com",
    is_confidential: false
  };

  const candidateB = {
    discoveryId: "disc:source-2:https://source-2.com/b",
    sourceId: "source-2",
    title: "Service A",
    contentReference: "https://service-a.com",
    is_confidential: false
  };

  const resAB = evaluateCandidatePair(candidateA, candidateB, { at: "2026-08-30T01:00:00Z" });
  const resBA = evaluateCandidatePair(candidateB, candidateA, { at: "2026-08-30T01:00:00Z" });

  assert.strictEqual(resAB.pairId, resBA.pairId);
  assert.strictEqual(resAB.decision, resBA.decision);
  assert.strictEqual(resAB.confidence, resBA.confidence);
});

test("EntityResolutionEngine clusters confirmed matches and manages multi-source membership", () => {
  const engine = new EntityResolutionEngine();

  const candidateA = {
    discoveryId: "disc:src-producthunt:https://producthunt.com/posts/copilot-kit",
    sourceId: "src-producthunt",
    title: "CopilotKit",
    contentReference: "https://copilotkit.ai",
    is_confidential: false,
    metadata: { domain: "copilotkit.ai" }
  };

  const candidateB = {
    discoveryId: "disc:src-trustmrr:https://trustmrr.com/startups/copilotkit",
    sourceId: "src-trustmrr",
    title: "CopilotKit AI",
    contentReference: "https://www.copilotkit.ai",
    is_confidential: false,
    metadata: { domain: "copilotkit.ai" }
  };

  const candidateC = {
    discoveryId: "disc:src-github:https://github.com/copilotkit/copilotkit",
    sourceId: "src-github",
    title: "CopilotKit Core",
    contentReference: "https://copilotkit.ai",
    is_confidential: false,
    metadata: { domain: "copilotkit.ai" }
  };

  // Pair 1: A + B -> CONFIRMED_MATCH -> Creates cluster
  const decAB = engine.resolvePair(candidateA, candidateB, { at: "2026-08-30T01:00:00Z" });
  assert.strictEqual(decAB.decision, ResolutionDecision.CONFIRMED_MATCH);

  const clusterAB = engine.getClusterByCandidateId(candidateA.discoveryId);
  assert.notStrictEqual(clusterAB, null);
  assert.strictEqual(clusterAB.memberIds.length, 2);
  assert.strictEqual(clusterAB.sources.includes("src-producthunt"), true);
  assert.strictEqual(clusterAB.sources.includes("src-trustmrr"), true);

  // Pair 2: B + C -> CONFIRMED_MATCH -> Attaches C to same cluster
  const decBC = engine.resolvePair(candidateB, candidateC, { at: "2026-08-30T01:05:00Z" });
  assert.strictEqual(decBC.decision, ResolutionDecision.CONFIRMED_MATCH);

  const clusterC = engine.getClusterByCandidateId(candidateC.discoveryId);
  assert.strictEqual(clusterC.clusterId, clusterAB.clusterId);
  assert.strictEqual(clusterC.memberIds.length, 3);
  assert.strictEqual(clusterC.sources.length, 3);
  assert.strictEqual(clusterC.sources.includes("src-github"), true);

  // Verify Audit Log
  const events = engine.getAuditEvents();
  assert.strictEqual(events.length >= 4, true);
  assert.strictEqual(events.some((e) => e.eventType === "ENTITY_CLUSTER_CREATED"), true);
  assert.strictEqual(events.some((e) => e.eventType === "ENTITY_CLUSTER_MEMBER_ATTACHED"), true);
});
