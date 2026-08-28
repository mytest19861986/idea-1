export const ClaimType = Object.freeze({ FACT: "FACT", DERIVED_METRIC: "DERIVED_METRIC", AI_ANALYSIS: "AI_ANALYSIS", AI_HYPOTHESIS: "AI_HYPOTHESIS", UNKNOWN: "UNKNOWN" });

export function normalizeClaim(input) {
  if (!input || typeof input !== "object") throw new TypeError("claim is required");
  if (typeof input.text !== "string" || input.text.trim() === "") throw new TypeError("claim.text is required");
  const type = typeof input.type === "string" ? input.type.trim().toUpperCase() : "";
  if (!Object.values(ClaimType).includes(type)) throw new TypeError("claim.type is not supported");
  const evidenceIds = Array.isArray(input.evidenceIds) ? input.evidenceIds.map((id) => typeof id === "string" ? id.trim() : "") : [];
  if (evidenceIds.some((id) => id === "")) throw new TypeError("evidenceIds must contain non-empty strings");
  if (type === ClaimType.FACT && evidenceIds.length === 0) throw new TypeError("FACT claims require evidenceIds");
  if ((type === ClaimType.AI_ANALYSIS || type === ClaimType.AI_HYPOTHESIS) && input.verified === true) throw new TypeError("AI claims cannot self-declare verified");
  return Object.freeze({ text: input.text.trim(), type, evidenceIds: Object.freeze(evidenceIds), verified: type === ClaimType.FACT });
}
