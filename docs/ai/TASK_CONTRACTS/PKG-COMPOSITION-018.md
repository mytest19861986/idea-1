# TASK CONTRACT: PKG-COMPOSITION-018

## 1. Overview
- **Package ID**: `PKG-COMPOSITION-018`
- **Title**: Standalone Runtime Loop & Pipeline Composition Architecture
- **Role**: Lead Systems Architect & Verification Authority (Antigravity & GLM-5.3)
- **Status**: Implemented & Formally Verified
- **Target Invariants**: `COMP-I001` through `COMP-I040`

---

## 2. Invariants & Scope Boundaries
1. **Composition Root (`COMP-I001` to `COMP-I010`)**:
   - `DiscoveryRuntimeHost` unifies Scheduler, Worker Runtime, Secret Resolver, Collector Registry, Discovery Normalization, Candidate Store, Observation Ledger, and Governance.
2. **Data Plane vs Control Plane Separation (`COMP-I011` to `COMP-I020`)**:
   - **Data Plane** (`runScheduledDiscoveryCycle`): Evaluates scheduling eligibility, creates `WorkerTask`, dispatches to `WorkerRuntime`, resolves credentials atomically, executes collectors, normalizes documents, and stores candidates.
   - **Control Plane** (`runControlPlaneGovernanceCycle`): Gathers observations, evaluates health windows (`evaluateSourceWindow`), and computes governance transitions (`evaluateGovernance`).
3. **Automatic Governance Application Policy**:
   - Strictly defaults to `DISABLED_FOR_PILOT` / `ASSESSMENT_ONLY` to safely defer the durable atomicity gap `DB-GOV-STATE-001`.
4. **Single Source Failure Isolation (`COMP-I032`)**:
   - Failure of Source A (e.g. transient 500 error or auth error) does not prevent independent eligible Source B from executing.
5. **Replay, Idempotency & Provenance Chains (`COMP-I035` to `COMP-I037`)**:
   - Deterministic `slotId` replay protection in scheduling.
   - Deterministic candidate deduplication by `canonicalUrl`.
   - `SOURCE_CLAIM_TO_FACT_SILENT_UPGRADE=NONE`.
   - `CONFIDENTIAL_LISTING_STRICT_ISOLATION=PROVEN`.
