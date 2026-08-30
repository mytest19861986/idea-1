import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CryptographicAuthService, UserRole } from "../src/security/auth-boundary-service.mjs";

describe("PRODUCT-EXPANSION-001: RBAC & New Intelligence Confidentiality Tests", () => {
  const auth = new CryptographicAuthService();

  const confidentialOpp = {
    opportunityId: "opp-stealth-77",
    title: "Stealth Autonomous Agent Framework",
    summary: "Proprietary high-margin corporate AI framework",
    isConfidential: true,
    score: 88,
    competitors: [
      { name: "DirectCompetitorX", type: "DIRECT", pricingModel: "$50k/yr", sensitiveIntel: "Planning Q4 acquisition" }
    ],
    citations: [
      { sourceId: "confidential-internal-leak", url: "https://internal-vault.corp/leak" }
    ]
  };

  it("1. VIEWER Role: Strict redaction of confidential opportunity metadata", () => {
    const projected = auth.projectOpportunityForRole(confidentialOpp, UserRole.VIEWER);
    assert.equal(projected.accessState, "REDACTED");
    assert.equal(projected.title, "[CONFIDENTIAL OPPORTUNITY]");
    assert.equal(projected.summary, "[REDACTED - PRIVILEGED ACCESS REQUIRED]");
    assert.equal(projected.competitors, undefined);
  });

  it("2. ANALYST / OPERATOR Role: Full privileged access to confidential intelligence surfaces", () => {
    const projected = auth.projectOpportunityForRole(confidentialOpp, UserRole.ANALYST);
    assert.equal(projected.title, "Stealth Autonomous Agent Framework");
    assert.equal(projected.summary, "Proprietary high-margin corporate AI framework");
    assert.equal(projected.competitors.length, 1);
    assert.equal(projected.competitors[0].name, "DirectCompetitorX");
  });

  it("3. Non-confidential Opportunity: Public safe projection for unprivileged VIEWER", () => {
    const publicOpp = {
      opportunityId: "opp-public-01",
      title: "Open Source AI Support Widget",
      summary: "Public AGPL widget for B2B support",
      isConfidential: false,
      score: 82,
      competitors: [
        { name: "Chatbase", type: "DIRECT", pricingModel: "SaaS", sensitiveIntel: "Internal margin leak" }
      ]
    };

    const projected = auth.projectOpportunityForRole(publicOpp, UserRole.VIEWER);
    assert.equal(projected.title, "Open Source AI Support Widget");
    assert.equal(projected.competitors[0].name, "Chatbase");
    assert.equal(projected.competitors[0].sensitiveIntel, undefined, "Sensitive intel is redacted for VIEWER");
  });
});
