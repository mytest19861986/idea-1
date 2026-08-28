const criteria = Object.freeze([
  "relevance",
  "evidenceQuality",
  "reliability",
  "uniqueness",
  "freshness",
  "accessibility"
]);

const MIN_APPROVAL_SCORE = 70;
const MIN_ACCESSIBILITY = 60;

function assertScore(name, value) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new TypeError(`${name} must be a number from 0 to 100`);
  }
}

export function evaluateSourceCandidate(input) {
  if (!input || typeof input !== "object") throw new TypeError("candidate input is required");
  const scores = Object.fromEntries(criteria.map((name) => {
    const value = input[name];
    assertScore(name, value);
    return [name, value];
  }));

  const score = Math.round(criteria.reduce((total, name) => total + scores[name], 0) / criteria.length);
  const reasons = [];
  if (scores.accessibility < MIN_ACCESSIBILITY) reasons.push("ACCESSIBILITY_BELOW_MINIMUM");
  if (score < MIN_APPROVAL_SCORE) reasons.push("QUALITY_SCORE_BELOW_MINIMUM");
  if (input.duplicateRisk === true) reasons.push("DUPLICATE_OR_OVERLAPPING_SOURCE");
  if (input.policyAllowed !== true) reasons.push("POLICY_OR_ACCESS_REVIEW_REQUIRED");

  const eligibleForApproval = reasons.length === 0;
  return Object.freeze({
    score,
    scores: Object.freeze(scores),
    eligibleForApproval,
    proposedStatus: eligibleForApproval ? "APPROVED" : "REJECTED",
    productionActivation: "REQUIRES_GOVERNANCE_APPROVAL",
    reasons: Object.freeze(reasons)
  });
}
