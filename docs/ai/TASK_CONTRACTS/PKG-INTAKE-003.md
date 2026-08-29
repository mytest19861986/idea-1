# TASK CONTRACT: PKG-INTAKE-003

## 1. Overview
- **Package ID**: `PKG-INTAKE-003`
- **Title**: Controlled Discovery Intake & Registry Transition
- **Role**: Backend & Infrastructure Lead (Implementation), Research Support (Gemini), Final Audit (Claude)
- **Status**: Implemented & Verified

---

## 2. Ingestion Pipeline & Invariants
```
RawDocument
   ↓
[validateRawDocument] (HTTPS schema, timestamp & structure validation)
   ↓
[Source Registry Check] (Verify sourceId exists in registered sources)
   ↓
[isSourceEligibleForIntake] (State Gate: APPROVED or ACTIVE only)
   ↓
[computeDeterministicDiscoveryId] (disc:{sourceId}:{canonicalUrl})
   ↓
[processDiscoveryIntake] (Preserves SOURCE_CLAIM, Provenance & Confidential Isolation)
   ↓
CandidateDiscoveryRecord & AuditEvent (Frozen deterministic outputs)
```

---

## 3. Core Boundaries
1. **Generic Architecture**: Zero source-specific hardcoding.
2. **State Gating**: `CANDIDATE`, `DISCOVERED`, `EVALUATING`, `REJECTED`, `RETIRED`, `PAUSED`, `DEGRADED` are blocked from intake.
3. **Deterministic Identity**: `discoveryId = "disc:" + sourceId + ":" + canonicalUrl`.
4. **Invariant Preservation**:
   - Financial metrics tagged `claim_type: "SOURCE_CLAIM"`.
   - Full provenance metadata copied into `provenance` block.
   - Confidential listings have `contentReference: null` and `is_confidential: true`.
5. **Deterministic Audit Events**: `DISCOVERY_INTAKE_ACCEPTED` / `DISCOVERY_INTAKE_REJECTED`.
6. **Zero Side-Effects**: `REAL_NETWORK_REQUESTS=0`, `DATABASE_WRITES=0`, `SOURCE_ACTIVATION=NO`, `SCHEDULER=NO`.
