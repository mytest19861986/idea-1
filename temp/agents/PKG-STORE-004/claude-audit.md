# PKG-STORE-004: Final Audit from Claude Sonnet 5

PKG-STORE-004.md returned a 404 when fetched, so this audit is based solely on the inline source/tests provided.)

AUDIT_SUMMARY

The store correctly implements idempotent replay, cross-discoveryId idempotency-key collision rejection, append-only multi-source attribution, and a mandatory-timestamp / zero-I/O design consistent with the rest of this package. However, two real gaps stand out: (1) the dedicated confidentiality-downgrade branch (CONFIDENTIALITY_DOWNGRADE_REJECTED) is unreachable dead code — the generic material-conflict check already short-circuits before it can run, so the specific, more informative audit reason is never actually produced despite being tested-for in spirit; and (2) isMaterialPayloadEqual doesn't compare metadata, summary, or sourceType, meaning a "replay" with materially different metadata for the same identity is silently accepted as an idempotent no-op and the new metadata is discarded rather than flagged as a conflict. Neither is a catastrophic security hole, but both weaken the auditability and data-integrity guarantees this package is explicitly built to provide.

INVARIANT_FINDINGS

STORE-I006 (confidentiality downgrade) — PARTIALLY DEAD CODE (Finding, Medium)
isMaterialPayloadEqual includes is_confidential in its equality check. So the moment is_confidential differs between the stored and incoming record, isMaterialPayloadEqual returns false, and the generic CONFLICT_REJECTED branch fires and returns before the code ever reaches the dedicated if (existing.is_confidential && !candidateRecord.is_confidential) block a few lines down. That block, its CONFIDENTIALITY_DOWNGRADE_REJECTED status, and its more specific audit reason ("Cannot downgrade confidential candidate to public") are unreachable in the current control flow.
The test STORE-I006 passes, but only because it asserts the generic CONFLICT_REJECTED status — which is technically what happens, but it means the test is inadvertently validating that the specific-status code path is dead, not that it works. This matters because downstream consumers (alerting, dashboards, audit review) presumably want to distinguish "someone tried to unmask a confidential entity" from "some unrelated field changed," and right now both produce an identical generic reason string.
Fix: move the confidentiality-downgrade check before the generic isMaterialPayloadEqual check (or exclude is_confidential from isMaterialPayloadEqual and check it separately first), and add a test that specifically asserts status === "CONFIDENTIALITY_DOWNGRADE_REJECTED" for a downgrade attempt to confirm the dedicated path is actually exercised.
Metadata/summary/sourceType excluded from conflict detection — GAP (Finding, Medium)
isMaterialPayloadEqual only compares discoveryId, sourceId, canonicalUrl, title, is_confidential, and contentReference. It does not compare metadata, summary, or sourceType. Consequently, if a second intake for the same discoveryId arrives with an unchanged title/contentReference/confidentiality but substantively different metadata (e.g. updated salaryRange, different skills, different sanitized fields) or a different summary, the store treats it as STORE-I001 idempotent replay, returns the original stored record, and silently discards the new metadata — with no conflict, no audit trail entry beyond a generic DISCOVERY_CANDIDATE_REPLAYED event, and no way for a caller to know their update was dropped.
This may be intentional (candidates are meant to be append-only/immutable and only attribution should carry updates), but as written it's undocumented and untested, and it's the kind of silent-data-loss behavior the checklist's "silent overwrite" item is specifically meant to guard against — here it's a silent non-overwrite that's equally surprising. Either broaden isMaterialPayloadEqual to cover metadata/summary (and route mismatches to CONFLICT_REJECTED like everything else), or explicitly document that metadata is immutable-on-replay and add a test proving that a metadata-only diff on an otherwise-identical candidate results in a defined, intentional outcome rather than an implicit one.
Identity consistency between discoveryId and sourceId/canonicalUrl — GAP (Finding, Low/Medium)
assertCandidateRecord validates that discoveryId, sourceId, and canonicalUrl are each non-empty strings, but never checks that discoveryId actually equals disc:${sourceId}:${canonicalUrl} (the format computeDeterministicDiscoveryId produces upstream). getCandidateBySourceIdentity independently recomputes that exact string to do its lookup. If a malformed or hand-constructed candidate record is ever stored with a discoveryId that doesn't match its own sourceId/canonicalUrl pair (e.g. from a bug elsewhere, or a caller bypassing processDiscoveryIntake), it would be stored successfully under getCandidateById but become permanently unreachable via getCandidateBySourceIdentity. Not exploitable for corruption, but it's a silent-inconsistency trap with no validation and no test coverage. Consider asserting discoveryId === computeDeterministicDiscoveryId(sourceId, canonicalUrl) in assertCandidateRecord.
STORE-I005 (SOURCE_CLAIM promotion prevention) — STALE / VACUOUS DOCUMENTATION (Finding, Low)
The class docstring still lists "STORE-I005: Prevents claim promotion" among enforced invariants, but the financials/claim_type concept was removed from the candidate schema entirely in PKG-INTAKE-003R (the generic intake module no longer produces financials). There's nothing in this module that could promote a claim because the field doesn't exist here. This isn't a functional defect, but the stale doc comment overstates what's actually enforced and should be updated or removed to avoid future confusion about where claim-type integrity is actually guaranteed (presumably a source-specific layer, if one still exists).
STORE-I001 idempotent replay — PASS. Exact-payload replay correctly returns the original stored record unchanged, confirmed by deepStrictEqual.
STORE-I002 material conflict rejection — PASS for the tested case (title change under same idempotency key), modulo Finding 2's narrower-than-expected definition of "material."
STORE-I003 cross-discoveryId idempotency-key collision — PASS. Correctly rejected with IDEMPOTENCY_COLLISION and a clear reason identifying the conflicting discoveryId.
STORE-I004 append-only multi-source attribution — PASS. Attribution list is genuinely append-only (private #attributions Map, list mutated via push, never replaced); duplicate sourceId+canonicalUrl attribution is correctly detected and replayed rather than duplicated; primary attribution from putCandidate and secondary from appendAttribution both present and ordered correctly in the test.
STORE-I007 provenance preservation — PASS for the fields captured in initialAttribution (collectorId/Version, discoveredAt/retrievedAt/intakeProcessedAt) — correctly sourced from candidateRecord.provenance with null fallbacks, no fabrication.
STORE-I008 source-agnostic / zero TrustMRR coupling — PASS. No source-specific branching or field names anywhere in the module.
Hidden clock dependency — PASS. at is mandatory and validated via validateIsoTimestamp on both putCandidate and appendAttribution; missing/invalid cases tested for putCandidate (not explicitly tested for appendAttribution, but the code path is identical — low-risk gap, worth a quick test for completeness).
Hidden DB/network side effects — PASS. Pure in-memory Map-backed adapter; no I/O of any kind.
Deep immutability — PASS. All returned records, audit events, and attribution entries are passed through deepFreeze; getAttributionHistory and getAuditEvents return frozen copies of the underlying arrays rather than live references, correctly preventing external mutation of internal state.

Required before APPROVED:

Reorder or restructure the confidentiality-downgrade check so CONFIDENTIALITY_DOWNGRADE_REJECTED is actually reachable, and add a test asserting that specific status (not just the generic CONFLICT_REJECTED) fires for a downgrade attempt.
Decide and document the intended behavior when metadata/summary/sourceType differ on an otherwise-identical replay; adjust isMaterialPayloadEqual and/or add a test to lock in the intended semantics rather than leaving it as an implicit silent-replay side effect.

Recommended, non-blocking:

Validate discoveryId === computeDeterministicDiscoveryId(sourceId, canonicalUrl) in assertCandidateRecord.
Update the class docstring to drop the stale STORE-I005 reference, or clarify where claim-type integrity is actually enforced in the broader system.
Add a missing-at/invalid-at test for appendAttribution to match the coverage already present for putCandidate.





1 minute ago
Write a message…







Claude is AI and can make mistakes. Please double-check responses.
Sonnet 5 Low