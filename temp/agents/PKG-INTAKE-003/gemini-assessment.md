# PKG-INTAKE-003: Metadata Assessment from Gemini 3.7 Flash

PKG-INTAKE-003

ROLE=Research Support

TASK=INTAKE_METADATA_INTELLIGENCE_COMPLETENESS_CHECK




Review whether the proposed Discovery Intake record schema preserves all essential fields for downstream Opportunity Intelligence:

1. Canonical source identity (sourceId, sourceBaseUrl)

2. Retrieval timestamp & processing audit trail (retrievedAt, discoveredAt, intakeProcessedAt)

3. Source item identity (canonicalUrl, externalId, idempotencyKey)

4. Full provenance & verification audit trail (verified_by, verified_status, collector metadata)

5. Claim classification (SOURCE_CLAIM invariant preserved, no promotion to FACT)

6. Source URL & Content reference (contentReference nullified for confidential listings, preserved for public)

7. Confidential entity isolation (is_confidential marker, stealth indicators)




OUTPUT FORMAT:

Return a concise INTAKE_METADATA_ASSESSMENT highlighting any missing fields or potential intelligence gaps.

NO CODE.

Gemini said




Flash

Gemini is AI and can make mistakes, including about people. Your privacy & Gemini
Opens in a new window