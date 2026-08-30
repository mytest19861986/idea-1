import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CryptographicAuthService, UserRole } from "../src/security/auth-boundary-service.mjs";
import { createOpportunityCandidate, createRegulatoryRiskAssessment, calculateEvidenceFreshness } from "../src/analysis/opportunity-governance.mjs";
import { toPublicOpportunity } from "../src/api/read-contract.mjs";

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

  it("4. TOKEN_REQUIRED_CLAIMS: verifyToken rejects missing required JWT claims", () => {
    const tokenWithoutSub = auth.signToken({ userId: "u1", role: UserRole.VIEWER });
    // Tamper with payload to strip 'sub'
    const parts = tokenWithoutSub.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    delete payload.sub;
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const fakeToken = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

    const res = auth.verifyToken(`Bearer ${fakeToken}`);
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
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

    // When processed through toPublicOpportunity, confidential records must never expose clusterId
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
});
