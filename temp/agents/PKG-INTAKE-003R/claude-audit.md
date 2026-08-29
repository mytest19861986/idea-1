# PKG-INTAKE-003R: Final Audit from Claude Sonnet 5

PKG-INTAKE-003R (Finding Resolution)

DECISION: APPROVED

AUDIT_SUMMARY

Both findings from the prior review are correctly fixed and each is backed by a specific regression test. Provenance is now built entirely from validated/computed fields with no caller-writable spread, closing the spoofing vector. validateIsoTimestamp's calendar check now runs unconditionally via Date.UTC(year, month-1, day) against the parsed parts, independent of offset, closing the offset-timestamp gap. The denylist-based confidentiality sanitizer remains a denylist (noted below as a residual, non-blocking observation), but is otherwise correctly recursive and now covers more key variants. No new defects introduced by this change. Full invariant set re-verified against this commit.

INVARIANT_FINDINGS

Provenance spoofing (prior High finding) — RESOLVED. rawDoc.provenance is no longer spread into the constructed provenance object at all — it's built purely from rawDoc.collectorId, rawDoc.collectorVersion, rawDoc.discoveredAt, rawDoc.retrievedAt, and validatedProcessedAt. The new test explicitly attempts to spoof intakeProcessedAt and collectorId via rawDoc.provenance and confirms both are ignored in favor of the authoritative values. Correct fix — removing the merge point entirely is stronger than reordering it.
ISO calendar validation for offset timestamps (prior Medium finding) — RESOLVED. The round-trip check now always executes (Date.UTC(year, month-1, day) compared against parsed year/month/day), regardless of whether the match has Z or a +hh:mm/-hh:mm offset. Tests confirm both valid offset timestamps (+05:00, -04:00) parse correctly and invalid calendar dates (2026-02-31 with +05:00 and -07:00) are rejected. This is a sound approach — validating the calendar date independent of the clock/offset component avoids the timezone-shift bug the previous version had.
Confidential metadata sanitization — PASS, same residual note as before (Low, non-blocking). SENSITIVE_CONFIDENTIAL_KEYS remains a fixed denylist (now expanded with homepage, link, profileUrl, sourceLink, etc.). This is a reasonable incremental hardening and is well-tested for nested objects/arrays, but any future field name outside the set (e.g. repo, portfolioUrl, sourceRef) would still pass through unfiltered on a confidential record. Not a blocker — this was flagged as low severity previously and the fix direction (expand denylist) is consistent with what was implied — but if this module handles increasingly varied source types, an allowlist-based approach would close this class of gap permanently rather than incrementally.
Source lifecycle bypass — PASS. Gating unchanged, all branches (SOURCE_NOT_REGISTERED, SOURCE_MISMATCH, SOURCE_INELIGIBLE, all rejected statuses) tested.
No wall-clock dependency — PASS. processedAt remains mandatory and validated; missing/invalid cases tested.
Deterministic IDs & idempotency — PASS. End-to-end replay test (deepStrictEqual(run1, run2)) still present and passing against this version.
Deep immutability — PASS. deepFreeze applied to full return value; mutation attempts on discoveryRecord, provenance, and metadata all confirmed to throw.
Source-agnostic / no TrustMRR coupling, no SOURCE_CLAIM→FACT path — PASS. Confirmed via the generic hiring-board test; financials remains absent from the module entirely.
Hidden DB/network I/O, accidental activation — PASS. No I/O or lifecycle mutation introduced.

No further changes required. This package is approved as of commit 4fb55eb.

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