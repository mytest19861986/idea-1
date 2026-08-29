# TASK CONTRACT: PKG-PERSIST-011

## 1. Overview
- **Package ID**: `PKG-PERSIST-011`
- **Title**: Discovery Core Production Persistence Contract & Relational Schema
- **Role**: Backend Systems Architect & Persistence Lead (GLM-5.3 & Antigravity)
- **Status**: Implemented & Verified

---

## 2. Invariants & Persistence Specifications
1. **PERSIST-I001 (Interface Separation)**: Explicit port interfaces for Candidate, Resolution, Observation, Health, and Governance.
2. **PERSIST-I002 (Domain/Database Decoupling)**: Database structures do not dictate in-memory domain structures.
3. **PERSIST-I003 (Additive Relational Schema)**: Clean additive PostgreSQL DDL with strict unique constraints (`canonical_url`, `idempotency_key`, `pair_identity`, `observation_id`, `decision_id`).
4. **PERSIST-I004 (Candidate & Attribution Identity)**: Content-addressed candidate identity with append-only attribution trails.
5. **PERSIST-I005 (Observation Ledger Immutability)**: Uniqueness on `observation_id` prevents double-counting observations on replay.
6. **PERSIST-I006 (Governance Decision/Application Decoupling)**: Decision persistence separates from state application, preventing partial mutations.
7. **PERSIST-I007 (Confidentiality & Provenance Round-Trip)**: Confidential listings remain sanitized after storage; raw claims (`SOURCE_CLAIM`) and provenance preserved exactly.
8. **PERSIST-I008 (Deterministic Timestamp Authority)**: Domain timestamps are preserved without replacing them with database `NOW()`.
9. **PERSIST-I009 (Source Agnostic)**: Purely generic persistence without source-specific TrustMRR coupling.
