# TASK CONTRACT: PKG-PIPELINE-006

## 1. Overview
- **Package ID**: `PKG-PIPELINE-006`
- **Title**: End-to-End Discovery Pipeline Integration & State Flow
- **Role**: Backend & Infrastructure Lead (GLM-5.3 & Antigravity)
- **Status**: Implemented & Verified

---

## 2. Pipeline Composition & Invariants
1. **PIPELINE-I001 (Stage Order)**: Strictly executes `INTAKE` -> `STORE` -> `RESOLUTION`. Downstream stages never run if an earlier stage fails.
2. **PIPELINE-I002 (Fail-Closed Execution)**: Partial failures prevent downstream execution and are explicitly reflected in the envelope status (`REJECTED_AT_INTAKE`, `CONFLICT_AT_STORE`, `RESOLUTION_BLOCKED`).
3. **PIPELINE-I003 (Explicit Execution Context)**: Requires mandatory ISO timestamp `at` and `executionId`. Zero hidden wall-clock reads.
4. **PIPELINE-I004 (Idempotent Replay)**: Duplicate invocations produce identical candidate records and trigger `REPLAYED` store status without duplicate candidate or attribution creation.
5. **PIPELINE-I005 (Stage Result Envelope)**: Returns structured envelope with granular `stages.intake`, `stages.store`, and `stages.resolution` statuses.
6. **PIPELINE-I006 (Audit Correlation)**: All audit events generated during execution carry the correlation `executionId`.
7. **PIPELINE-I007 (Fact vs Claim Boundary)**: No stage promotes `SOURCE_CLAIM` to `FACT`.
8. **PIPELINE-I008 (Confidentiality Transit)**: Confidential entities remain strictly isolated throughout intake, store, and resolution transit.
9. **PIPELINE-I009 (Optional Resolution)**: `UNRESOLVED`, `POSSIBLE`, `PROBABLE`, `DISTINCT`, and `BLOCKED` resolution outcomes are valid and do not fail the pipeline.
10. **PIPELINE-I010 (Explicit Context)**: Operates only on explicitly supplied resolution candidate context without unbounded scanning or network requests.
11. **PIPELINE-I011 (Zero Source-Specific Logic)**: Zero source-specific branching inside generic orchestration.
12. **PIPELINE-I012 (Immutable Stage Outputs)**: Inputs and outputs are deep-frozen and immutable.
