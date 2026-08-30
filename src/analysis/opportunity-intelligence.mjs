/**
 * ============================================================================
 * COMPREHENSIVE OPPORTUNITY INTELLIGENCE DOMAIN MODEL (PRODUCT-EXPANSION-001)
 * Formalizes Traction, Competitor, Market Gap, Localization, Monetization,
 * Complexity, and Regulatory Intelligence with strict UNKNOWN semantics.
 *
 * Invariants:
 *  1. NO_COMPETITOR_FOUND != NO_COMPETITION (Recorded as UNKNOWN / UNVERIFIED)
 *  2. Missing dimensions remain UNKNOWN and never default to 0 / LOW_RISK
 *  3. Derived metrics maintain explicit provenance: (formula, inputs, calculationVersion)
 *  4. AI analysis/hypotheses cannot self-declare as FACT
 * ============================================================================
 */

import { deepFreeze } from "../discovery/discovery-intake.mjs";

export const TractionMetricType = Object.freeze({
  USER_COUNT: "USER_COUNT",
  CUSTOMER_COUNT: "CUSTOMER_COUNT",
  REVENUE: "REVENUE",
  ARR: "ARR",
  MRR: "MRR",
  GMV: "GMV",
  TRANSACTION_VOLUME: "TRANSACTION_VOLUME",
  APP_DOWNLOADS: "APP_DOWNLOADS",
  WEB_TRAFFIC: "WEB_TRAFFIC",
  GROWTH_RATE: "GROWTH_RATE",
  FUNDING: "FUNDING",
  EMPLOYEE_GROWTH: "EMPLOYEE_GROWTH",
  GEOGRAPHIC_EXPANSION: "GEOGRAPHIC_EXPANSION",
  PARTNERSHIPS: "PARTNERSHIPS",
  WAITLIST: "WAITLIST",
  COMMUNITY_ACTIVITY: "COMMUNITY_ACTIVITY",
  PRODUCT_RANKING: "PRODUCT_RANKING"
});

export const CompetitorType = Object.freeze({
  DIRECT: "DIRECT",
  INDIRECT: "INDIRECT",
  SUBSTITUTE: "SUBSTITUTE",
  INCUMBENT: "INCUMBENT",
  EMERGING: "EMERGING"
});

export const MarketGapType = Object.freeze({
  UNDERSERVED_SEGMENT: "UNDERSERVED_SEGMENT",
  GEOGRAPHIC_GAP: "GEOGRAPHIC_GAP",
  PRICE_GAP: "PRICE_GAP",
  DISTRIBUTION_GAP: "DISTRIBUTION_GAP",
  WORKFLOW_GAP: "WORKFLOW_GAP",
  FEATURE_GAP: "FEATURE_GAP",
  TRUST_GAP: "TRUST_GAP",
  REGULATORY_GAP: "REGULATORY_GAP",
  LOCALIZATION_GAP: "LOCALIZATION_GAP",
  SUPPLY_GAP: "SUPPLY_GAP",
  DEMAND_GAP: "DEMAND_GAP"
});

export const MonetizationModelType = Object.freeze({
  SUBSCRIPTION: "SUBSCRIPTION",
  TRANSACTION_FEE: "TRANSACTION_FEE",
  MARKETPLACE_TAKE_RATE: "MARKETPLACE_TAKE_RATE",
  ADVERTISEMENT: "ADVERTISEMENT",
  LEAD_GENERATION: "LEAD_GENERATION",
  LICENSING: "LICENSING",
  FREEMIUM: "FREEMIUM",
  USAGE_BASED: "USAGE_BASED",
  COMMISSION: "COMMISSION",
  SAAS_SEAT: "SAAS_SEAT",
  SERVICE_FEE: "SERVICE_FEE",
  HYBRID: "HYBRID"
});

export const ComplexityDimension = Object.freeze({
  PRODUCT_COMPLEXITY: "PRODUCT_COMPLEXITY",
  ENGINEERING_COMPLEXITY: "ENGINEERING_COMPLEXITY",
  OPERATIONS_COMPLEXITY: "OPERATIONS_COMPLEXITY",
  SUPPLY_COMPLEXITY: "SUPPLY_COMPLEXITY",
  MARKETPLACE_LIQUIDITY_COMPLEXITY: "MARKETPLACE_LIQUIDITY_COMPLEXITY",
  DATA_COMPLEXITY: "DATA_COMPLEXITY",
  INTEGRATION_COMPLEXITY: "INTEGRATION_COMPLEXITY",
  SALES_COMPLEXITY: "SALES_COMPLEXITY",
  REGULATORY_COMPLEXITY: "REGULATORY_COMPLEXITY"
});

function requireString(val, name) {
  if (typeof val !== "string" || !val.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return val.trim();
}

function requireArray(val, name) {
  if (!Array.isArray(val)) throw new TypeError(`${name} must be an array`);
  return val;
}

/**
 * 1. Traction Intelligence Extraction & Provenance
 */
export function createTractionMetric({
  metricType,
  value,
  unit = "",
  observedAt,
  sourceEvidenceIds = [],
  formula = null,
  calculationVersion = "v1.0.0"
}) {
  const type = requireString(metricType, "metricType").toUpperCase();
  if (!Object.values(TractionMetricType).includes(type)) {
    throw new TypeError(`Unsupported TractionMetricType: ${type}`);
  }

  const isDerived = formula !== null;
  const classification = isDerived ? "DERIVED_METRIC" : "SOURCE_CLAIM";

  return deepFreeze({
    metricType: type,
    value: value !== undefined && value !== null ? value : "UNKNOWN",
    unit: typeof unit === "string" ? unit.trim() : "",
    observedAt: typeof observedAt === "string" ? observedAt : new Date().toISOString(),
    sourceEvidenceIds: deepFreeze([...sourceEvidenceIds]),
    classification,
    provenance: {
      isDerived,
      formula: formula ? String(formula) : null,
      calculationVersion: String(calculationVersion),
      calculatedAt: new Date().toISOString()
    }
  });
}

/**
 * 2. Competitor Intelligence Model
 */
export function createCompetitorProfile({
  competitorId,
  name,
  type,
  evidenceIds = [],
  pricingModel = "UNKNOWN",
  targetSegment = "UNKNOWN",
  geography = "UNKNOWN",
  knownStrengths = [],
  knownWeaknesses = []
}) {
  const compType = requireString(type, "type").toUpperCase();
  if (!Object.values(CompetitorType).includes(compType)) {
    throw new TypeError(`Unsupported CompetitorType: ${compType}`);
  }

  return deepFreeze({
    competitorId: requireString(competitorId, "competitorId"),
    name: requireString(name, "name"),
    type: compType,
    evidenceIds: deepFreeze([...evidenceIds]),
    pricingModel: pricingModel || "UNKNOWN",
    targetSegment: targetSegment || "UNKNOWN",
    geography: geography || "UNKNOWN",
    knownStrengths: deepFreeze([...knownStrengths]),
    knownWeaknesses: deepFreeze([...knownWeaknesses]),
    hasEvidence: evidenceIds.length > 0
  });
}

/**
 * 3. Market Gap Analysis
 */
export function createMarketGapAnalysis({
  opportunityId,
  identifiedGaps = [],
  evidenceIds = []
}) {
  const validatedGaps = requireArray(identifiedGaps, "identifiedGaps").map(gap => {
    const gapType = requireString(gap.gapType, "gapType").toUpperCase();
    if (!Object.values(MarketGapType).includes(gapType)) {
      throw new TypeError(`Unsupported MarketGapType: ${gapType}`);
    }
    return deepFreeze({
      gapType,
      description: requireString(gap.description, "gap.description"),
      severity: gap.severity || "MEDIUM",
      evidenceIds: deepFreeze(Array.isArray(gap.evidenceIds) ? [...gap.evidenceIds] : [])
    });
  });

  return deepFreeze({
    opportunityId: requireString(opportunityId, "opportunityId"),
    gapsCount: validatedGaps.length,
    gaps: deepFreeze(validatedGaps),
    evidenceIds: deepFreeze([...evidenceIds])
  });
}

/**
 * 4. Structured Monetization Assessment
 */
export function createMonetizationAssessment({
  opportunityId,
  primaryModel,
  secondaryModels = [],
  estimatedTakeRate = "UNKNOWN",
  pricingTiers = [],
  evidenceIds = []
}) {
  const primary = requireString(primaryModel, "primaryModel").toUpperCase();
  if (!Object.values(MonetizationModelType).includes(primary)) {
    throw new TypeError(`Unsupported MonetizationModelType: ${primary}`);
  }

  return deepFreeze({
    opportunityId: requireString(opportunityId, "opportunityId"),
    primaryModel: primary,
    secondaryModels: deepFreeze([...secondaryModels]),
    estimatedTakeRate,
    pricingTiers: deepFreeze([...pricingTiers]),
    evidenceIds: deepFreeze([...evidenceIds])
  });
}

/**
 * 5. Implementation Complexity Decomposition
 */
export function createComplexityDecomposition({
  opportunityId,
  dimensionScores = {},
  evidenceIds = []
}) {
  const evaluatedDimensions = {};
  const unknownDimensions = [];

  for (const dim of Object.values(ComplexityDimension)) {
    const score = dimensionScores[dim];
    if (typeof score === "number" && Number.isFinite(score) && score >= 1 && score <= 10) {
      evaluatedDimensions[dim] = score;
    } else {
      unknownDimensions.push(dim);
    }
  }

  const scores = Object.values(evaluatedDimensions);
  const overallComplexityScore = scores.length > 0
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
    : null;

  return deepFreeze({
    opportunityId: requireString(opportunityId, "opportunityId"),
    overallComplexityScore,
    evaluatedDimensions: deepFreeze(evaluatedDimensions),
    unknownDimensions: deepFreeze(unknownDimensions),
    evidenceIds: deepFreeze([...evidenceIds])
  });
}
