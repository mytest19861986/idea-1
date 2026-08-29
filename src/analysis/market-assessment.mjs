const severityOrder = Object.freeze({ HIGH: 0, MEDIUM: 1, LOW: 2 });

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function normalizeEvidenceIds(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  const evidenceIds = [...new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))].sort();
  if (evidenceIds.length === 0) throw new TypeError(`${field} must contain an evidence id`);
  return Object.freeze(evidenceIds);
}

function normalizeCompetitor(competitor) {
  if (!competitor || typeof competitor !== "object") throw new TypeError("competitor must be an object");
  return Object.freeze({
    name: requireText(competitor.name, "competitor.name"),
    observation: requireText(competitor.observation, "competitor.observation"),
    evidenceIds: normalizeEvidenceIds(competitor.evidenceIds, "competitor.evidenceIds")
  });
}

function normalizeRisk(risk) {
  if (!risk || typeof risk !== "object") throw new TypeError("risk must be an object");
  const severity = requireText(risk.severity, "risk.severity").toUpperCase();
  if (!(severity in severityOrder)) throw new TypeError("risk.severity must be LOW, MEDIUM, or HIGH");
  return Object.freeze({
    description: requireText(risk.description, "risk.description"),
    severity,
    mitigation: requireText(risk.mitigation, "risk.mitigation"),
    evidenceIds: normalizeEvidenceIds(risk.evidenceIds, "risk.evidenceIds")
  });
}

export function createMarketAssessment(input) {
  if (!input || typeof input !== "object") throw new TypeError("input must be an object");
  if (!Array.isArray(input.competitors) || !Array.isArray(input.risks)) throw new TypeError("competitors and risks must be arrays");
  if (!input.mvp || typeof input.mvp !== "object") throw new TypeError("mvp must be an object");
  const competitors = input.competitors.map(normalizeCompetitor).sort((left, right) => left.name.localeCompare(right.name));
  const risks = input.risks.map(normalizeRisk).sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity] || left.description.localeCompare(right.description));
  return Object.freeze({
    schemaVersion: 1,
    opportunityId: requireText(input.opportunityId, "opportunityId"),
    competitors: Object.freeze(competitors),
    risks: Object.freeze(risks),
    mvp: Object.freeze({
      problem: requireText(input.mvp.problem, "mvp.problem"),
      proposition: requireText(input.mvp.proposition, "mvp.proposition"),
      scope: Object.freeze(Array.isArray(input.mvp.scope) ? [...new Set(input.mvp.scope.map((item) => requireText(item, "mvp.scope")))].sort() : (() => { throw new TypeError("mvp.scope must be an array"); })())
    })
  });
}
