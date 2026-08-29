# TASK CONTRACT: PKG-EVAL-007R

## 1. Overview
- **Package ID**: `PKG-EVAL-007R`
- **Title**: Source Health Evaluation Completeness & Confidence Hardening
- **Role**: Backend & Infrastructure Lead (GLM-5.3 & Antigravity)
- **Status**: Implemented & Verified

---

## 2. Invariants & Hardened Evaluation Semantics
1. **EVAL-R001 (Explicit Observation Window)**: Requires mandatory `windowStart` and `windowEnd` (`windowStart < windowEnd`); filters observation data deterministically within interval.
2. **EVAL-R002 (UNKNOWN First-Class)**: Insufficient evidence (e.g. 0 observations) produces `UNKNOWN` health, `UNKNOWN` contribution, and `NONE` confidence.
3. **EVAL-R003 (Separate Operational Health)**: Evaluates technical transport reliability independently of data value.
4. **EVAL-R004 (Separate Intelligence Contribution)**: Evaluates business/data value (yield, duplicate rate) independently of technical uptime.
5. **EVAL-R005 & EVAL-R006 (Confidence Model & Minimum Sample Awareness)**: Sample sufficiency policy produces explicit confidence (`NONE`, `LOW`, `MEDIUM`, `HIGH`).
6. **EVAL-R007 (Failure Taxonomy)**: Distinguishes `TECHNICAL_FAILURE` (5xx), `RATE_LIMIT_PRESSURE` (429), `ACCESS_CONFIGURATION_FAILURE` (401/403), and `POLICY_ACCESS_FAILURE`.
7. **EVAL-R008 (Formula & Evaluation Versioning)**: Exposes both `evaluationVersion="source-health-v1"` and `formulaVersion="source-health-formula-v1"`.
8. **EVAL-R009 (Order Independence)**: Output snapshot is 100% invariant to input observation ordering.
9. **EVAL-R010 (Deterministic Replay)**: 100% deep-equal deterministic replay.
10. **EVAL-R011 (Read-Only Governance)**: Generates governance recommendations (`NO_CHANGE`, `INVESTIGATE`, `DOWNRANK`, `PAUSE_RECOMMENDED`, `RECOVERY_CANDIDATE`) without mutating SourceRegistry state.
