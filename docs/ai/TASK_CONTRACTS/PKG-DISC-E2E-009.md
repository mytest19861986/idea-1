# TASK CONTRACT: PKG-DISC-E2E-009

## 1. Overview
- **Package ID**: `PKG-DISC-E2E-009`
- **Title**: End-to-End Discovery Pipeline with Automated Governance Lifecycle Integration
- **Role**: Backend & Infrastructure Lead (GLM-5.3 & Antigravity)
- **Status**: Implemented & Verified

---

## 2. Invariants & System Integration Boundaries
1. **E2E-I001 (Data / Control Plane Separation)**: Data Plane (Discovery intake, candidate storage, entity resolution) executes independently of the Control Plane (Source health assessment and governance state machine).
2. **E2E-I002 (Deterministic Observation Adapters)**: Transforms pipeline results into normalized observations (`sourceId`, `statusCode`, `yieldCount`, `duplicateCount`, `uniqueCount`, `occurredAt`) with deterministic `observationId`.
3. **E2E-I003 (Confidentiality Protection in Observations)**: Observations never include stripped confidential URLs, domains, or identifying candidate metadata.
4. **E2E-I004 (Governance Gates Future Intake)**: State transitions (e.g. `ACTIVE -> PAUSED`) immediately gate future discovery intake attempts without lagging caches.
5. **E2E-I005 (Historical Candidate Immutability)**: Existing stored candidates remain intact and immutable across source state transitions.
6. **E2E-I006 (Reversible Automated Transition Execution)**: Only transitions classified as `AUTOMATED_OPERATIONAL_REVERSIBLE` in PKG-GOV-008 are applied automatically.
7. **E2E-I007 (Stale Decision Propagation)**: Stale decisions reject cleanly with `STALE_DECISION` without silent retries.
8. **E2E-I008 (Manual Review Boundary)**: Manual review decisions (`REQUIRE_MANUAL_REVIEW`, `INVESTIGATE`) stop at the decision boundary and never mutate SourceRegistry.
9. **E2E-I009 (Zero Fabricated Observations)**: Discovery failures emit genuine failure observations without fabricating success.
10. **E2E-I014 (System Replay Idempotency)**: Replay across identical inputs, timestamps, and execution context yields 100% identical system output with zero duplicate entities.
11. **E2E-I018 (Source Agnostic)**: Purely generic logic with zero source-specific hardcoding.
