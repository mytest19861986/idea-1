/**
 * ============================================================================
 * VERSIONED DETERMINISTIC SCORING ENGINE (PRODUCT-EXPANSION-001)
 * Enforces strict mathematical determinism, version reproducibility, and
 * complete separation between Opportunity Score and Evidence Confidence.
 *
 * Invariants:
 *  1. Identical inputs + same scoringVersion -> Identical score output (100% deterministic)
 *  2. Changing natural language / AI summaries -> Zero change in mathematical score
 *  3. UNKNOWN fields are never collapsed to 0; they are tracked in unknownFactors
 *  4. Opportunity Score (0-100) and Evidence Confidence (0-100) are separate metrics
 *  5. Versioned scoring models (e.g. v1.0.0, v2.0.0) produce distinct traceable outputs
 * ============================================================================
 */

export const SCORING_MODEL_VERSIONS = Object.freeze({
  V1_BALANCED: "v1.0.0-balanced",
  V2_TRACTION_HEAVY: "v2.0.0-traction-heavy"
});

const MODEL_DEFINITIONS = Object.freeze({
  [SCORING_MODEL_VERSIONS.V1_BALANCED]: Object.freeze({
    weights: Object.freeze({
      demandStrength: 30,
      tractionVelocity: 25,
      marketDefensibility: 25,
      executionFeasibility: 20
    }),
    version: SCORING_MODEL_VERSIONS.V1_BALANCED
  }),
  [SCORING_MODEL_VERSIONS.V2_TRACTION_HEAVY]: Object.freeze({
    weights: Object.freeze({
      demandStrength: 20,
      tractionVelocity: 45,
      marketDefensibility: 20,
      executionFeasibility: 15
    }),
    version: SCORING_MODEL_VERSIONS.V2_TRACTION_HEAVY
  })
});

function requireFiniteBounded(val, name, min = 0, max = 100) {
  if (val === undefined || val === null) return null; // Preserve UNKNOWN
  if (typeof val !== "number" || !Number.isFinite(val) || val < min || val > max) {
    throw new TypeError(`${name} must be a number between ${min} and ${max}, or null/undefined for UNKNOWN`);
  }
  return val;
}

/**
 * Computes deterministic opportunity score and independent confidence rating.
 */
export function calculateDeterministicOpportunityScore({
  opportunityId,
  demandStrength,
  tractionVelocity,
  marketDefensibility,
  executionFeasibility,
  evidenceRecords = [],
  scoringVersion = SCORING_MODEL_VERSIONS.V1_BALANCED
}) {
  if (!opportunityId || typeof opportunityId !== "string") {
    throw new TypeError("opportunityId is required");
  }

  const modelDef = MODEL_DEFINITIONS[scoringVersion];
  if (!modelDef) {
    throw new TypeError(`Unsupported scoringModelVersion: ${scoringVersion}`);
  }

  const rawFactors = {
    demandStrength: requireFiniteBounded(demandStrength, "demandStrength"),
    tractionVelocity: requireFiniteBounded(tractionVelocity, "tractionVelocity"),
    marketDefensibility: requireFiniteBounded(marketDefensibility, "marketDefensibility"),
    executionFeasibility: requireFiniteBounded(executionFeasibility, "executionFeasibility")
  };

  const knownFactors = {};
  const unknownFactors = [];

  for (const [key, val] of Object.entries(rawFactors)) {
    if (val === null) {
      unknownFactors.push(key);
    } else {
      knownFactors[key] = val;
    }
  }

  // 1. Calculate deterministic score over known factors with normalized dynamic weights
  let weightedScoreSum = 0;
  let activeWeightSum = 0;
  const factorContributions = [];

  for (const [factor, weight] of Object.entries(modelDef.weights)) {
    const val = knownFactors[factor];
    if (val !== undefined) {
      const weightedVal = (val * weight);
      weightedScoreSum += weightedVal;
      activeWeightSum += weight;
      factorContributions.push({
        factor,
        value: val,
        assignedWeight: weight,
        status: "EVALUATED"
      });
    } else {
      factorContributions.push({
        factor,
        value: null,
        assignedWeight: weight,
        status: "UNKNOWN"
      });
    }
  }

  const finalScore = activeWeightSum === 0
    ? null
    : Number((weightedScoreSum / activeWeightSum).toFixed(2));

  // 2. Separate Evidence Confidence Calculation
  let calculatedConfidence = 0;
  if (Array.isArray(evidenceRecords) && evidenceRecords.length > 0) {
    const validConfidences = evidenceRecords
      .map(e => typeof e.confidence === "number" ? e.confidence : null)
      .filter(c => c !== null);

    if (validConfidences.length > 0) {
      const avgConf = validConfidences.reduce((a, b) => a + b, 0) / validConfidences.length;
      // Corroboration bonus for multi-domain evidence (max 100)
      const domains = new Set(evidenceRecords.map(e => e.sourceId || e.url || ""));
      const multiSourceBonus = Math.min(15, (domains.size - 1) * 7.5);
      calculatedConfidence = Math.min(100, Number((avgConf + multiSourceBonus).toFixed(2)));
    }
  }

  return Object.freeze({
    opportunityId: opportunityId.trim(),
    scoringModelVersion: scoringVersion,
    opportunityScore: finalScore,
    evidenceConfidence: calculatedConfidence,
    isCompleteEvaluation: unknownFactors.length === 0,
    evaluatedFactors: Object.freeze(knownFactors),
    unknownFactors: Object.freeze(unknownFactors),
    contributions: Object.freeze(factorContributions),
    timestamp: new Date().toISOString()
  });
}
