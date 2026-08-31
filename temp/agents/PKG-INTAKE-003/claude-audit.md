# PKG-INTAKE-003: Final Audit from Claude Sonnet 5

PKG-INTAKE-003

DECISION: CHANGES_REQUIRED

AUDIT_SUMMARY

The core module correctly implements the stated invariants on inspection: source-state gating is strict (APPROVED/ACTIVE only), SOURCE_CLAIM is hard-overwritten and cannot be promoted to FACT by attacker-supplied input, discovery IDs are deterministic, and there are no DB writes or network calls. However, the checklist claims several invariants as "verified" that the test suite does not actually exercise, and there is one real gap in the confidentiality-isolation logic. This should not ship as fully verified until the tests and the metadata-leak gap are addressed.

INVARIANT_FINDINGS

Duplicate replay & idempotency — NOT TESTED (Finding, Medium)
computeDeterministicDiscoveryId is proven deterministic in isolation, but there is no test that calls processDiscoveryIntake twice with the same rawDoc/sourceRecord and asserts the two results (discoveryId, idempotencyKey, auditEvent) are identical end-to-end. The checklist lists this as an audited item; it isn't actually covered at the integration level.
Source lifecycle bypass — PASS. isSourceEligibleForIntake is a strict allow-list of APPROVED/ACTIVE; all other states tested and rejected.
SOURCE_CLAIM → FACT promotion — PASS. claim_type: "SOURCE_CLAIM" is set after the spread of rawDoc.metadata.financials, so caller-supplied claim_type values are always overwritten. Confirmed by test.
Provenance preservation — PASS, with a caveat: freezing is shallow. Object.freeze(discoveryRecord) and Object.freeze(provenance) prevent reassigning those object's own properties, but any nested mutable object drawn from rawDoc.metadata (other than financials, which is separately frozen) is not deep-frozen and remains mutable post-intake. Low severity, but worth a follow-up freeze-deep utility if downstream code is untrusted.
Confidential entity isolation — PARTIAL (Finding, Medium/High)
contentReference is correctly nulled at the top level when is_confidential is true, and the test for TRUSTMRR-G003 confirms this. But metadata: Object.freeze({...rawDoc.metadata, ...}) spreads the entire raw metadata object through verbatim except for financials and is_confidential. If a collector places a sensitive reference under any other metadata key (e.g. metadata.sourceDomain, metadata.contactUrl, metadata.rawHtmlRef), it passes straight into the frozen candidate record even when is_confidential: true. The isolation guarantee as documented ("confidential entity isolation") is narrower than it reads — it isolates one named field, not the metadata surface generally. Needs either an explicit metadata allow-list/sanitizer for the confidential path, or the invariant's scope should be documented as "contentReference only."
TrustMRR-specific coupling — PASS. No hardcoded source IDs, URLs, or trust-specific branching; the module is generic.
Nondeterministic IDs — PASS. disc:{sourceId}:{canonicalUrl} format confirmed deterministic and stable across calls.
Hidden database mutation — PASS. Pure function, no I/O.
Hidden network requests — PASS. No fetch/network calls; only new URL() parsing (no I/O).
Accidental activation — PASS. sourceRecord is read-only input; nothing in this module mutates or persists source lifecycle state.
Untested error branches (Finding, Low/Medium): SOURCE_NOT_REGISTERED and SOURCE_MISMATCH paths have no corresponding tests, despite being reachable, audit-logged branches with distinct status values. These should be covered before sign-off, since they're part of the security-relevant control flow (a caller passing a mismatched or missing sourceRecord is exactly the class of bug this gate exists to catch).

Required before APPROVED:

Add tests for SOURCE_NOT_REGISTERED, SOURCE_MISMATCH, and a same-input replay/idempotency check.
Either sanitize/allow-list metadata fields on the confidential path (not just contentReference), or explicitly narrow and document the confidentiality invariant's scope so downstream consumers aren't relying on a broader guarantee than the code provides.

No blocking security defects were found in the reachable, tested code paths — the two items above are what keep this at CHANGES_REQUIRED rather than APPROVED.






just now
Want to be notified when Claude responds?
Notify

Write a message…







Claude is AI and can make mistakes. Please double-check responses.
Sonnet 5 Low