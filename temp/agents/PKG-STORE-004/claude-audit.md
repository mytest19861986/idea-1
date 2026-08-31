# PKG-STORE-004: Final Audit from Claude Sonnet 5

PKG-STORE-004 (Final Audit Resolution)

DECISION: APPROVED

AUDIT_SUMMARY

The confidentiality-isolation gap identified in the previous review is correctly closed: appendAttribution now looks up the target candidate's is_confidential flag (and also honors an is_confidential flag on the incoming attribution itself, which is a sensible conservative OR), nullifies contentReference, and recursively sanitizes metadata using the same sanitizeConfidentialRecursively helper the intake module already relies on — keeping the confidentiality contract consistent across both entry points. This is backed by a direct regression test that attempts exactly the leak previously described (a live contentReference plus domain/websiteUrl under metadata) and confirms all three are stripped while an unrelated safe field survives. Combined with the fixes from the prior two rounds — downgrade-check reordering, full material-payload equality including metadata, and discoveryId canonical-format enforcement — this package now has no open findings from the review chain. One narrow, non-blocking scope note below for future awareness, but nothing that should hold up approval.

INVARIANT_FINDINGS

appendAttribution confidentiality isolation — RESOLVED. isConfidential = Boolean(candidate.is_confidential || attribution.is_confidential) correctly gates on the stored candidate's confidentiality (not just whatever the caller claims), contentReference is nulled, and attribution.metadata is passed through sanitizeConfidentialRecursively before being merged in. The new test directly exercises this against a confidential candidate and checks all three previously-leakable fields (contentReference, metadata.domain, metadata.websiteUrl) are absent, while metadata.safeDescription correctly survives — good evidence the sanitizer isn't over-broad.
Sanitization scope is limited to contentReference + metadata (Note, Low, non-blocking). The fix spreads ...attribution first and only overrides contentReference/metadata/is_confidential/attributedAt — so a sensitive field placed at the top level of the attribution object (e.g. attribution.homepage = "..." instead of attribution.metadata.homepage) would pass through unsanitized. This mirrors the exact same scoping assumption already established in discovery-intake.mjs (where sensitive fields are expected to live under metadata by contract, not at the top level of RawDocument), so it's consistent with the existing design rather than a new deviation — not something this fix introduced. Worth keeping in mind if the attribution schema is ever loosened to allow arbitrary top-level fields, but not a reason to block here.
STORE-I001 idempotent replay — PASS. Unchanged and still correctly tested with a metadata-bearing candidate.
STORE-I002 material conflict (incl. metadata) — PASS. Unchanged from the prior approved fix.
STORE-I003 idempotency-key collision — PASS. Unchanged.
STORE-I004 append-only, non-destructive attribution — PASS. Confirmed still append-only and duplicate-safe; now also confidentiality-safe per Finding 1.
STORE-I006 confidentiality downgrade (putCandidate) and isolation (appendAttribution) — PASS. Both entry points now enforce the same guarantee, with dedicated tests for each.
STORE-I007 provenance preservation — PASS. Unaffected by this change; still correctly sourced with null fallbacks and no fabrication.
STORE-I008 source-agnostic design — PASS. No source-specific coupling anywhere in this revision.
discoveryId canonical-format consistency — PASS. Still enforced and tested from the prior round.
Hidden clock dependency, hidden DB/network I/O, deep immutability — PASS. No regressions; all mutation entry points (putCandidate, appendAttribution) still require an explicit, validated at, still zero I/O, and all returned/stored structures remain deep-frozen, including the newly-sanitized attribution records.

No further changes required. This package is approved as of commit 81d2503.






just now
Write a message…







Claude is AI and can make mistakes. Please double-check responses.
Sonnet 5 Low