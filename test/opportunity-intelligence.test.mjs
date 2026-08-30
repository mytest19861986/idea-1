import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TractionMetricType,
  CompetitorType,
  MarketGapType,
  MonetizationModelType,
  ComplexityDimension,
  createTractionMetric,
  createCompetitorProfile,
  createMarketGapAnalysis,
  createMonetizationAssessment,
  createComplexityDecomposition
} from "../src/analysis/opportunity-intelligence.mjs";

describe("PRODUCT-EXPANSION-001: Comprehensive Opportunity Intelligence Domain Tests", () => {
  it("1. Traction Metric Provenance: Differentiates SOURCE_CLAIM from DERIVED_METRIC with formula", () => {
    const rawARR = createTractionMetric({
      metricType: TractionMetricType.ARR,
      value: 1200000,
      unit: "USD",
      sourceEvidenceIds: ["ev-sec-01"]
    });
    assert.equal(rawARR.classification, "SOURCE_CLAIM");
    assert.equal(rawARR.provenance.isDerived, false);

    const derivedARR = createTractionMetric({
      metricType: TractionMetricType.ARR,
      value: 1200000,
      unit: "USD",
      sourceEvidenceIds: ["ev-mrr-01"],
      formula: "MRR * 12",
      calculationVersion: "v1.0.0"
    });
    assert.equal(derivedARR.classification, "DERIVED_METRIC");
    assert.equal(derivedARR.provenance.isDerived, true);
    assert.equal(derivedARR.provenance.formula, "MRR * 12");
  });

  it("2. Competitor Intelligence: Preserves UNKNOWN when competitor evidence is missing (NO_COMPETITOR_FOUND != NO_COMPETITION)", () => {
    const comp = createCompetitorProfile({
      competitorId: "comp-incumbent-01",
      name: "Stripe",
      type: CompetitorType.INCUMBENT,
      evidenceIds: ["ev-stripe-01"]
    });
    assert.equal(comp.type, "INCUMBENT");
    assert.equal(comp.pricingModel, "UNKNOWN");
    assert.equal(comp.targetSegment, "UNKNOWN");
    assert.equal(comp.hasEvidence, true);
  });

  it("3. Market Gap Analysis: Classifies distinct structured gaps across taxonomy", () => {
    const gapAnalysis = createMarketGapAnalysis({
      opportunityId: "opp-001",
      identifiedGaps: [
        { gapType: MarketGapType.UNDERSERVED_SEGMENT, description: "SMB legal teams lack automated compliance tools" },
        { gapType: MarketGapType.PRICE_GAP, description: "Enterprise solutions cost >$50k/year" }
      ],
      evidenceIds: ["ev-gap-01"]
    });
    assert.equal(gapAnalysis.gapsCount, 2);
    assert.equal(gapAnalysis.gaps[0].gapType, "UNDERSERVED_SEGMENT");
    assert.equal(gapAnalysis.gaps[1].gapType, "PRICE_GAP");
  });

  it("4. Monetization Assessment: Supports structured models with take-rate tracking", () => {
    const monetization = createMonetizationAssessment({
      opportunityId: "opp-001",
      primaryModel: MonetizationModelType.SAAS_SEAT,
      secondaryModels: [MonetizationModelType.USAGE_BASED],
      estimatedTakeRate: "UNKNOWN"
    });
    assert.equal(monetization.primaryModel, "SAAS_SEAT");
    assert.deepEqual([...monetization.secondaryModels], ["USAGE_BASED"]);
    assert.equal(monetization.estimatedTakeRate, "UNKNOWN");
  });

  it("5. Complexity Decomposition: Preserves UNKNOWN dimensions and calculates deterministic average over known dimensions", () => {
    const complexity = createComplexityDecomposition({
      opportunityId: "opp-001",
      dimensionScores: {
        [ComplexityDimension.PRODUCT_COMPLEXITY]: 6,
        [ComplexityDimension.ENGINEERING_COMPLEXITY]: 8,
        [ComplexityDimension.REGULATORY_COMPLEXITY]: 4
      }
    });
    assert.equal(complexity.overallComplexityScore, 6.00); // (6+8+4)/3 = 18/3 = 6.00
    assert.equal(complexity.unknownDimensions.length, 6);
    assert.ok(complexity.unknownDimensions.includes(ComplexityDimension.MARKETPLACE_LIQUIDITY_COMPLEXITY));
  });
});
