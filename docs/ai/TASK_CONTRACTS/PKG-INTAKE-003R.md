# TASK CONTRACT: PKG-INTAKE-003R

## 1. Overview
- **Package ID**: `PKG-INTAKE-003R`
- **Title**: Discovery Intake Determinism & Source-Agnostic Hardening
- **Role**: Backend & Infrastructure Lead (GLM-5.3 & Antigravity), Final Critical Review (Claude Sonnet 5)
- **Status**: Implemented & Verified

---

## 2. Hardened Invariants & Architecture
1. **Clock Dependency Removed**: `processedAt` is a mandatory required ISO 8601 parameter; no internal `new Date().toISOString()` fallback.
2. **Zero Provenance Fabrication**: No synthetic defaults (`"unknown-collector"`, `"1.0.0"`); missing fields are preserved as `null`.
3. **Source-Agnostic Architecture**: Zero hardcoded coupling to `financials`, `mrr`, or source-specific metric paths.
4. **Strict ISO Timestamp Validation**: Validates syntax, format, and calendar correctness for all timestamps (`discoveredAt`, `retrievedAt`, `processedAt`).
5. **Recursive Confidential Isolation**: Recursively traverses nested objects and arrays to strip any confidential URLs or domain references when `is_confidential: true`.
6. **Explicit Idempotency Key Validation**: Validates `idempotencyKey` syntax if provided; deterministically derives `${sourceId}:${canonicalUrl}` when omitted.
7. **Deep Immutability**: All produced discovery records and audit events are recursively frozen (`deepFreeze`).
