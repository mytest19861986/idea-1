# TASK CONTRACT: PKG-GOV-008

## 1. Overview
- **Package ID**: `PKG-GOV-008`
- **Title**: Source Governance & Automated Lifecycle State Transition Gate
- **Role**: Backend & Infrastructure Lead (GLM-5.3 & Antigravity)
- **Status**: Implemented & Verified

---

## 2. Invariants & Governance State Transition Rules
1. **GOV-I001 (Lifecycle State Consistency)**: Reuses canonical `SourceStatus` states without inventing ad-hoc statuses.
2. **GOV-I002 (Governance Policy Versioning)**: Explicitly tagged with `governancePolicyVersion="source-governance-policy-v1"`.
3. **GOV-I003 (Reversible Operational Transitions)**: Only automates operational, reversible transitions (`ACTIVE <-> DEGRADED`, `ACTIVE <-> LOW_PRIORITY`, `ACTIVE <-> PAUSED`).
4. **GOV-I004 (Confidence Gate)**: Automated transitions strictly require `confidence === "HIGH"`.
5. **GOV-I005 (Hysteresis Protection)**: Degradation and recovery require configurable consecutive matching health snapshots (preventing flip-flop oscillations).
6. **GOV-I006 (Cooldown Gate)**: Transitions enforce minimum elapsed time between state changes on the same source.
7. **GOV-I007 & GOV-I008 (Health vs Contribution Independence)**: Differentiates technical downtime (`PAUSED`/`DEGRADED`) from low information value (`LOW_PRIORITY`).
8. **GOV-I009 (Access & Policy Exception Handling)**: `ACCESS_CONFIGURATION_FAILURE` triggers `INVESTIGATE` without auto-penalty; `POLICY_ACCESS_FAILURE` requires manual review without automatic reactivation.
9. **GOV-I010 (Prohibition of Automated Activation)**: `APPROVED -> ACTIVE` strictly requires manual authorization.
10. **GOV-I011 (Prohibition of Automated Rejection/Retirement)**: `* -> REJECTED` and `* -> RETIRED` strictly require manual governance approval.
11. **GOV-I012 (Decision Envelope Integrity)**: Emits complete, immutable `GovernanceDecision` envelopes.
12. **GOV-I013 (Evaluation / Mutation Separation)**: `evaluateGovernance(...)` is pure and read-only; mutations execute via `SourceGovernanceApplier`.
13. **GOV-I014 (Optimistic State Verification)**: Validates `expectedCurrentState === actualCurrentState`; rejects stale decisions (`STALE_DECISION`).
14. **GOV-I015 (Idempotent Application)**: Repeated application of identical `decisionId` produces `REPLAYED` status.
15. **GOV-I016 (Immutable Audit Log)**: Emits structured, timestamped audit events (`SOURCE_TRANSITION_APPLIED`, `SOURCE_TRANSITION_BLOCKED`, `SOURCE_GOVERNANCE_DECISION_STALE`).
