# TASK CONTRACT: PKG-WORKER-014

## 1. Overview
- **Package ID**: `PKG-WORKER-014`
- **Title**: Discovery Worker Runtime, Task Execution Engine & Failure Isolation
- **Role**: Worker Runtime Architect & Systems Engineer (GLM-5.3 & Antigravity)
- **Status**: Implemented & Verified

---

## 2. Invariants & Worker Runtime Specifications
1. **WORK-I001 through WORK-I005 (Task Contract & State Model)**: Immutable `WorkerTask` structure with explicit state transitions (`PENDING`, `RUNNING`, `SUCCEEDED`, `RETRYABLE_FAILURE`, `FINAL_FAILURE`, `EXHAUSTED`, `REJECTED`).
2. **WORK-I006 through WORK-I010 (Failure Taxonomy & Retry Policy)**: Distinguishes `TRANSIENT_TRANSPORT`, `RATE_LIMIT_PRESSURE`, `TECHNICAL_FAILURE` (retryable) from `ACCESS_CONFIGURATION_FAILURE`, `POLICY_ACCESS_FAILURE`, `DOMAIN_VALIDATION_FAILURE` (final non-retryable).
3. **WORK-I011 & WORK-I012 (Deterministic Exponential Backoff)**: Policy version `worker-retry-v1` with bounded exponential backoff and explicit `retryAfterMs` honor.
4. **WORK-I015 & WORK-I016 (Failure Isolation & Containment)**: Individual task exceptions never crash the worker runtime loop; task failures are normalized.
5. **WORK-I017 through WORK-I020 (Telemetry, Redaction & Cardinality)**: Span creation, metric counters with bounded labels only (`taskId` strictly barred from metric labels), and automated secret/password masking.
6. **WORK-I022 & WORK-I023 (Source Agnostic & Governance Decoupling)**: Zero source-specific conditionals; worker execution never mutates source lifecycle status.
7. **WORK-I024 through WORK-I027 (Lease & Queue Boundary)**: Conceptual lease fields defined (`claimedBy`, `claimedAt`, `leaseExpiresAt`); distributed lease and production broker claims accurately marked `NOT_RUN / NOT_DURABLE`.
