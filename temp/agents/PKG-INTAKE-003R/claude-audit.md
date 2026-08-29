# PKG-INTAKE-003R: Final Audit from Claude Sonnet 5

PKG-INTAKE-003R

DECISION: CHANGES_REQUIRED

AUDIT_SUMMARY

This revision closes both gaps from PKG-INTAKE-003 (untested error branches, narrow confidentiality isolation) and adds real hardening: mandatory processedAt, strict ISO validation, recursive deepFreeze, and recursive confidential-key sanitization, all backed by new tests including an end-to-end idempotency/replay check. However, the refactor introduces a new, untested provenance-injection vector that directly undermines the "no provenance fabrication" and "audit determinism" invariants this package claims to guarantee, plus a smaller gap in the ISO timestamp validator's calendar check for offset timestamps. Neither is caught by the existing test suite.

INVARIANT_FINDINGS

Provenance fabrication via rawDoc.provenance spread — FAIL (Finding, High)

js
const provenance = {
  collectorId: rawDoc.collectorId ?? null,
  ...
  intakeProcessedAt: validatedProcessedAt,
  ...(rawDoc.provenance ?? {})   // <-- spread last, silently overrides everything above
};

Because the caller-supplied rawDoc.provenance object is spread after the computed fields, any key a caller includes there — collectorId, discoveredAt, retrievedAt, or even intakeProcessedAt — silently overwrites the validated/computed value. This means:

A caller can spoof intakeProcessedAt to a value different from the actually-validated processedAt, breaking the "deterministic, no wall-clock, single source of truth for time" guarantee this same PR was written to enforce.
A caller can inject arbitrary verified_by/verified_status-style fields (or anything else) into provenance with no validation, effectively fabricating provenance — the exact behavior FINDING-002 in this PR was meant to prevent.
None of the new tests pass a rawDoc.provenance value, so this path is completely uncovered.

Fix: either drop support for caller-supplied provenance entirely (nothing in the intake contract calls for it), or spread it before the computed fields so the computed values always win, and validate/allowlist whatever keys are permitted through.

ISO timestamp calendar validation skipped for offset timestamps — FAIL (Finding, Medium)

js
if (match[8] === undefined || match[8] === "Z") {
  // round-trip calendar check
}

The exact calendar round-trip check (which catches things like 2026-02-31) only runs when there's no offset or the offset is Z. A timestamp like 2026-02-31T00:00:00+05:00 matches the regex, new Date(...) parses it without NaN (JS rolls it forward to March), and the round-trip check is skipped entirely — so an invalid calendar date is silently accepted for any non-UTC offset. This weakens the "real ISO timestamp validation with exact calendar date checking" claim in the checklist to "UTC-only." Not directly exploitable for data corruption given how these timestamps are used, but it's a correctness gap in a function whose whole purpose is stricter validation, and it's untested for offset inputs.

SENSITIVE_CONFIDENTIAL_KEYS is a denylist, not an allowlist — PASS with caveat (Low)
Recursive sanitization is a real improvement and well-tested (nested objects, arrays), but it works by blocking a fixed set of key names (domain, websiteUrl, contactUrl, etc.). Any future collector that stores a sensitive reference under an unlisted key (homepage, link, profileUrl, sourceLink, …) passes straight into a is_confidential: true record. This is the same class of gap as before, just narrower now. Consider inverting to an explicit allowlist of permitted metadata keys on the confidential path, since denylists of this kind reliably miss future field names.
No SOURCE_CLAIM → FACT path — PASS. The financials/claim_type handling has been removed entirely from this generic module (confirmed by the new "source-agnostic" test asserting financials === undefined), so the promotion risk is moot here. Note this is a functional scope change from PKG-INTAKE-003 — if TrustMRR-specific claim-type enforcement is still required somewhere, confirm it now lives in a source-specific layer on top of this generic intake, not silently dropped.
No hidden wall-clock dependency — PASS. processedAt is mandatory and validated; INVALID_PROCESSED_AT branch is tested for both missing and malformed input.
No provenance fabrication (collectorId/collectorVersion defaults) — PASS for the specific defaults tested, but see Finding 1 — the broader guarantee is bypassable via rawDoc.provenance.
Source lifecycle bypass — PASS. Gating logic unchanged and still strictly tested (SOURCE_NOT_REGISTERED, SOURCE_MISMATCH, SOURCE_INELIGIBLE all now covered — this closes the PKG-INTAKE-003 gap).
Deterministic IDs / idempotency — PASS. computeDeterministicDiscoveryId unchanged; end-to-end replay test (assert.deepStrictEqual(run1, run2)) now genuinely closes the PKG-INTAKE-003 gap on integration-level idempotency.
Deep immutability — PASS. deepFreeze is applied to the full return value and tests confirm mutation attempts throw on nested discoveryRecord, provenance, and metadata.
Hidden DB/network I/O — PASS. Still a pure function; no I/O introduced.
Accidental activation — PASS. No mutation of sourceRecord or lifecycle state.

Required before APPROVED:

Fix the rawDoc.provenance spread ordering (or remove caller-supplied provenance support) and add a test asserting that a caller-supplied provenance.intakeProcessedAt (or other computed field) cannot override the validated/computed value.
Extend validateIsoTimestamp's calendar round-trip check to cover non-Z offset timestamps, or explicitly document/test that offset timestamps get reduced validation.
Optional but recommended: convert SENSITIVE_CONFIDENTIAL_KEYS to an allowlist-based sanitizer for the confidential path to avoid reliance on an ever-growing denylist.

This is close — the two required fixes are narrow and don't require restructuring the module, but Finding 1 is a genuine integrity gap that contradicts a headline claim of this exact PR, so it should not pass as APPROVED without a fix and a regression test.

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