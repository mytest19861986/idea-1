# TASK CONTRACT: PKG-STORE-004

## 1. Overview
- **Package ID**: `PKG-STORE-004`
- **Title**: Discovery Candidate Storage & Attribution Invariants
- **Role**: Backend & Infrastructure Lead (Implementation), Final Critical Review (Claude Sonnet 5)
- **Status**: Implemented & Verified

---

## 2. Invariants & Storage Boundaries
1. **STORE-I001 (Logical Uniqueness & Idempotency)**: Replaying the same candidate with identical payload is 100% idempotent and returns the existing record without duplication.
2. **STORE-I002 (Conflict Detection)**: Replaying the same discovery ID or idempotency key with conflicting material properties triggers explicit `CONFLICT_REJECTED` status and emits `DISCOVERY_STORAGE_CONFLICT_REJECTED` audit event.
3. **STORE-I003 (Immutable Identity)**: Identity cannot be modified after initial storage.
4. **STORE-I004 (Append-Only Attribution)**: Attributions are strictly append-only; multiple sources can contribute independent attributions to a single candidate.
5. **STORE-I005 (Claim Integrity)**: Source claims cannot be promoted to facts in the storage layer.
6. **STORE-I006 (Confidentiality Round-Trip)**: Confidential candidates remain strictly confidential; attempts to overwrite with public references fail closed.
7. **STORE-I007 (Provenance Round-Trip)**: Complete source provenance is preserved across all primary and secondary attributions.
8. **STORE-I008 (Source-Agnostic Storage)**: Zero source-specific, financial, or TrustMRR logic in generic candidate storage.
9. **Zero Production Mutation**: `POSTGRES_CONNECTION=NO`, `NETWORK_REQUESTS=0`, `SOURCE_ACTIVATION=NO`, `AI_CALLS=0`.
