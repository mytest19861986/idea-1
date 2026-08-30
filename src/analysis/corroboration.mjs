/**
 * ============================================================================
 * CORROBORATION & CONTRADICTION ENGINE (PRODUCT-EXPANSION-001)
 * Preserves multi-source independence and records contradictions explicitly.
 *
 * Invariants:
 *  1. FACT != SOURCE_CLAIM != DERIVED_METRIC != AI_ANALYSIS != AI_HYPOTHESIS != UNKNOWN
 *  2. Mirror domains / same publisher != Independent Corroboration
 *  3. Conflicting values -> CONTRADICTION status (Never average conflicting facts)
 *  4. UNKNOWN != 0 (Preserved strictly when evidence is absent)
 * ============================================================================
 */

export const EvidenceClass = Object.freeze({
  FACT: "FACT",
  SOURCE_CLAIM: "SOURCE_CLAIM",
  DERIVED_METRIC: "DERIVED_METRIC",
  AI_ANALYSIS: "AI_ANALYSIS",
  AI_HYPOTHESIS: "AI_HYPOTHESIS",
  UNKNOWN: "UNKNOWN"
});

export const CorroborationStatus = Object.freeze({
  UNCONFIRMED: "UNCONFIRMED",
  CORROBORATED: "CORROBORATED",
  CONTRADICTION: "CONTRADICTION",
  UNKNOWN: "UNKNOWN"
});

function requireString(val, name) {
  if (typeof val !== "string" || !val.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return val.trim();
}

function extractDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return urlStr;
  }
}

/**
 * Evaluates corroboration status across independent sources.
 * Detects domain clustering (e.g. mirror articles) and explicit numeric/logical contradictions.
 */
export function evaluateCorroboration({
  claimText,
  evidenceItems = [],
  metricExtractor = null
}) {
  if (!Array.isArray(evidenceItems)) throw new TypeError("evidenceItems must be an array");

  if (evidenceItems.length === 0) {
    return Object.freeze({
      claimText: requireString(claimText, "claimText"),
      status: CorroborationStatus.UNKNOWN,
      independentSourcesCount: 0,
      domains: Object.freeze([]),
      contradictions: Object.freeze([]),
      isCorroborated: false,
      evidenceClass: EvidenceClass.UNKNOWN
    });
  }

  // 1. Group evidence by independent origin domains
  const domainMap = new Map();
  for (const item of evidenceItems) {
    const domain = extractDomain(item.url || item.sourceId || "unknown");
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain).push(item);
  }

  const independentDomains = [...domainMap.keys()];
  const contradictions = [];

  // 2. Contradiction Detection across claims/metrics
  if (metricExtractor && typeof metricExtractor === "function") {
    const extractedValues = [];
    for (const [domain, items] of domainMap.entries()) {
      for (const item of items) {
        const val = metricExtractor(item);
        if (val !== undefined && val !== null) {
          extractedValues.push({ domain, val, note: item.note || "" });
        }
      }
    }

    if (extractedValues.length >= 2) {
      // Check for numeric dispersion or logical mismatch
      const distinctVals = new Set(extractedValues.map(v => typeof v.val === "number" ? Math.round(v.val * 100) / 100 : v.val));
      if (distinctVals.size > 1) {
        contradictions.push({
          type: "METRIC_VALUE_MISMATCH",
          details: `Conflicting values observed across sources: ${extractedValues.map(e => `${e.domain}=${e.val}`).join(", ")}`,
          conflictingEntries: extractedValues
        });
      }
    }
  }

  // 3. Status determination
  let status = CorroborationStatus.UNCONFIRMED;
  if (contradictions.length > 0) {
    status = CorroborationStatus.CONTRADICTION;
  } else if (independentDomains.length >= 2) {
    status = CorroborationStatus.CORROBORATED;
  }

  return Object.freeze({
    claimText: requireString(claimText, "claimText"),
    status,
    independentSourcesCount: independentDomains.length,
    domains: Object.freeze(independentDomains),
    contradictions: Object.freeze(contradictions),
    isCorroborated: status === CorroborationStatus.CORROBORATED,
    hasContradiction: status === CorroborationStatus.CONTRADICTION
  });
}
