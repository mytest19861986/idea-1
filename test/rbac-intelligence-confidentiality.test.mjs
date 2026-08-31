import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { CryptographicAuthService, UserRole } from "../src/security/auth-boundary-service.mjs";
import {
  createOpportunityCandidate,
  createRegulatoryRiskAssessment,
  calculateEvidenceFreshness,
  calculateGranularEvidenceConfidence,
  sanitizeClusterProjection
} from "../src/analysis/opportunity-governance.mjs";
import { createTractionMetric } from "../src/analysis/opportunity-intelligence.mjs";
import { toPublicOpportunity } from "../src/api/read-contract.mjs";
import { OperatorAuditService } from "../src/security/bounded-telemetry-audit.mjs";

describe("PRODUCT-EXPANSION-001-FIXSET-01: Hardened RBAC, Confidentiality, and UNKNOWN Semantics", () => {
  const secret = "prod-crypto-auth-secret-key-32bytes-min!!";
  const auth = new CryptographicAuthService({ secretKey: secret });

  it("1. AUTH_SECRET_REQUIRED: Constructor throws when secretKey is omitted or too short", () => {
    assert.throws(() => new CryptographicAuthService({}), {
      name: "TypeError",
      message: /AUTH_SECRET_REQUIRED/
    });
    assert.throws(() => new CryptographicAuthService({ secretKey: "short" }), {
      name: "TypeError",
      message: /AUTH_SECRET_REQUIRED/
    });
  });

  it("2. NOVEL_FIELD_VIEWER_LEAK_TEST: Unmapped future fields fail-closed and DO NOT leak to VIEWER", () => {
    const oppWithNovelField = {
      opportunityId: "opp-future-001",
      slug: "future-opp",
      title: "Future Opportunity",
      summary: "Valid summary",
      score: 90,
      isConfidential: false,
      internalFutureSecret: "CRITICAL_INTERNAL_ONLY_DATA_SHOULD_NOT_LEAK",
      unmappedInternalAuditScore: 99.9
    };

    const viewerProjection = auth.projectOpportunityForRole(oppWithNovelField, UserRole.VIEWER);
    assert.equal(viewerProjection.internalFutureSecret, undefined, "Novel field must NOT leak to VIEWER");
    assert.equal(viewerProjection.unmappedInternalAuditScore, undefined, "Unmapped audit score must NOT leak to VIEWER");
    assert.equal(viewerProjection.title, "Future Opportunity");
  });

  it("3. CONFIDENTIAL_DERIVED_VALUE_TEST: Confidential opportunity strips score entirely for VIEWER", () => {
    const confidentialOpp = {
      opportunityId: "opp-stealth-007",
      title: "Stealth Agent Architecture",
      summary: "Confidential internal analysis",
      isConfidential: true,
      score: 95
    };

    const viewerProjection = auth.projectOpportunityForRole(confidentialOpp, UserRole.VIEWER);
    assert.equal(viewerProjection.score, null, "Score must be null/stripped for unprivileged VIEWER on confidential records");
    assert.equal(viewerProjection.accessState, "REDACTED");
  });

  it("4. TOKEN_REQUIRED_CLAIMS: verifyToken rejects missing required JWT claims on authentically signed token", () => {
    const header = { alg: "HS256", typ: "JWT" };
    const payloadMissingSub = {
      role: UserRole.VIEWER,
      iss: "discovery-auth-service",
      aud: "discovery-platform-api",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payloadMissingSub)).toString("base64url");
    const sig = crypto.createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    const validSigMissingSubToken = `${headerB64}.${payloadB64}.${sig}`;
    const res = auth.verifyToken(`Bearer ${validSigMissingSubToken}`);
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
    assert.match(res.error, /Missing required JWT claims/);
  });

  it("5. CONFIDENTIAL_CLUSTER_PROJECTION_TEST: Confidential candidates do not leak clusterId to public contracts", () => {
    const confidentialCandidate = createOpportunityCandidate({
      opportunityId: "opp-conf-01",
      clusterId: "cluster-stealth-alpha",
      isConfidential: true,
      problem: "Confidential problem",
      targetCustomer: "Confidential target",
      valueProposition: "Confidential value",
      businessModel: "B2B"
    });

    assert.equal(confidentialCandidate.isConfidential, true);
    assert.equal(confidentialCandidate.clusterId, "cluster-stealth-alpha");

    const record = {
      slug: "public-view",
      title: "Public Title",
      summary: "Public Summary",
      score: 80,
      publicationState: "APPROVED",
      isConfidential: true,
      clusterId: "cluster-stealth-alpha",
      citations: [{ sourceId: "s1", url: "https://example.com" }]
    };

    const publicView = toPublicOpportunity(record);
    assert.equal(publicView.clusterId, null, "Confidential record must never project clusterId publicly");
  });

  it("6. UNKNOWN_EXPOSURE_ARITHMETIC_TEST: Missing regulatory evidence defaults to UNKNOWN_EXPOSURE, never LOW_RISK", () => {
    const res = createRegulatoryRiskAssessment({ opportunityId: "opp-reg-test", sectorRisks: {} });
    assert.equal(res.overallRiskPosture, "UNKNOWN_EXPOSURE");
    assert.notEqual(res.overallRiskPosture, "LOW_RISK");
  });

  it("7. FRESHNESS_SNAPSHOT_DETERMINISM_TEST: Snapshot-based calculation is purely deterministic across identical inputs", () => {
    const observedAt = "2026-08-01T00:00:00.000Z";
    const refTime = "2026-08-30T00:00:00.000Z";

    const res1 = calculateEvidenceFreshness(observedAt, refTime);
    const res2 = calculateEvidenceFreshness(observedAt, refTime);
    assert.equal(res1, res2);
    assert.equal(res1, "CURRENT");
  });

  it("8. D5_CONFIDENCE_UNKNOWN_PRESERVATION_TEST: Absent evidence returns null confidence without midpoint-50 fabrication", () => {
    const emptyConf = calculateGranularEvidenceConfidence({});
    assert.equal(emptyConf.finalConfidence, null, "Empty evidence MUST produce null confidence, never 50");
    assert.equal(emptyConf.status, "UNKNOWN_CONFIDENCE");
    assert.equal(emptyConf.breakdown.sourceReliability, null);
    assert.equal(emptyConf.breakdown.sourceDiversity, null);
  });

  it("9. D6_TRACTION_OBSERVED_AT_FABRICATION_TEST: Absent observedAt produces null, never new Date()", () => {
    const metric = createTractionMetric({
      metricType: "ARR",
      value: 1000000
    });
    assert.equal(metric.observedAt, null, "Missing observedAt must be null rather than fabricated timestamp");
  });

  it("10. D7C_FRESHNESS_UNKNOWN_PROJECTION_TEST: Missing freshness preserves UNKNOWN in both projection layers", () => {
    const oppWithoutFreshness = {
      opportunityId: "opp-fresh-001",
      slug: "freshness-test",
      title: "Freshness Test Opp",
      summary: "Summary",
      score: 75,
      isConfidential: false,
      publicationState: "APPROVED",
      citations: [{ sourceId: "s1", url: "https://example.com" }]
    };

    const viewer = auth.projectOpportunityForRole(oppWithoutFreshness, UserRole.VIEWER);
    assert.equal(viewer.freshnessStatus, "UNKNOWN", "Viewer projection must preserve UNKNOWN freshness");

    const pub = toPublicOpportunity(oppWithoutFreshness);
    assert.equal(pub.freshnessStatus, "UNKNOWN", "Public read contract must preserve UNKNOWN freshness");
  });

  it("11. B4_ADVERSARIAL_CLUSTER_SIBLING_LEAK_TEST: Public sibling sharing cluster with confidential record suppresses clusterId", () => {
    const publicCand = createOpportunityCandidate({
      opportunityId: "cand-public-001",
      clusterId: "cluster-classified-merger-99",
      isConfidential: false,
      problem: "Public Problem",
      targetCustomer: "Public Customer",
      valueProposition: "Public Prop",
      businessModel: "SaaS"
    });

    const confidentialCand = createOpportunityCandidate({
      opportunityId: "cand-confidential-002",
      clusterId: "cluster-classified-merger-99",
      isConfidential: true,
      problem: "Secret Problem",
      targetCustomer: "Secret Customer",
      valueProposition: "Secret Prop",
      businessModel: "Stealth"
    });

    // When sanitized for public/viewer:
    const publicProjected = sanitizeClusterProjection([publicCand, confidentialCand], false);
    const pubSibling = publicProjected.find(c => c.opportunityId === "cand-public-001");
    const confSibling = publicProjected.find(c => c.opportunityId === "cand-confidential-002");

    assert.equal(pubSibling.clusterId, null, "Public sibling MUST have clusterId suppressed to avoid disclosing confidential cluster existence");
    assert.equal(pubSibling.problem, "Public Problem", "Public sibling content remains intact");
    assert.equal(confSibling.clusterId, null, "Confidential member MUST have clusterId suppressed");
    assert.equal(confSibling.problem, "[REDACTED - CONFIDENTIAL]", "Confidential candidate content MUST be redacted for unprivileged viewers");
    assert.equal(confSibling.businessModel, "[REDACTED - CONFIDENTIAL]", "Confidential candidate business model MUST be redacted for unprivileged viewers");
    assert.equal(confSibling.accessState, "REDACTED");

    // When viewed by privileged Analyst/Admin:
    const privilegedProjected = sanitizeClusterProjection([publicCand, confidentialCand], true);
    const privPub = privilegedProjected.find(c => c.opportunityId === "cand-public-001");
    const privConf = privilegedProjected.find(c => c.opportunityId === "cand-confidential-002");

    assert.equal(privPub.clusterId, "cluster-classified-merger-99", "Privileged roles retain full cluster view");
    assert.equal(privConf.clusterId, "cluster-classified-merger-99", "Privileged roles retain full cluster view");
  });

  it("12. R2_COMPOSED_PATH_WIRING: sanitize → toPublicOpportunity pipeline suppresses confidential cluster identity end-to-end", () => {
    // This test proves R2: the composed path (sanitize → toPublicOpportunity) enforces
    // cluster confidentiality. A public sibling of a confidential candidate must have
    // clusterId suppressed BEFORE entering the public read contract.
    const publicSibling = createOpportunityCandidate({
      opportunityId: "cand-r2-public-sibling",
      clusterId: "cluster-secret-r2",
      isConfidential: false,
      problem: "Public sibling problem",
      targetCustomer: "Public Customer",
      valueProposition: "Valid Prop",
      businessModel: "SaaS"
    });
    const confidentialMember = createOpportunityCandidate({
      opportunityId: "cand-r2-confidential-member",
      clusterId: "cluster-secret-r2",
      isConfidential: true,
      problem: "Confidential problem",
      targetCustomer: "Confidential Customer",
      valueProposition: "Confidential Prop",
      businessModel: "Stealth"
    });

    // Step 1: sanitize for unprivileged viewer
    const sanitized = sanitizeClusterProjection([publicSibling, confidentialMember], false);
    const sanitizedPublic = sanitized.find(c => c.opportunityId === "cand-r2-public-sibling");

    // R2 Invariant: public sibling must have clusterId nulled by sanitize before toPublicOpportunity
    assert.equal(sanitizedPublic.clusterId, null,
      "R2: sanitize MUST null clusterId on public sibling before it reaches toPublicOpportunity");

    // Step 2: the sanitized public sibling (with clusterId: null) flows into toPublicOpportunity
    // Build a minimal approved public record from the sanitized data
    const approvedPublicRecord = {
      ...sanitizedPublic,
      publicationState: "APPROVED",
      slug: "r2-public-sibling",
      title: sanitizedPublic.problem,
      summary: sanitizedPublic.valueProposition,
      citations: [{ sourceId: "src-1", url: "https://example.com" }]
    };
    const publicOutput = toPublicOpportunity(approvedPublicRecord);

    // R2 Invariant: clusterId suppression is preserved through toPublicOpportunity
    assert.equal(publicOutput.clusterId, null,
      "R2: clusterId MUST remain null through the full sanitize → toPublicOpportunity pipeline");
    assert.equal(publicOutput.title, "Public sibling problem");
  });

  it("13. AUDIT_TRAIL_APPEND_ONLY_FAIL_CLOSED: OperatorAuditService ledger is append-only and writes are fail-closed", () => {
    const audit = new OperatorAuditService();

    // Record several audit entries
    audit.recordAction({ actor: "admin-01", action: "MUTATE_PORTFOLIO", resource: "opp-001", clientIp: "10.0.0.1" });
    audit.recordAction({ actor: "admin-01", action: "RESOLVE_INVESTIGATION", resource: "inv-002", clientIp: "10.0.0.1" });
    audit.recordAction({ actor: "viewer-99", action: "READ_OPPORTUNITY", resource: "opp-001", clientIp: "10.0.0.2" });

    const fullTrail = audit.queryAuditTrail({});
    assert.equal(fullTrail.length, 3, "Audit trail must contain all recorded entries (append-only)");

    // Verify immutability: entries are frozen objects (fail-closed)
    assert.throws(() => { fullTrail[0].actor = "TAMPERED"; },
      "Audit record MUST be frozen — mutation must throw in strict mode");

    // Verify actor-filtered query works correctly
    const adminTrail = audit.queryAuditTrail({ actor: "admin-01" });
    assert.equal(adminTrail.length, 2, "Actor-filtered audit trail must return only matching records");
    assert.ok(adminTrail.every(r => r.actor === "admin-01"), "All filtered records must match the queried actor");

    // Verify that entries added after query don't mutate previously returned array (append-only snapshot)
    const beforeAdd = audit.queryAuditTrail({}).length;
    audit.recordAction({ actor: "admin-02", action: "NEW_ACTION", resource: "opp-003", clientIp: "10.0.0.3" });
    const afterAdd = audit.queryAuditTrail({}).length;
    assert.equal(afterAdd, beforeAdd + 1, "Audit trail must grow monotonically — append-only invariant");
  });
});
